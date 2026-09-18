/* ============================================================================
   backend/rutas/prorrogas-expedientes.js  —  ETAPAS 5 Y 6
   ----------------------------------------------------------------------------
   Reemplaza estas funciones de src/datos/DatosProvider.jsx:

     otorgarProrroga        ->  POST /locales/:id/prorrogas     { dias, motivo }     (rol coordinacion)
     registrarExpediente    ->  POST /locales/:id/expedientes   { numeroManual? }    (rol administrativo)
     reingresarAlCircuito   ->  POST /locales/:id/reingreso     { motivo }           (rol coordinacion)

   Están en un archivo aparte de locales.js porque son ACTUACIONES sobre el
   local, no datos del padrón. Se montan en la raíz (ver servidor.js).
   ============================================================================ */

import { Router } from 'express';

const router = Router();

const pendiente = (reemplaza) => (_req, res) =>
  res.status(501).json({ error: `Pendiente de implementar. Reemplaza a ${reemplaza} de DatosProvider.jsx` });

router.post('/locales/:id/prorrogas', pendiente('otorgarProrroga'));
router.post('/locales/:id/expedientes', pendiente('registrarExpediente'));
router.post('/locales/:id/reingreso', pendiente('reingresarAlCircuito'));

export default router;
