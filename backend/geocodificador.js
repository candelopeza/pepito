/* ============================================================================
   backend/geocodificador.js  —  DE DÓNDE SALE LA COORDENADA DEL PADRÓN
   ----------------------------------------------------------------------------
   La ubicación oficial de un local se obtiene geocodificando su dirección
   declarada (sección 9.2 del pliego). Todas las rutas que escriben
   latitud_local / longitud_local pasan por acá.

   >>> EL MODO SE ELIGE EN EL .env <<<
   Este archivo junta dos trabajos que avanzaron en paralelo: la interfaz
   configurable (modoGeocodificador) y el geocodificador REAL contra Nominatim.

     (sin la variable)           nominatim: el geocodificador de OpenStreetMap,
                                 real y gratuito. Es el modo normal.
     GEOCODIFICADOR=simulado     el inventado de src/dominio/geo.js: un punto
                                 estable a partir del texto. SOLO para una base
                                 de prueba: en la base real guarda coordenadas
                                 falsas que después rutean a los notificadores.
     GEOCODIFICADOR=ninguno      no consulta nada: la dirección queda sin
                                 coordenada y el local aparece en Herramientas →
                                 Geocodificación para revisarlo.

   >>> POR QUÉ NOMINATIM <<<
   Es el geocodificador de OpenStreetMap: gratuito, sin clave y sin cuenta, lo
   mismo que ya se eligió para el mapa. Su política de uso pide dos cosas que
   este módulo respeta:
     - un User-Agent que identifique a quién pregunta
     - como máximo una consulta por segundo (las llamadas se encolan)

   Si el municipio tiene su propio geocodificador (el visor mapa.smt.gob.ar
   sugiere que sí), se agrega acá otro valor de GEOCODIFICADOR y su llamada.
   Las rutas no cambian.

   >>> LA VALIDACIÓN NO ES OPCIONAL <<<
   Toda coordenada obtenida, venga del servicio que venga, se valida contra el
   polígono del ejido (limite-municipal.js). La que cae afuera NO se guarda: el
   local queda sin ubicación y aparece en la vista de revisión, como pide el
   pliego. No se completa con un valor aproximado ni con la coordenada del
   relevamiento.
   ============================================================================ */

import { geocodificar as geocodificarSimulado } from '../src/dominio/geo.js';
import { LIMITE_ES_OFICIAL, dentroDelMunicipio } from './limite-municipal.js';

const MODO = String(process.env.GEOCODIFICADOR ?? '').trim().toLowerCase();

export function modoGeocodificador() {
  if (MODO === 'simulado') return 'simulado';
  if (MODO === 'ninguno') return 'ninguno';
  return 'nominatim';
}

export function geocodificadorConfigurado() {
  return modoGeocodificador() !== 'ninguno';
}

/* ----------------------------------------------------------------------------
   NOMINATIM
   ---------------------------------------------------------------------------- */
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

/* ============================================================================
   >>> SOLO SE GUARDA UN PUNTO SI SE ENCONTRÓ ESA ALTURA EN ESA CALLE <<<
   (24/11/2026) Ambiente detectó que toda dirección sobre la avenida Belgrano,
   fuera cual fuera la altura, quedaba en Belgrano 2642. La causa: cuando
   OpenStreetMap no tiene cargadas las alturas de una calle, Nominatim devuelve
   LA CALLE (o, si tampoco la encuentra, LA CIUDAD), siempre en el mismo punto,
   y este módulo lo guardaba como si fuera la dirección. En la base había 87
   puntos repetidos en 247 locales con direcciones distintas (J. B. Justo,
   Entre Ríos, 9 de Julio, Las Heras, el centro de la ciudad...).
   Ahora:
     1. Se separan calle y altura (partesDeDireccion), con las abreviaturas
        escritas completas. Sin altura no se busca: una esquina o una calle
        sola no es una dirección.
     2. De lo que devuelve Nominatim solo vale un resultado con ESE número de
        puerta (house_number) sobre una calle que se llame como la pedida, y
        dentro del ejido.
     3. Si solo encontró la calle o la ciudad, el local queda SIN ubicación y
        con el motivo, para ubicarlo a mano en Mapa → Geocodificación
        pendiente. Es la regla del pliego: no se completa con un valor
        aproximado.
   ============================================================================ */

const ABREVIATURAS = [
  [/\bAVDA\b\.?/gi, 'Avenida '],
  [/\bAVENIDA\b/gi, 'Avenida '],
  [/\bAV\b\s*[.,]?/gi, 'Avenida '],
  [/\bPJE\b\.?/gi, 'Pasaje '],
  [/\bGRAL\b\.?/gi, 'General '],
  [/\bCNEL\b\.?/gi, 'Coronel '],
  [/\bPTE\b\.?/gi, 'Presidente '],
  [/\bDR\b\.?/gi, 'Doctor '],
];

/* Nombres que se escriben de muchas formas y el mapa no reconoce abreviados. */
const NOMBRES = [
  [/\bJ(?:UAN)?\s*\.?\s*B\s*\.?\s*JUSTO\b/gi, 'Juan B. Justo'],
  [/\bB\s*\.?\s*ARAOZ\b/gi, 'Benjamín Aráoz'],
  [/\bMATE\s*D\s*E\s*LUNA\b/gi, 'Mate de Luna'],
  [/\bA\.?\s+DE\s+LA\s+VEGA\b/gi, 'Adolfo de la Vega'],
  [/\bSOLDATTI\b/gi, 'Soldati'],
];

/* La altura es el PRIMER número que viene después del nombre de la calle,
   salvo que sea parte del nombre ("25 DE MAYO", "9 DE JULIO"). Lo que sigue
   (LOCAL 6, PISO 7, -PB, /290, - GALERIA...) no se usa.
   "AVDA ROCA 2998"               -> { calle: 'Avenida ROCA', altura: '2998' }
   "9 DE JULIO 1.306"             -> { calle: '9 DE JULIO', altura: '1306' }
   "LAVALLE 288/290"              -> { calle: 'LAVALLE', altura: '288' }
   "MUÑECAS 132-LOCAL 6"          -> { calle: 'MUÑECAS', altura: '132' }
   "BULNES1796"                   -> { calle: 'BULNES', altura: '1796' }
   "CHACABUCO Y 24 DE SEPTIEMBRE" -> null (esquina: no hay altura)
   "AVDA LIBANO E ITALIA"         -> null (esquina) */
export function partesDeDireccion(direccion) {
  const t = String(direccion ?? '')
    .replace(/\s+/g, ' ')
    .replace(/(\d)\.(\d{3})\b/g, '$1$2') // 1.306 -> 1306
    .trim();
  const m = /^((?:\d{1,2}\s+DE\s+)?[^\d]*?[A-Za-zÁÉÍÓÚÑÜáéíóúñü.])\s*(\d{1,5})(?!\d)(?!\s*DE\b)/i.exec(t);
  if (!m) return null;
  let calle = m[1].replace(/[.,\s-]+$/, '').trim();
  // Dos calles unidas por "Y" o "E": es una esquina, no una dirección.
  if (/\s(?:Y|E|ESQ\.?)\s/i.test(` ${calle} `)) return null;
  for (const [patron, completo] of [...NOMBRES, ...ABREVIATURAS]) calle = calle.replace(patron, completo);
  calle = calle.replace(/\s+/g, ' ').trim();
  if (!/[A-Za-zÁÉÍÓÚÑ]{3,}/.test(calle)) return null;
  return { calle, altura: String(Number(m[2])) };
}

const PALABRAS_VACIAS = new Set(['avenida', 'av', 'calle', 'pasaje', 'de', 'del', 'la', 'las', 'los', 'el', 'y', 'general', 'doctor', 'presidente', 'coronel']);
const palabras = (t) =>
  String(t ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p && !PALABRAS_VACIAS.has(p));

/* ¿La calle del resultado es la pedida? Alcanza con compartir una palabra que
   distinga ("belgrano", "justo", "roca"), o que una contenga a la otra. */
export function mismaCalle(pedida, encontrada) {
  const a = palabras(pedida);
  const b = palabras(encontrada);
  if (!a.length || !b.length) return false;
  const juntaA = a.join(' ');
  const juntaB = b.join(' ');
  return a.some((p) => p.length >= 3 && b.includes(p)) || juntaA.includes(juntaB) || juntaB.includes(juntaA);
}

/* ¿El número de puerta del resultado es la altura pedida? Acepta un rango
   ("1500-1510") que la contenga. */
function mismaAltura(pedida, numeroDePuerta) {
  const n = Number(pedida);
  const rango = String(numeroDePuerta ?? '').match(/\d+/g)?.map(Number) ?? [];
  if (!rango.length) return false;
  if (rango.length >= 2) return n >= Math.min(rango[0], rango[1]) && n <= Math.max(rango[0], rango[1]);
  return rango[0] === n;
}

async function consultarNominatim({ calle, altura }) {
  const url = new URL(NOMINATIM);
  url.searchParams.set('q', `${calle} ${altura}, ${CONTEXTO}`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', String(RESULTADOS));
  url.searchParams.set('countrycodes', 'ar');
  // Acota la búsqueda al entorno de la ciudad. Es un filtro previo del servicio,
  // no reemplaza la validación contra el polígono.
  url.searchParams.set('viewbox', '-65.30,-26.75,-65.10,-26.92');
  url.searchParams.set('bounded', '1');

  const respuesta = await fetch(url, { headers: { 'User-Agent': AGENTE, 'Accept-Language': 'es' } });
  if (!respuesta.ok) throw new Error(`El geocodificador respondió ${respuesta.status}`);
  const datos = await respuesta.json();
  if (!datos.length) return { punto: null, soloCalle: false };

  const calleDe = (d) => d.address?.road ?? d.address?.pedestrian ?? d.address?.footway ?? d.address?.residential ?? d.name ?? '';
  const exactos = datos
    .filter((d) => mismaAltura(altura, d.address?.house_number) && mismaCalle(calle, calleDe(d)))
    .map((d) => ({ latitud: Number(d.lat), longitud: Number(d.lon) }));
  const adentro = exactos.find((p) => dentroDelMunicipio(p.latitud, p.longitud));
  if (adentro || exactos.length) {
    // Si el exacto cae fuera se devuelve igual, para que el mensaje de abajo
    // diga que está fuera del municipio. No se guarda: lo rechaza la validación.
    return { punto: adentro ?? exactos[0], soloCalle: false };
  }
  // Encontró la calle pero no esa altura (o solo la ciudad): NO es la dirección.
  const soloCalle = datos.some((d) => mismaCalle(calle, calleDe(d)));
  return { punto: null, soloCalle };
}

/* ============================================================================
   geocodificarDireccion(direccion)
   ----------------------------------------------------------------------------
   Devuelve { ok: true, latitud, longitud } o { ok: false, motivo }.

   El `motivo` se guarda en el local y se muestra en la pantalla de revisión,
   así que está redactado para que un agente entienda qué hacer con él.
   ============================================================================ */
export async function geocodificarDireccion(direccion) {
  const modo = modoGeocodificador();

  if (modo === 'ninguno') {
    return { ok: false, motivo: 'No hay geocodificador configurado: la dirección queda pendiente de ubicación.' };
  }

  const texto = String(direccion || '').trim();
  if (!texto) return { ok: false, motivo: 'Sin dirección declarada.' };
  const partes = partesDeDireccion(texto);
  if (!partes) {
    return {
      ok: false,
      motivo: 'La dirección no tiene calle y altura (por ejemplo, es una esquina). Ubicalo a mano en el mapa o corregí la dirección.',
    };
  }

  let punto;
  if (modo === 'simulado') {
    const simulado = geocodificarSimulado(texto);
    if (!simulado.ok) return simulado;
    punto = simulado;
  } else {
    let resultado;
    try {
      resultado = await enFila(() => consultarNominatim(partes));
    } catch (e) {
      // Un fallo del servicio NO es una dirección mal escrita: se distingue para
      // que el agente no salga a corregir una dirección que está bien.
      return { ok: false, motivo: `No se pudo consultar el geocodificador (${e.message}). Reintentar más tarde.` };
    }
    punto = resultado.punto;
    if (!punto) {
      return {
        ok: false,
        motivo: resultado.soloCalle
          ? `El mapa encontró la calle ${partes.calle} pero no la altura ${partes.altura}. Ubicalo a mano en el mapa.`
          : `El mapa no encontró ${partes.calle} ${partes.altura} en San Miguel de Tucumán. Revisá la dirección o ubicalo a mano en el mapa.`,
      };
    }
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

/* El nombre con el que lo importaban las rutas anteriores. Mismo trabajo. */
export { geocodificarDireccion as geocodificar };
