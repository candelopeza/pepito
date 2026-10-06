/* ============================================================================
   backend/auditoria.js  —  EL HISTORIAL DE CAMBIOS DE ESTADO DE CADA LOCAL
   ----------------------------------------------------------------------------
   Sección 5.2 del pliego y criterio de aceptación del capítulo 10: "Todo
   cambio de estado queda registrado con actor, momento y motivo, y es
   consultable desde la ficha". Es lo que defiende una intimación ante una
   impugnación: sin esto, nadie puede probar en qué estado estaba un local el
   día que se le inició el expediente.

   Escribe en la tabla `auditoria`, que crea sql/05-tabla-auditoria.sql. Si el
   script no se corrió, todo este archivo queda en silencio (no escribe, no
   falla) y los actos se registran igual que antes, sin historial.

   DOS CLASES DE FILA:

   1. Las que provoca una persona: emitir una cédula, otorgar una prórroga,
      aprobar una DDJJ. Las escribe backend/actos.js con conAuditoria(), que
      mide el estado ANTES y DESPUÉS del acto, en la misma transacción. El
      actor es el usuario que hizo el pedido.

   2. Las que provoca el paso del tiempo: un plazo que venció, una DDJJ que
      caducó. Nadie las registra a mano, así que las escribe el sistema con el
      actor "Sistema" (sección 7.2: "sus escrituras deben quedar auditadas como
      tales"). Salen de dos lugares:
        - la tarea diaria (backend/tareas-programadas.js), que recorre todo el
          padrón y anota lo que cambió desde la última vez;
        - justo antes de cada acto (ponerAlDia), por si el cambio pasó después
          de la última corrida de la tarea. Así el historial nunca salta de un
          estado a otro sin explicar el paso del medio.

   EL ESTADO SE GUARDA COMO TEXTO ('NOTIF2_PENDIENTE') y no como id_estado:
   el estado que ve el área es compuesto. "2da notificación pendiente" no
   existe como fila de la tabla `estado`, se deduce de que venció la primera.
   ============================================================================ */

import { consultar, consultarEn, enTransaccion } from './conexion-bd.js';
import { enFila, localesConEstado, recortarObservacion } from './consultas.js';
import { tiene } from './capacidades.js';
import { fechaHora } from './mapeo.js';

export const ACTOR_SISTEMA = 'Sistema';

const MOTIVO_INICIO = 'Estado al comenzar el registro de auditoría';
const MOTIVO_TIEMPO = 'Cambio por paso del tiempo (vencimiento de plazo, documento o prórroga)';

export function auditoriaDisponible() {
  return tiene('auditoria');
}

/* El último estado anotado de un local, o null si nunca se anotó nada. */
async function ultimoAuditado(cx, idLocal) {
  const [fila] = await consultarEn(
    cx,
    'SELECT estado_nuevo FROM auditoria WHERE id_local = ? ORDER BY id_auditoria DESC LIMIT 1',
    [idLocal],
  );
  return fila ? fila.estadoNuevo : null;
}

async function insertar(cx, { idLocal, anterior, nuevo, motivo, accion, idTramite = null, idUsuario = null, actor }) {
  await cx.execute(
    `INSERT INTO auditoria
       (id_local, estado_anterior, estado_nuevo, motivo, accion, id_tramite, id_usuario, actor, momento)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      idLocal,
      anterior ?? null,
      nuevo,
      recortarObservacion(motivo || '—', 250),
      accion ?? null,
      idTramite ?? null,
      idUsuario ?? null,
      recortarObservacion(actor || ACTOR_SISTEMA, 120),
    ],
  );
}

/* Antes de un acto: si el estado de hoy no es el último anotado, la
   diferencia la produjo el tiempo y se anota como del Sistema. Si el local
   nunca se anotó, se anota su punto de partida. */
export async function ponerAlDia(cx, idLocal, estadoActual) {
  if (!auditoriaDisponible() || !estadoActual) return;
  const ultimo = await ultimoAuditado(cx, idLocal);
  if (ultimo === null) {
    await insertar(cx, { idLocal, anterior: null, nuevo: estadoActual, motivo: MOTIVO_INICIO, accion: 'inicio', actor: ACTOR_SISTEMA });
  } else if (ultimo !== estadoActual) {
    await insertar(cx, {
      idLocal,
      anterior: ultimo,
      nuevo: estadoActual,
      motivo: MOTIVO_TIEMPO,
      accion: 'paso-del-tiempo',
      actor: ACTOR_SISTEMA,
    });
  }
}

/* Después de un acto: anota el cambio con el usuario que lo hizo. Solo si el
   estado cambió, salvo `forzar` (el bloqueo, por ejemplo, no cambia el estado
   pero tiene que quedar registrado con fecha, actor y motivo). */
export async function registrarCambio(cx, req, { idLocal, anterior, nuevo, motivo, accion, idTramite = null, forzar = false }) {
  if (!auditoriaDisponible() || !nuevo) return false;
  if (anterior === nuevo && !forzar) return false;
  await insertar(cx, {
    idLocal,
    anterior,
    nuevo,
    motivo,
    accion,
    idTramite,
    idUsuario: req?.usuario?.id ?? null,
    actor: req?.usuario?.nombre ?? ACTOR_SISTEMA,
  });
  return true;
}

/* El historial de un local, en orden. Es lo que muestra la ficha. */
export async function historialDeLocal(idLocal) {
  if (!auditoriaDisponible()) return [];
  const filas = await consultar('SELECT * FROM auditoria WHERE id_local = ? ORDER BY id_auditoria', [idLocal]);
  return filas.map((f) => ({
    id: f.idAuditoria,
    localId: f.idLocal,
    anterior: f.estadoAnterior ?? null,
    nuevo: f.estadoNuevo,
    motivo: f.motivo,
    accion: f.accion ?? null,
    idTramite: f.idTramite ?? null,
    actor: f.actor,
    momento: fechaHora(f.momento),
  }));
}

/* Las prórrogas que pidió un titular por el portal y coordinación todavía no
   resolvió: la última solicitud de cada local, si no hubo una prórroga
   otorgada después. El pedido no crea trámite (pedir no es otorgar), así que
   vive solo acá, en el historial. El motivo lo arma
   rutas/prorrogas-expedientes.js con un formato fijo, y de ahí salen los días. */
export async function solicitudesDeProrrogaPendientes() {
  if (!auditoriaDisponible()) return [];
  const filas = await consultar(
    `SELECT a.id_auditoria, a.id_local, a.motivo, a.actor, a.momento
       FROM auditoria a
      WHERE a.accion = 'solicitud-prorroga'
        AND a.id_auditoria = (SELECT MAX(x.id_auditoria) FROM auditoria x
                               WHERE x.id_local = a.id_local AND x.accion = 'solicitud-prorroga')
        AND NOT EXISTS (SELECT 1 FROM auditoria o
                         WHERE o.id_local = a.id_local AND o.accion = 'otorgar-prorroga'
                           AND o.id_auditoria > a.id_auditoria)
      ORDER BY a.id_auditoria`,
  );
  return filas.map((f) => {
    const partes = String(f.motivo ?? '').match(/por (\d+) días: (.*)$/);
    return {
      id: f.idAuditoria,
      localId: f.idLocal,
      dias: partes ? Number(partes[1]) : null,
      motivo: partes ? partes[2] : f.motivo,
      actor: f.actor,
      momento: fechaHora(f.momento),
    };
  });
}

/* ---------------------------------------------------------------------------
   LA RECORRIDA DIARIA
   ---------------------------------------------------------------------------
   Calcula el estado de todo el padrón y anota, como "Sistema", cada local cuyo
   estado cambió desde la última anotación. La primera vez que corre anota el
   punto de partida de todos (unas 2.200 filas, una sola vez).

   Corre DENTRO de la fila de actos (enFila): mientras recorre, nadie registra
   un acto, y no puede quedar una fila del Sistema anotada después de un acto
   que en realidad pasó antes. Tarda uno o dos segundos.
   --------------------------------------------------------------------------- */
export async function registrarPasoDelTiempo() {
  if (!auditoriaDisponible()) {
    return { omitida: true, motivo: 'No está la tabla auditoria (sql/05-tabla-auditoria.sql).' };
  }

  return enFila(async () => {
    const lista = await localesConEstado();
    const ultimos = await consultar(
      `SELECT a.id_local, a.estado_nuevo
         FROM auditoria a
         JOIN (SELECT id_local, MAX(id_auditoria) AS ultimo FROM auditoria GROUP BY id_local) u
           ON u.ultimo = a.id_auditoria`,
    );
    const anotado = new Map(ultimos.map((f) => [f.idLocal, f.estadoNuevo]));

    const filas = [];
    let inicios = 0;
    let cambios = 0;
    for (const l of lista) {
      if (!l.estado) continue;
      const previo = anotado.get(l.id);
      if (previo === undefined) {
        inicios += 1;
        filas.push([l.id, null, l.estado, MOTIVO_INICIO, 'inicio']);
      } else if (previo !== l.estado) {
        cambios += 1;
        filas.push([l.id, previo, l.estado, MOTIVO_TIEMPO, 'paso-del-tiempo']);
      }
    }

    if (filas.length) {
      await enTransaccion(async (cx) => {
        // De a 500 filas por INSERT: con 2.200 locales la primera corrida es
        // de cinco sentencias y no de 2.200.
        for (let i = 0; i < filas.length; i += 500) {
          const tanda = filas.slice(i, i + 500);
          const valores = tanda.map(() => '(?, ?, ?, ?, ?, NULL, NULL, ?, NOW())').join(', ');
          await cx.execute(
            `INSERT INTO auditoria
               (id_local, estado_anterior, estado_nuevo, motivo, accion, id_tramite, id_usuario, actor, momento)
             VALUES ${valores}`,
            tanda.flatMap(([id, anterior, nuevo, motivo, accion]) => [id, anterior, nuevo, motivo, accion, ACTOR_SISTEMA]),
          );
        }
      });
    }

    return { omitida: false, revisados: lista.length, inicios, cambios };
  });
}
