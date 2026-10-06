/* ============================================================================
   backend/actos.js  —  POR ACÁ PASA TODO ACTO SOBRE UN LOCAL
   ----------------------------------------------------------------------------
   Emitir una cédula, registrar una entrega, iniciar un expediente, otorgar una
   prórroga, aprobar una DDJJ: cada uno es un acto administrativo con efectos
   sobre un contribuyente. Un acto mal habilitado no es un dato mal cargado, es
   una intimación inválida.

   >>> EL PROBLEMA QUE RESUELVE <<<
   Antes, las reglas de "qué acto corresponde en qué estado" estaban solo en
   las pantallas (src/dominio/reglas.js → ACCIONES). El servidor no las
   repetía: con una llamada directa a la API se podía iniciar un expediente a
   un local con DDJJ vigente, o emitir una cédula a un local exento.

   Ahora ejecutarActo() hace cumplir ESA MISMA tabla del dominio, sin copiarla:
   pantalla y servidor no pueden discrepar, porque leen la misma lista.

   >>> QUÉ HACE, EN ORDEN <<<
     1. Se pone en la fila (enFila): los actos van de a uno. Dos clics seguidos
        en "Iniciar expediente" no pueden pasar los dos el control.
     2. Abre una transacción y lee el local, sus trámites y su estado.
     3. Controla con la tabla ACCIONES: rol, estado y bloqueo manual. Después,
        los controles propios del acto (`controlar`), si los tiene.
     4. Si el tiempo cambió el estado desde la última anotación, lo anota como
        del Sistema (auditoria.ponerAlDia).
     5. Hace el trabajo (`trabajo`): las escrituras del acto.
     6. Vuelve a leer el estado y anota el cambio con el usuario que lo hizo.
     7. Confirma. Si cualquier paso falló, no queda nada escrito.

   Los errores de regla salen como ErrorActo con su código HTTP (403 rol, 409
   estado) y un mensaje para mostrarle al usuario tal cual.
   ============================================================================ */

import { ACCIONES } from '../src/dominio/reglas.js';
import { etiquetaEstado } from '../src/dominio/estados.js';
import { enTransaccion } from './conexion-bd.js';
import { enFila, situacionDeLocal } from './consultas.js';
import { ponerAlDia, registrarCambio } from './auditoria.js';

export class ErrorActo extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.name = 'ErrorActo';
    this.status = status;
  }
}

/* ¿Puede este rol hacer esta acción con el local en este estado?
   Devuelve null si puede, o el ErrorActo que corresponde. Es la misma
   condición que usa accionesDisponibles() para dibujar los botones. */
export function controlarAccion(idAccion, { estado, rol, local, rolHabilitadoAunque = false }) {
  const accion = ACCIONES.find((a) => a.id === idAccion);
  if (!accion) throw new Error(`Acción desconocida en backend/actos.js: ${idAccion}`);

  if (!rolHabilitadoAunque && rol !== 'administrador' && !accion.roles.includes(rol)) {
    return new ErrorActo(403, `Tu tipo de usuario no puede hacer esto: ${accion.etiqueta.toLowerCase()}.`);
  }
  if (local?.bloqueado && idAccion !== 'bloquear') {
    return new ErrorActo(409, 'El local tiene bloqueo manual. Hay que levantar el bloqueo antes de registrar un acto.');
  }
  const enEstado = accion.estados.includes('*') ? estado !== 'EXENTO_CONFIRMADO' : accion.estados.includes(estado);
  if (!enEstado) {
    return new ErrorActo(409, `No corresponde «${accion.etiqueta}» con el local en «${etiquetaEstado(estado)}».`);
  }
  return null;
}

/* Corre un acto con todos los controles y la auditoría.

   opciones:
     idLocal      el local sobre el que se actúa
     accion       id de la tabla ACCIONES ('generar-cedula', ...). Opcional:
                  los actos que no están en esa tabla (editar el padrón, validar
                  una presentación) se controlan con requiereRol en la ruta.
     nombre       cómo se anota en la auditoría si no hay `accion`
     motivo       texto para la auditoría, o función (resultado, antes, despues)
     controlar    async (antes, cx) -> null | ErrorActo | { status, error }
     trabajo      async (cx, antes) -> { idTramite?, ... }  (las escrituras)
     forzarRegistro  anotar aunque el estado no cambie (bloqueo, baja)
     rolHabilitadoAunque  async (antes, cx) -> bool. Para el notificador
                  asignado a una cédula, que puede registrar su entrega aunque
                  su tipo de usuario sea relevador.

   Devuelve lo que devolvió `trabajo`. */
export async function ejecutarActo(req, opciones) {
  const {
    idLocal,
    accion = null,
    nombre = null,
    motivo = '',
    controlar = null,
    trabajo,
    forzarRegistro = false,
    rolHabilitadoAunque = null,
  } = opciones;

  return enFila(() =>
    enTransaccion(async (cx) => {
      const antes = await situacionDeLocal(idLocal, cx);
      if (!antes.local) throw new ErrorActo(404, 'Local no encontrado');

      if (accion) {
        const extra = rolHabilitadoAunque ? Boolean(await rolHabilitadoAunque(antes, cx)) : false;
        const error = controlarAccion(accion, {
          estado: antes.estado,
          rol: req.usuario?.rol,
          local: antes.local,
          rolHabilitadoAunque: extra,
        });
        if (error) throw error;
      }

      if (controlar) {
        const problema = await controlar(antes, cx);
        if (problema) {
          throw problema instanceof ErrorActo
            ? problema
            : new ErrorActo(problema.status ?? 409, problema.error ?? String(problema));
        }
      }

      await ponerAlDia(cx, idLocal, antes.estado);

      const resultado = (await trabajo(cx, antes)) ?? {};

      const despues = await situacionDeLocal(idLocal, cx);
      // Un local dado de baja deja de aparecer: se anota como BAJA.
      const nuevo = despues.local ? despues.estado : 'BAJA';
      await registrarCambio(cx, req, {
        idLocal,
        anterior: antes.estado,
        nuevo,
        motivo: typeof motivo === 'function' ? motivo(resultado, antes, despues) : motivo,
        accion: accion ?? nombre,
        idTramite: resultado.idTramite ?? null,
        forzar: forzarRegistro,
      });

      return resultado;
    }),
  );
}

/* Para los locales que NACEN en una transacción (relevamiento, alta manual,
   informe de la 9 de Julio): anota su estado de partida. */
export async function registrarAlta(cx, req, idLocal, motivo, nombre) {
  const { estado } = await situacionDeLocal(idLocal, cx);
  await registrarCambio(cx, req, { idLocal, anterior: null, nuevo: estado, motivo, accion: nombre, forzar: true });
}
