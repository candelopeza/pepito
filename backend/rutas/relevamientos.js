/* ============================================================================
   backend/rutas/relevamientos.js  —  CAMPO Y CONTROL ADMINISTRATIVO
   ----------------------------------------------------------------------------
   Reemplaza estas funciones de src/datos/DatosProvider.jsx:

     relevamientos (lista)     ->  GET  /relevamientos
     crearRelevamiento         ->  POST /relevamientos          (rol relevador)
     revisarRelevamiento       ->  POST /relevamientos/:localId/revision  (rol coordinacion)

   Recordar: el relevador NO carga CUIT ni razón social (sección 6.2). El
   servidor tiene que rechazar esos campos si vienen, no solo el formulario.
   ============================================================================ */

import { Router } from 'express';
import { consultar } from '../conexion-bd.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    res.json(await consultar('SELECT * FROM relevamientos ORDER BY fecha_hora DESC'));
  } catch (e) {
    next(e);
  }
});

const pendiente = (reemplaza) => (_req, res) =>
  res.status(501).json({ error: `Pendiente de implementar. Reemplaza a ${reemplaza} de DatosProvider.jsx` });

router.post('/', pendiente('crearRelevamiento'));
router.post('/:localId/revision', pendiente('revisarRelevamiento'));

export default router;
