/* ============================================================================
   backend/geocodificador.js  —  DE DÓNDE SALE LA COORDENADA DEL PADRÓN
   ----------------------------------------------------------------------------
   La ubicación oficial de un local se obtiene geocodificando su dirección
   declarada (sección 9.2 del pliego). Todas las rutas que escriben
   latitud_local / longitud_local pasan por acá.

   >>> HOY NO HAY GEOCODIFICADOR REAL <<<
   src/dominio/geo.js trae uno SIMULADO: inventa un punto estable a partir del
   texto de la dirección. Sirve para la maqueta y para probar el mapa, pero
   escribirlo en la base del área es guardar coordenadas falsas que después
   se usan para rutear a los notificadores.

   Por eso el backend NO lo usa salvo que se pida explícitamente en el .env:

     GEOCODIFICADOR=simulado     solo para una base de prueba
     (sin la variable)           no inventa nada: la dirección queda sin
                                 coordenada y el local aparece en Herramientas →
                                 Geocodificación para revisarlo. Es lo que pide
                                 la guía: "No debe completarse con un valor
                                 aproximado".

   CUANDO HAYA UN SERVICIO REAL (el del municipio o uno externo aprobado), se
   agrega acá otro valor de GEOCODIFICADOR y su llamada. Las rutas no cambian.
   La validación contra el ejido municipal (dentroDelMunicipio) se aplica igual
   a cualquier servicio: lo que cae afuera se descarta.
   ============================================================================ */

import { geocodificar as geocodificarSimulado } from '../src/dominio/geo.js';

const MODO = String(process.env.GEOCODIFICADOR ?? '').trim().toLowerCase();

export function modoGeocodificador() {
  return MODO === 'simulado' ? 'simulado' : 'ninguno';
}

export function geocodificadorConfigurado() {
  return modoGeocodificador() !== 'ninguno';
}

/* Misma forma que la función del dominio: { ok, latitud, longitud } o
   { ok: false, motivo }. Es async para que el día que haya un servicio real
   (que responde por red) las rutas no tengan que cambiar. */
export async function geocodificarDireccion(direccion) {
  if (modoGeocodificador() === 'simulado') return geocodificarSimulado(direccion);
  return {
    ok: false,
    motivo: 'No hay geocodificador configurado: la dirección queda pendiente de ubicación.',
  };
}
