/* ============================================================================
   backend/rutas/actuaciones.js  —  TODAS LAS ACTUACIONES DE UNA VEZ
   ----------------------------------------------------------------------------
   No reemplaza ninguna función de DatosProvider.jsx: es el endpoint que el
   front necesita para armar su store.

   POR QUÉ EXISTE: el front trabaja con una lista plana `actuaciones` que
   contiene TODO lo que le pasó a todos los locales (notificaciones, documentos,
   prórrogas, expedientes). De ahí salen las bandejas, los indicadores y los
   vencimientos (ver src/datos/vistas.js). Sin este endpoint habría que pedir
   cada tipo por separado y pegarlos en el navegador.

   El RELEVAMIENTO queda afuera: el front lo trata como una colección aparte
   (`relevamientos`, que trae GET /relevamientos) porque es el acto de campo que
   da origen al local, no una actuación del circuito sancionatorio.

   PUT /actuaciones/:id/observaciones  ->  corrige las observaciones de una
   actuación (por ejemplo, un motivo de reingreso mal escrito). Ver abajo.
   ============================================================================ */

import { Router } from 'express';
import { recortarObservacion, tramitePorId, tramitesPorTipo } from '../consultas.js';
import { ID_TTRAMITE } from '../mapeo.js';
import { requiereRol } from '../middlewares/usuario.js';
import { ejecutarActo } from '../actos.js';
import { auditoriaDisponible } from '../auditoria.js';

const router = Router();

/* Todo menos el relevamiento y el tipo SIN INFORMAR. */
const TIPOS_DEL_CIRCUITO = [
  ID_TTRAMITE.PRIMERA_NOTIFICACION,
  ID_TTRAMITE.SEGUNDA_NOTIFICACION,
  ID_TTRAMITE.PRESENTACION_DOCUMENTACION,
  ID_TTRAMITE.PRORROGA,
  ID_TTRAMITE.EXPEDIENTE_MULTA,
];

router.get('/', async (_req, res, next) => {
  try {
    res.json(await tramitesPorTipo(TIPOS_DEL_CIRCUITO));
  } catch (e) {
    next(e);
  }
});

/* Cómo se nombra cada actuación en el historial, con su artículo. */
function nombreDe(t) {
  if (t.tipo === 'NOTIFICACION') return t.numeroCedula ? `de la cédula N° ${t.numeroCedula}` : 'de la notificación pendiente de emisión';
  if (t.tipo === 'EXPEDIENTE') return `del expediente N° ${t.numeroExpediente ?? 's/n'}`;
  if (t.tipo === 'PRORROGA') return 'de la prórroga';
  if (['DDJJ', 'DDJJ_RECICLAJE', 'CONTRATO'].includes(t.tipo)) return `del documento N° ${t.numero ?? 's/n'}`;
  return 'de la actuación';
}

/* PUT /actuaciones/:id/observaciones  { observaciones }

   Corrige o borra las observaciones de una actuación. Lo hace coordinación.

   >>> QUEDA CONSTANCIA (si la base tiene el historial) <<<
   Con la tabla `auditoria` (sql/05), en el historial del local se anota
   quién las cambió, cuándo y QUÉ DECÍAN ANTES. Sin ella, el cambio se hace
   igual pero lo anterior no queda guardado en ningún lado. Para exigir el
   historial (no dejar editar sin él), en el .env: EXIGIR_HISTORIAL_OBSERVACIONES=si

   No se editan los contratos que vinieron del informe de la 9 de Julio: esos
   los modifica solo el propio informe (regla de inmutabilidad del módulo). */
export function exigeHistorialObservaciones() {
  return String(process.env.EXIGIR_HISTORIAL_OBSERVACIONES ?? 'no').trim().toLowerCase() === 'si';
}

router.put('/:id/observaciones', requiereRol('coordinacion'), async (req, res, next) => {
  try {
    if (!auditoriaDisponible() && exigeHistorialObservaciones()) {
      return res.status(501).json({
        error: 'Para editar observaciones hace falta el historial de cambios (backend/sql/05): sin él no quedaría constancia de lo que decían antes.',
        capacidad: 'auditoria',
      });
    }
    const tramite = await tramitePorId(Number(req.params.id));
    if (!tramite) return res.status(404).json({ error: 'No existe esa actuación' });
    if (tramite.origen === 'INFORME_9DJ') {
      return res.status(409).json({ error: 'Este contrato viene del informe de la 9 de Julio: se modifica solo desde ese informe.' });
    }

    const nuevas = recortarObservacion(String(req.body?.observaciones ?? '').trim());
    const antes = String(tramite.observaciones ?? '').trim();
    if (nuevas === antes) return res.json(tramite);

    await ejecutarActo(req, {
      idLocal: tramite.localId,
      nombre: 'editar-observaciones',
      forzarRegistro: true,
      // Lo que decían va primero: es lo que se pierde de la actuación.
      motivo: `Observaciones ${nombreDe(tramite)} ${nuevas ? 'editadas' : 'borradas'}. Decían: "${antes || '(vacío)'}"`,
      trabajo: async (cx) => {
        await cx.execute('UPDATE tramite SET observaciones = ? WHERE id_tramite = ?', [nuevas, tramite.id]);
        return { idTramite: tramite.id };
      },
    });
    res.json(await tramitePorId(tramite.id));
  } catch (e) {
    next(e);
  }
});

export default router;
