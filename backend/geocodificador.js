/* ============================================================================
   backend/geocodificador.js  —  DE UNA DIRECCIÓN A UNA COORDENADA
   ----------------------------------------------------------------------------
   Sección 9.2 del pliego: "La ubicación de cada local se obtiene geocodificando
   su dirección declarada. Es la única fuente válida de la coordenada del
   padrón: alimenta el mapa, el ruteo de notificaciones y cualquier análisis
   territorial."

   >>> LO QUE HABÍA ANTES INVENTABA LAS COORDENADAS <<<
   La función `geocodificar` de src/dominio/geo.js calcula un hash del texto de
   la dirección y lo convierte en un punto. Es determinista y sirve para que la
   maqueta tenga puntos en el mapa, pero el punto NO tiene relación con la
   dirección real: "Chacabuco 192" podía caer en cualquier lado.

   Mientras el backend usó esa función, toda alta de local guardaba una
   ubicación inventada. Este módulo la reemplaza por una geocodificación de
   verdad.

   >>> POR QUÉ NOMINATIM <<<
   Es el geocodificador de OpenStreetMap: gratuito, sin clave y sin cuenta, lo
   mismo que ya se eligió para el mapa. Su política de uso pide dos cosas que
   este módulo respeta:
     - un User-Agent que identifique a quién pregunta
     - como máximo una consulta por segundo

   Si el municipio tiene su propio geocodificador (el visor mapa.smt.gob.ar
   sugiere que sí), se cambia `consultarNominatim` por esa llamada y el resto
   queda igual.

   >>> LA VALIDACIÓN NO ES OPCIONAL <<<
   Toda coordenada obtenida se valida contra el polígono del ejido. La que cae
   afuera NO se guarda: el local queda sin ubicación y aparece en la vista de
   revisión, como pide el pliego. No se completa con un valor aproximado ni con
   la coordenada del relevamiento.
   ============================================================================ */

import { LIMITE_ES_OFICIAL, dentroDelMunicipio } from './limite-municipal.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

/* Nominatim pide identificarse. Si el sistema sale a producción, acá va el
   correo del área: es lo que les permite avisar antes de bloquear si algo
   consulta de más. */
const AGENTE = 'SistemaGrandesGeneradores/1.0 (Municipalidad de San Miguel de Tucuman)';

/* Una consulta por segundo, como pide su política de uso. Las llamadas se
   encolan: la segunda espera a que pase el segundo de la primera. */
const ESPERA_MS = 1100;
let turno = Promise.resolve();

function enFila(trabajo) {
  const resultado = turno.then(trabajo, trabajo);
  turno = resultado.then(
    () => new Promise((r) => setTimeout(r, ESPERA_MS)),
    () => new Promise((r) => setTimeout(r, ESPERA_MS)),
  );
  return resultado;
}

/* El contexto se agrega siempre: sin él, "Chacabuco 192" existe en media
   Argentina y Nominatim devuelve la primera que encuentra. */
const CONTEXTO = 'San Miguel de Tucumán, Tucumán, Argentina';

/* >>> SE PIDEN VARIOS RESULTADOS Y SE ELIGE EL QUE CAE DENTRO <<<
   Muchas calles de la ciudad siguen más allá del ejido: Bernabé Aráoz, Perú o
   Sarmiento cruzan hacia Tafí Viejo o Yerba Buena. Si se pide un solo resultado,
   el geocodificador puede devolver justo el tramo de afuera y el local termina
   dibujado en otro municipio.

   Pedir cinco y quedarse con el primero que cae dentro del polígono NO es
   inventar un punto: es elegir correctamente entre las respuestas que dio el
   servicio. La que no tiene ninguna adentro se rechaza igual. */
const RESULTADOS = 5;

async function consultarNominatim(direccion) {
  const url = new URL(NOMINATIM);
  url.searchParams.set('q', `${direccion}, ${CONTEXTO}`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', String(RESULTADOS));
  url.searchParams.set('countrycodes', 'ar');
  // Acota la búsqueda al entorno de la ciudad. Es un filtro previo del servicio,
  // no reemplaza la validación contra el polígono.
  url.searchParams.set('viewbox', '-65.30,-26.75,-65.10,-26.92');
  url.searchParams.set('bounded', '1');

  const respuesta = await fetch(url, { headers: { 'User-Agent': AGENTE, 'Accept-Language': 'es' } });
  if (!respuesta.ok) throw new Error(`El geocodificador respondió ${respuesta.status}`);
  const datos = await respuesta.json();
  if (!datos.length) return null;

  const puntos = datos.map((d) => ({ latitud: Number(d.lat), longitud: Number(d.lon) }));
  const adentro = puntos.find((p) => dentroDelMunicipio(p.latitud, p.longitud));

  // Si ninguno cae dentro se devuelve el primero igual, para que el mensaje de
  // abajo pueda decir que la dirección existe pero está fuera del municipio.
  // No se guarda: lo rechaza la validación.
  return adentro ?? puntos[0];
}

/* ============================================================================
   geocodificar(direccion)
   ----------------------------------------------------------------------------
   Devuelve { ok: true, latitud, longitud } o { ok: false, motivo }.

   El `motivo` se guarda en el local y se muestra en la pantalla de revisión,
   así que está redactado para que un agente entienda qué hacer con él.
   ============================================================================ */
export async function geocodificar(direccion) {
  const texto = String(direccion || '').trim();

  if (!texto) return { ok: false, motivo: 'Sin dirección declarada.' };
  if (!/\d/.test(texto)) {
    return { ok: false, motivo: 'La dirección no tiene altura. No se puede geocodificar.' };
  }

  let punto;
  try {
    punto = await enFila(() => consultarNominatim(texto));
  } catch (e) {
    // Un fallo del servicio NO es una dirección mal escrita: se distingue para
    // que el agente no salga a corregir una dirección que está bien.
    return { ok: false, motivo: `No se pudo consultar el geocodificador (${e.message}). Reintentar más tarde.` };
  }

  if (!punto) {
    return { ok: false, motivo: 'El geocodificador no encontró esta dirección en San Miguel de Tucumán.' };
  }

  if (!dentroDelMunicipio(punto.latitud, punto.longitud)) {
    /* Mientras el límite sea el polígono provisorio, una coordenada de afuera
       puede ser un error del polígono y no del dato. Se dice en el motivo para
       que el agente sepa que tiene que mirarlo, en vez de dar por sentado que
       la dirección está mal. */
    return {
      ok: false,
      motivo: LIMITE_ES_OFICIAL
        ? 'La coordenada cae fuera del ejido municipal. Se descarta.'
        : 'La coordenada cae fuera del ejido según el límite provisorio. Revisar (falta cargar el KML oficial).',
    };
  }

  return {
    ok: true,
    latitud: Number(punto.latitud.toFixed(6)),
    longitud: Number(punto.longitud.toFixed(6)),
  };
}
