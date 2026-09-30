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
   ============================================================================ */

import { Router } from 'express';
import { tramitesPorTipo } from '../consultas.js';
import { ID_TTRAMITE } from '../mapeo.js';

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

export default router;
