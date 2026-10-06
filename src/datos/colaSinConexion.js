/* ============================================================================
   datos/colaSinConexion.js  —  LO QUE SE CARGÓ SIN SEÑAL, ESPERANDO PARA SALIR
   ----------------------------------------------------------------------------
   Sección 6.2, requisito NO NEGOCIABLE: "La aplicación debe permitir cargar
   relevamientos y resultados de entrega sin conexión, almacenarlos localmente
   y sincronizarlos después, con indicación visible de cuántos registros
   quedan pendientes."

   CÓMO FUNCIONA
   - Si al guardar un relevamiento o una entrega no hay señal (la API no
     responde), datos/DatosProvider.jsx la guarda acá en vez de perderla.
   - Queda en el dispositivo (IndexedDB, ver almacenLocal.js): sobrevive a
     cerrar la app o apagar el teléfono.
   - Cuando vuelve la señal se envía sola, en el orden en que se cargó.
   - La fecha, la hora y la coordenada son las del MOMENTO DEL GUARDADO: viajan
     dentro de la carga, no se toman al sincronizar (criterio de aceptación).
   - Si el servidor la rechaza (por ejemplo, la cédula ya tenía una entrega),
     queda marcada con el motivo para que el agente la vea, y no traba al
     resto de la cola.

   El backend reconoce un reenvío de algo que ya había llegado (la señal se
   cortó justo después de enviar): no duplica el relevamiento ni la entrega.
   ============================================================================ */

import { guardar, leer } from './almacenLocal';

const CLAVE = 'cola-campo';

let lista = null;
const oyentes = new Set();

async function cargar() {
  if (!lista) lista = (await leer(CLAVE)) ?? [];
  return lista;
}

async function escribir(nueva) {
  lista = nueva;
  await guardar(CLAVE, nueva);
  oyentes.forEach((fn) => fn([...nueva]));
}

function nuevoId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

/* Avisa cada vez que la cola cambia. Devuelve la función para dejar de oír. */
export function suscribir(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

export async function listar() {
  return [...(await cargar())];
}

/* item: { tipo: 'relevamiento' | 'entrega', datos, referencia?, etiqueta } */
export async function encolar(item) {
  const actual = await cargar();
  const nuevo = { id: nuevoId(), creado: new Date().toISOString(), intentos: 0, error: null, rechazado: false, ...item };
  await escribir([...actual, nuevo]);
  return nuevo;
}

export async function quitar(id) {
  const actual = await cargar();
  await escribir(actual.filter((i) => i.id !== id));
}

async function actualizar(id, cambios) {
  const actual = await cargar();
  await escribir(actual.map((i) => (i.id === id ? { ...i, ...cambios } : i)));
}

/* Manda lo pendiente, de a uno y en orden. `enviar(item)` hace la llamada.
   - error de red (sigue sin señal): se corta y se reintenta más tarde;
   - error del servidor (400, 403, 409): el item queda rechazado con el
     mensaje y se sigue con el próximo. */
let enviando = false;

export async function enviarPendientes(enviar) {
  if (enviando) return { enviados: 0, rechazados: 0, ocupada: true };
  enviando = true;
  let enviados = 0;
  let rechazados = 0;
  try {
    for (const item of await listar()) {
      if (item.rechazado) continue;
      try {
        await enviar(item);
        await quitar(item.id);
        enviados += 1;
      } catch (e) {
        if (!e?.estado) break;
        await actualizar(item.id, { rechazado: true, error: e.message, intentos: item.intentos + 1 });
        rechazados += 1;
      }
    }
  } finally {
    enviando = false;
  }
  return { enviados, rechazados };
}
