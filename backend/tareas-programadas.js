/* ============================================================================
   backend/tareas-programadas.js  —  LO QUE EL SISTEMA HACE SOLO, TODOS LOS DÍAS
   ----------------------------------------------------------------------------
   Sección 9.1 del pliego: "Recálculo de estados — diario, y ante cada
   actuación — detectar vencimientos de plazos, documentos y prórrogas".

   El estado ya se deduce al leer (ver estadoDeLocal en mapeo.js): un plazo
   que vence a medianoche se ve vencido a la mañana sin que nada corra. Lo que
   faltaba es que ese cambio QUEDE REGISTRADO, con fecha y como obra del
   Sistema, para que la ficha pueda mostrar "el 15/10 pasó a Generar
   expediente porque venció la segunda notificación". Eso hace esta tarea:
   llama a registrarPasoDelTiempo() de auditoria.js.

   CUÁNDO CORRE:
     - un minuto después de arrancar el servidor (por si estuvo apagado de
       noche y se perdió la corrida);
     - todos los días a las 00:05, hora de Tucumán.
   Se puede correr a mano desde POST /herramientas/recalcular-estados.

   Sin la tabla `auditoria` no hace nada (lo dice en /salud).

   >>> EMISIÓN AUTOMÁTICA DE CÉDULAS (sección 9.6) <<<
   La Dirección elige en Configuración → Parámetros cómo se emite:
     - emisionAutomatica: el sistema emite toda la cola los días hábiles a
       las 7, antes de que llegue la oficina;
     - emisionRespaldo (solo con la emisión manual): si a las 12 quedó algo
       en la cola, el sistema lo emite.
   Las dos vienen apagadas. Lo que emite el sistema queda en el historial
   con el Sistema como autor y "Emisión automática ..." en el motivo, para
   distinguirlo de lo que emite una persona. Un local bloqueado o sin datos
   registrales no se emite: queda en la cola y se anota en la consola. Si
   el servidor estaba apagado a esa hora, la corrida se pierde: la toma la
   del día siguiente (no se recupera al arrancar, para no emitir a deshora).

   >>> UNA SOLA INSTANCIA <<<
   Igual que la numeración de cédulas, esto supone UN proceso del backend. Con
   dos, la tarea correría dos veces; no duplica filas (cada corrida anota solo
   lo que cambió desde la última) pero sí trabajo.
   ============================================================================ */

import { ACTOR_SISTEMA, registrarPasoDelTiempo } from './auditoria.js';
import { feriados, localesConEstado, parametros } from './consultas.js';
import { ErrorActo } from './actos.js';
import { emitirCedula } from './rutas/notificaciones.js';
import { esHabil, hoyISO } from '../src/dominio/fechas.js';

let ultima = { momento: null, resultado: null, error: null };
let proxima = null;

export function estadoTareas() {
  return {
    ultimaCorrida: ultima,
    proximaCorrida: proxima,
    emision: { ultima: ultimaEmision, proximas: proximasEmision },
  };
}

/* ---------------------------------------------------------------------------
   EMISIÓN AUTOMÁTICA
   --------------------------------------------------------------------------- */
const HORA_EMISION_DIARIA = 7;
const HORA_RESPALDO = 12;
const EN_COLA = ['NOTIF1_PENDIENTE', 'NOTIF2_PENDIENTE', 'NOTIF1_GENERANDO', 'NOTIF2_GENERANDO'];
// El autor de lo que emite la tarea: la auditoría lo anota como "Sistema".
const SISTEMA = { usuario: { id: null, nombre: ACTOR_SISTEMA, rol: 'sistema' } };
const ETIQUETA = {
  diaria: 'Emisión automática diaria',
  respaldo: 'Emisión automática de respaldo (a las 12 la cola seguía sin emitir)',
};

let ultimaEmision = { momento: null, origen: null, resultado: null, error: null };
const proximasEmision = {};

/* Emite la cola si el parámetro lo pide. `origen` es 'diaria' o 'respaldo'.
   `hoy` se puede pasar para probar un día puntual. Devuelve
   { emitidas, trabadas: [{ id, motivo }] } o { omitida: motivo }. */
export async function emitirColaAutomatica(origen, hoy = hoyISO()) {
  const params = await parametros();
  const prendida = origen === 'diaria' ? params.emisionAutomatica : !params.emisionAutomatica && params.emisionRespaldo;
  if (!prendida) return { omitida: 'apagada en Parámetros' };
  if (!esHabil(hoy, await feriados())) return { omitida: 'día no hábil' };

  const cola = (await localesConEstado()).filter((l) => EN_COLA.includes(l.estado) && !l.bloqueado);
  const resultado = { emitidas: 0, trabadas: [] };
  for (const local of cola) {
    try {
      await emitirCedula(SISTEMA, local.id, { automatica: ETIQUETA[origen] });
      resultado.emitidas += 1;
    } catch (e) {
      // Una regla que no se cumple deja ese local en la cola; una falla de la
      // base corta la corrida.
      if (!(e instanceof ErrorActo)) throw e;
      resultado.trabadas.push({ id: local.id, motivo: e.message });
    }
  }
  return resultado;
}

async function correrEmision(origen) {
  try {
    const resultado = await emitirColaAutomatica(origen);
    ultimaEmision = { momento: new Date().toISOString(), origen, resultado, error: null };
    if (!resultado.omitida) {
      console.log(
        `[${ETIQUETA[origen].toLowerCase()}] ${resultado.emitidas} cédula(s) emitidas` +
          (resultado.trabadas.length
            ? `, ${resultado.trabadas.length} quedaron en la cola (faltan datos o están bloqueadas)`
            : ''),
      );
    }
  } catch (e) {
    ultimaEmision = { momento: new Date().toISOString(), origen, resultado: null, error: e.message };
    console.error('[emisión automática] falló:', e);
  }
}

function programarEmision(origen, hora) {
  const ahora = new Date();
  const objetivo = new Date(ahora);
  objetivo.setHours(hora, 0, 0, 0);
  if (objetivo <= ahora) objetivo.setDate(objetivo.getDate() + 1);
  proximasEmision[origen] = objetivo.toISOString();
  const t = setTimeout(async () => {
    await correrEmision(origen);
    programarEmision(origen, hora);
  }, objetivo.getTime() - ahora.getTime());
  t.unref?.();
}

async function correr(origen) {
  try {
    const resultado = await registrarPasoDelTiempo();
    ultima = { momento: new Date().toISOString(), origen, resultado, error: null };
    if (!resultado.omitida && (resultado.inicios || resultado.cambios)) {
      console.log(
        `[tarea diaria] ${resultado.revisados} locales revisados: ${resultado.cambios} cambio(s) de estado anotados` +
          (resultado.inicios ? `, ${resultado.inicios} punto(s) de partida` : ''),
      );
    }
  } catch (e) {
    ultima = { momento: new Date().toISOString(), origen, resultado: null, error: e.message };
    console.error('[tarea diaria] falló:', e);
  }
}

/* Milisegundos hasta las 00:05 del día siguiente, en la hora del servidor
   (que tiene que ser la de Tucumán: ver TZ en servidor.js). */
function hastaLaMedianoche() {
  const ahora = new Date();
  const objetivo = new Date(ahora);
  objetivo.setHours(24, 5, 0, 0);
  return objetivo.getTime() - ahora.getTime();
}

function programarSiguiente() {
  const espera = hastaLaMedianoche();
  proxima = new Date(Date.now() + espera).toISOString();
  const t = setTimeout(async () => {
    await correr('diaria');
    programarSiguiente();
  }, espera);
  t.unref?.();
}

export function iniciarTareas() {
  const t = setTimeout(() => correr('arranque'), 60 * 1000);
  t.unref?.();
  programarSiguiente();
  // Corren siempre; adentro se fijan en Parámetros si les toca emitir.
  programarEmision('diaria', HORA_EMISION_DIARIA);
  programarEmision('respaldo', HORA_RESPALDO);
}
