/* ============================================================================
   backend/rutas/herramientas.js  —  DUPLICADOS, GEOCODIFICACIÓN, INFORME 9DJ
   ----------------------------------------------------------------------------
   Reemplaza estas funciones de src/datos/DatosProvider.jsx:

     fusionarLocales           ->  POST /herramientas/fusiones        { idPrincipal, idDuplicado }
     fusiones (lista)          ->  GET  /herramientas/fusiones
     geocodificarPendientes    ->  POST /herramientas/geocodificar
     aplicarInforme9DJ         ->  POST /herramientas/informe-9dj     { filas: [...] }
     auditoria (lista)         ->  GET  /herramientas/auditoria

   La detección de duplicados (dominio/duplicados.js) sigue corriendo en el
   front sobre la lista de locales: es solo lectura.
   ============================================================================ */

import { Router } from 'express';
import { consultar } from '../conexion-bd.js';

const router = Router();

router.get('/fusiones', async (_req, res, next) => {
  try {
    res.json(await consultar('SELECT * FROM fusiones ORDER BY momento DESC'));
  } catch (e) {
    next(e);
  }
});

router.get('/auditoria', async (_req, res, next) => {
  try {
    res.json(await consultar('SELECT * FROM auditoria ORDER BY momento DESC LIMIT 500'));
  } catch (e) {
    next(e);
  }
});

const pendiente = (reemplaza) => (_req, res) =>
  res.status(501).json({ error: `Pendiente de implementar. Reemplaza a ${reemplaza} de DatosProvider.jsx` });

router.post('/fusiones', pendiente('fusionarLocales'));
router.post('/geocodificar', pendiente('geocodificarPendientes'));
router.post('/informe-9dj', pendiente('aplicarInforme9DJ'));

export default router;
