/* ============================================================================
   backend/limite-municipal.js  —  EL EJIDO DE SAN MIGUEL DE TUCUMÁN
   ----------------------------------------------------------------------------
   Sección 9.2 del pliego:

     "El sistema debe validar toda coordenada obtenida contra los límites del
      municipio y descartar la que caiga fuera, en lugar de guardarla. La
      Dirección de Ambiente cuenta con la capa de límites municipales en formato
      KML: esa capa debe ser la referencia de la validación, cargada como
      polígono."

   >>> CÓMO CARGAR EL KML OFICIAL <<<
   1. Pedirle el archivo a la Dirección de Ambiente.
   2. Copiarlo a backend/datos/limite-municipal.kml
   3. Reiniciar el backend.
   Nada más. Este módulo lo lee al arrancar y pasa a validar contra él. Si el
   archivo no está, usa el polígono provisorio de abajo y lo avisa por consola,
   para que nadie crea que está validando contra la capa oficial cuando no.

   >>> POR QUÉ EL RECUADRO NO ES UNA VALIDACIÓN <<<
   El sistema viejo valida con un rectángulo de latitud -28,0 a -26,0 y longitud
   -66,5 a -64,0. Eso abarca TODA la provincia de Tucumán: deja pasar
   ubicaciones de Yerba Buena, Tafí Viejo, Alderetes y Banda del Río Salí como
   si fueran del municipio.

   Acá el recuadro se usa solo como FILTRO PREVIO: descarta lo groseramente
   lejano sin hacer cuentas. La validación de verdad es el polígono.
   ============================================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RUTA_KML = join(AQUI, 'datos', 'limite-municipal.kml');
const RUTA_GEOJSON = join(AQUI, 'datos', 'limite-municipal.geojson');

/* ----------------------------------------------------------------------------
   POLÍGONO PROVISORIO
   ----------------------------------------------------------------------------
   >>> ES UNA APROXIMACIÓN, NO LA CAPA OFICIAL <<<
   Sigue los límites naturales y administrativos conocidos del ejido:

     norte   el límite con Tafí Viejo, por encima de Av. Perón
     este    el río Salí, que separa de Banda del Río Salí y Alderetes
     sur     el límite con Lules y San Pablo
     oeste   Av. Aconquija y el límite con Yerba Buena

   El polígono anterior tenía ocho vértices y su borde este caía en -65,165, o
   sea DENTRO de la ciudad: dejaba fuera del municipio a calles del centro como
   Chacabuco y Santiago del Estero. Este tiene más vértices y llega al río.

   Mientras sea provisorio, el sistema NO descarta coordenadas por caer fuera:
   las marca para revisión. Descartar con un polígono aproximado sería tirar
   ubicaciones correctas. Cuando esté el KML oficial, pasa a descartarlas como
   pide el pliego (ver `esOficial`).
   ---------------------------------------------------------------------------- */
const POLIGONO_PROVISORIO = [
  [-26.7720, -65.2420], // noroeste, límite con Tafí Viejo
  [-26.7720, -65.2050],
  [-26.7800, -65.1800],
  [-26.7900, -65.1600],
  [-26.8050, -65.1450],
  [-26.8200, -65.1330], // noreste, el río Salí
  [-26.8450, -65.1270],
  [-26.8650, -65.1300],
  [-26.8800, -65.1450],
  [-26.8950, -65.1700], // sureste
  [-26.8980, -65.2000],
  [-26.8950, -65.2300],
  [-26.8800, -65.2550],
  [-26.8550, -65.2700], // suroeste, hacia Yerba Buena
  [-26.8250, -65.2720],
  [-26.8000, -65.2650],
  [-26.7850, -65.2550],
];

/* ----------------------------------------------------------------------------
   LECTURA DEL KML
   ----------------------------------------------------------------------------
   Un KML es XML. Las coordenadas de un polígono vienen en <coordenades> como
   una lista de "lng,lat,alt" separadas por espacios. OJO con el orden: el KML
   pone LONGITUD PRIMERO, al revés de como se escribe habitualmente una
   coordenada. Invertirlo es el error clásico al importar uno, y produce un
   polígono en China.

   Se lee con una expresión regular en vez de traer una librería de XML: el
   archivo tiene una sola capa y esto no vuelve a cambiar.
   ---------------------------------------------------------------------------- */
function leerKml(ruta) {
  const xml = readFileSync(ruta, 'utf8');
  const bloques = [...xml.matchAll(/<coordinates>([\s\S]*?)<\/coordinates>/gi)];
  if (!bloques.length) return null;

  // Si el KML trae varios anillos, se toma el más grande: es el contorno
  // exterior del ejido, y los demás suelen ser huecos o islas.
  let mayor = null;
  for (const [, crudo] of bloques) {
    const puntos = crudo
      .trim()
      .split(/\s+/)
      .map((t) => {
        const [lng, lat] = t.split(',').map(Number);
        return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
      })
      .filter(Boolean);
    if (puntos.length > 3 && (!mayor || puntos.length > mayor.length)) mayor = puntos;
  }
  return mayor;
}

/* ----------------------------------------------------------------------------
   LECTURA DEL GEOJSON
   ----------------------------------------------------------------------------
   El límite administrativo de San Miguel de Tucumán publicado en OpenStreetMap
   (relación 3486117), guardado en backend/datos/limite-municipal.geojson.

   Es el límite REAL del municipio, no una aproximación: sigue el río Salí al
   este y los bordes con Tafí Viejo, Yerba Buena y Lules. Tiene 766 vértices
   contra los 17 del polígono provisorio, que por el norte se metía en Tafí
   Viejo y por el este en Banda del Río Salí.

   No es LA capa oficial del municipio —esa es el KML de la Dirección de
   Ambiente— pero es cartografía pública verificable y alcanza para validar en
   serio mientras tanto.

   >>> EN GEOJSON LAS COORDENADAS VAN [longitud, latitud] <<<
   Al revés de como se escribe habitualmente una coordenada. Invertirlo es el
   error clásico al importar uno y deja el polígono en China. */
function leerGeoJson(ruta) {
  const datos = JSON.parse(readFileSync(ruta, 'utf8'));
  const geometria = datos.geometry ?? datos;
  const anillos =
    geometria.type === 'MultiPolygon' ? geometria.coordinates.map((p) => p[0]) : [geometria.coordinates[0]];
  // Si hay varios anillos, el contorno exterior es el más grande.
  const mayor = anillos.reduce((a, b) => (b.length > a.length ? b : a));
  return mayor.map(([lng, lat]) => [lat, lng]);
}

let poligono = POLIGONO_PROVISORIO;
let esOficial = false;
let fuente = 'polígono provisorio escrito en el código';

/* Orden de preferencia: la capa oficial del municipio, después la de
   OpenStreetMap, y recién al final la aproximación del código. */
try {
  const kml = leerKml(RUTA_KML);
  if (kml) {
    poligono = kml;
    esOficial = true;
    fuente = `capa oficial de la Dirección de Ambiente (${kml.length} vértices)`;
  }
} catch (e) {
  if (e.code !== 'ENOENT') console.error('No se pudo leer el KML del límite municipal:', e.message);
}

if (!esOficial) {
  try {
    const osm = leerGeoJson(RUTA_GEOJSON);
    if (osm?.length > 3) {
      poligono = osm;
      fuente = `límite administrativo de OpenStreetMap (${osm.length} vértices)`;
    }
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('No se pudo leer el GeoJSON del límite municipal:', e.message);
  }
}

console.log(`Límite municipal: ${fuente}.`);
if (!esOficial) {
  console.log('  Para usar la capa oficial, copiar el KML a backend/datos/limite-municipal.kml y reiniciar.');
}

export const LIMITE_MUNICIPAL = poligono;

/* true cuando se está validando contra la capa oficial. Mientras sea false, el
   sistema MARCA las coordenadas de afuera en vez de descartarlas. */
export const LIMITE_ES_OFICIAL = esOficial;

/* Recuadro que envuelve al polígono. FILTRO PREVIO, no validación. */
export const RECUADRO_MUNICIPAL = LIMITE_MUNICIPAL.reduce(
  (r, [lat, lng]) => ({
    latMin: Math.min(r.latMin, lat),
    latMax: Math.max(r.latMax, lat),
    lngMin: Math.min(r.lngMin, lng),
    lngMax: Math.max(r.lngMax, lng),
  }),
  { latMin: 90, latMax: -90, lngMin: 180, lngMax: -180 },
);

/* Punto en polígono, algoritmo del rayo: cuenta cuántos lados cruza una
   semirrecta. Impar = adentro. Sirve para cualquier polígono, así que el día
   que entre el KML oficial no hay que tocar nada de esto. */
export function dentroDelMunicipio(lat, lng, poli = LIMITE_MUNICIPAL) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  // El "0,0" que manda un celular sin permiso de GPS (sección 9.2).
  if (lat === 0 && lng === 0) return false;

  // Filtro previo: si no entra en el recuadro, no hace falta recorrer el borde.
  const { latMin, latMax, lngMin, lngMax } = RECUADRO_MUNICIPAL;
  if (lat < latMin || lat > latMax || lng < lngMin || lng > lngMax) return false;

  let dentro = false;
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i, i += 1) {
    const [latI, lngI] = poli[i];
    const [latJ, lngJ] = poli[j];
    const cruza = lngI > lng !== lngJ > lng;
    if (cruza && lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI) {
      dentro = !dentro;
    }
  }
  return dentro;
}
