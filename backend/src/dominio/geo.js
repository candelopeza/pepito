/* ============================================================================
   dominio/geo.js  —  GEOCODIFICACIÓN Y VALIDACIÓN TERRITORIAL
   ----------------------------------------------------------------------------
   Sección 9.2 del pliego.

   >>> LAS DOS COORDENADAS NO SON LA MISMA COSA <<<
   Es el error conceptual más caro de este dominio:

     coordenada del RELEVAMIENTO   dónde se guardó la carga de campo. Es una
                                   MÉTRICA del trabajo del agente. No es
                                   confiable como ubicación del local, porque
                                   la carga se suele completar fuera del lugar
                                   (y en el sistema viejo llega como "0,0"
                                   cuando el celular no tiene permiso de GPS).

     coordenada del PADRÓN         la ubicación oficial del establecimiento.
                                   Se obtiene SIEMPRE geocodificando la
                                   dirección declarada. Alimenta el mapa y el
                                   ruteo de notificaciones.

   EL SISTEMA NO DEBE COPIAR UNA SOBRE LA OTRA BAJO NINGUNA CIRCUNSTANCIA.
   Viven en tablas distintas: `relevamiento.latitud/longitud` y
   `local.latitud/longitud`.

   Si la dirección no se puede geocodificar, el local queda SIN ubicación y
   aparece en Herramientas → Geocodificación pendiente. No se completa con un
   valor aproximado.
   ============================================================================ */

/* ----------------------------------------------------------------------------
   LÍMITE MUNICIPAL
   El pliego pide validar contra la capa KML de límites de San Miguel de
   Tucumán, cargada como polígono. Acá va un polígono aproximado del ejido
   para que la validación funcione en la maqueta.

   >>> REEMPLAZAR POR EL KML REAL QUE TIENE LA DIRECCIÓN DE AMBIENTE <<<
   Es el único punto a cambiar: el algoritmo de abajo sirve para cualquier
   polígono.

   [NO PORTAR] El sistema viejo validaba con un recuadro (lat -28,0 a -26,0 /
   lng -66,5 a -64,0) que abarca TODA la provincia. Deja pasar locales de otros
   departamentos. Sirve como filtro previo, no como validación.
   ---------------------------------------------------------------------------- */
export const LIMITE_MUNICIPAL = [
  [-26.7960, -65.2500],
  [-26.7960, -65.1750],
  [-26.8180, -65.1650],
  [-26.8600, -65.1650],
  [-26.8900, -65.1800],
  [-26.8900, -65.2450],
  [-26.8600, -65.2600],
  [-26.8200, -65.2600],
];

/* Recuadro que envuelve al polígono. Se usa como filtro previo barato y para
   dibujar el mapa (pages/Mapa.jsx lo necesita para escalar). */
export const RECUADRO_MUNICIPAL = LIMITE_MUNICIPAL.reduce(
  (r, [lat, lng]) => ({
    latMin: Math.min(r.latMin, lat),
    latMax: Math.max(r.latMax, lat),
    lngMin: Math.min(r.lngMin, lng),
    lngMax: Math.max(r.lngMax, lng),
  }),
  { latMin: 90, latMax: -90, lngMin: 180, lngMax: -180 },
);

/* Punto en polígono, algoritmo del rayo (ray casting): cuenta cuántos lados
   cruza una semirrecta horizontal. Impar = adentro. */
export function dentroDelMunicipio(lat, lng, poligono = LIMITE_MUNICIPAL) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (lat === 0 && lng === 0) return false; // el "0,0" del GPS sin permiso

  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i, i += 1) {
    const [latI, lngI] = poligono[i];
    const [latJ, lngJ] = poligono[j];
    const cruza = lngI > lng !== lngJ > lng;
    if (cruza && lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI) {
      dentro = !dentro;
    }
  }
  return dentro;
}

/* ============================================================================
   GEOCODIFICADOR  —  *** SIMULADO ***
   ----------------------------------------------------------------------------
   Devuelve una coordenada estable a partir del texto de la dirección: la misma
   dirección da siempre el mismo punto, así el mapa no baila entre recargas.
   Direcciones sin altura no se resuelven, para poder mostrar el caso "quedó
   sin ubicación" en la pantalla de revisión.

   CUANDO HAYA BACKEND: esta función se reemplaza por la llamada al servicio de
   geocodificación del municipio. Lo que NO cambia es la validación: la
   coordenada que caiga fuera del polígono se descarta, no se guarda.
   ============================================================================ */
export function geocodificar(direccion) {
  const texto = (direccion || '').trim();
  if (!texto) return { ok: false, motivo: 'Sin dirección declarada.' };
  if (!/\d/.test(texto)) {
    return { ok: false, motivo: 'La dirección no tiene altura. No se puede geocodificar.' };
  }

  // Hash simple y determinista del texto.
  let h = 0;
  for (let i = 0; i < texto.length; i += 1) {
    h = (h * 31 + texto.charCodeAt(i)) % 100000;
  }
  const lat = -26.8 - ((h % 700) / 10000);
  const lng = -65.18 - ((Math.floor(h / 700) % 700) / 10000);

  if (!dentroDelMunicipio(lat, lng)) {
    return { ok: false, motivo: 'La coordenada obtenida cae fuera del ejido municipal. Se descarta.' };
  }
  return { ok: true, latitud: Number(lat.toFixed(6)), longitud: Number(lng.toFixed(6)) };
}

/* ============================================================================
   RUTEO POR PROXIMIDAD  (sección 6.4)
   ----------------------------------------------------------------------------
   [NO PORTAR] El sistema viejo agrupa las cédulas por nombre de calle y las
   ordena por altura: aproxima un recorrido pero ignora la distancia real entre
   puntos de calles distintas.

   Acá va un vecino más cercano: arranca del primer punto y en cada paso toma
   el más próximo de los que quedan. No es la ruta óptima (eso es un problema
   NP), pero para 20 o 30 cédulas por día da un recorrido razonable y se
   calcula al instante.
   ============================================================================ */
function distancia(a, b) {
  // Distancia plana. A escala de ciudad el error es despreciable y evita
  // traer una librería para calcular Haversine.
  const dLat = a.latitud - b.latitud;
  const dLng = (a.longitud - b.longitud) * Math.cos((a.latitud * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

export function ordenarPorProximidad(puntos) {
  const conCoord = puntos.filter((p) => typeof p.latitud === 'number' && typeof p.longitud === 'number');
  const sinCoord = puntos.filter((p) => !conCoord.includes(p));
  if (conCoord.length < 2) return [...conCoord, ...sinCoord];

  const pendientes = [...conCoord];
  const ruta = [pendientes.shift()];

  while (pendientes.length) {
    const ultimo = ruta[ruta.length - 1];
    let mejor = 0;
    let mejorD = Infinity;
    pendientes.forEach((p, i) => {
      const d = distancia(ultimo, p);
      if (d < mejorD) {
        mejorD = d;
        mejor = i;
      }
    });
    ruta.push(pendientes.splice(mejor, 1)[0]);
  }

  // Los que no tienen coordenada van al final: el notificador los ubica a mano.
  return [...ruta, ...sinCoord];
}
