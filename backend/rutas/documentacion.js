/* ============================================================================
   backend/rutas/documentacion.js  —  DDJJ Y CONTRATOS (sección 4.5)
   ----------------------------------------------------------------------------
   Reemplaza estas funciones de src/datos/DatosProvider.jsx:

     presentacionesPendientes()  ->  GET  /documentacion/pendientes
     registrarDocumento          ->  POST /documentacion            { localId, tipo, numero, fechaEmision, ... }
     validarPresentacion         ->  POST /documentacion/:id/validacion   { aprobar, observaciones }

   El vencimiento se calcula en el servidor con vencimientoDocumento() del
   dominio: la DDJJ vence al año exacto, el contrato trae su fecha.
   ============================================================================ */

import { Router } from 'express';
import { consultar } from '../conexion-bd.js';

const router = Router();

/* Presentaciones del portal que todavía no aprobó ningún agente. */
router.get('/pendientes', async (_req, res, next) => {
  try {
    res.json(
      await consultar(
        "SELECT * FROM actuaciones WHERE tipo IN ('DDJJ','DDJJ_RECICLAJE','CONTRATO') AND validado = 0 ORDER BY fecha",
      ),
    );
  } catch (e) {
    next(e);
  }
});

const pendiente = (reemplaza) => (_req, res) =>
  res.status(501).json({ error: `Pendiente de implementar. Reemplaza a ${reemplaza} de DatosProvider.jsx` });

router.post('/', pendiente('registrarDocumento'));
router.post('/:id/validacion', pendiente('validarPresentacion'));

export default router;
