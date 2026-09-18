/* ============================================================================
   backend/rutas/notificaciones.js  —  CÉDULAS (etapas 3 y 4)
   ----------------------------------------------------------------------------
   Reemplaza estas funciones de src/datos/DatosProvider.jsx:

     cedulas()            ->  GET  /notificaciones
     generarCedula        ->  POST /notificaciones            { localId }
     regenerarCedula      ->  POST /notificaciones/:id/regenerar
     asignarNotificador   ->  PUT  /notificaciones/:id/notificador  { notificadorId }
     marcarImpresa        ->  POST /notificaciones/:id/impresion
     registrarEntrega     ->  POST /notificaciones/:id/entrega      { resultado, fechaEntrega, observaciones, evidencia }

   Dos cosas que el servidor tiene que garantizar y el front no puede:
     - el número de cédula sale de la tabla `secuencias` dentro de una
       transacción: dos emisiones al mismo tiempo no pueden repetir número.
     - el vencimiento se calcula UNA vez al registrar la entrega, con
       vencimientoHabil() del dominio y los feriados de la base.
   ============================================================================ */

import { Router } from 'express';
import { consultar } from '../conexion-bd.js';

const router = Router();

/* Todas las notificaciones (la cola de emisión y las entregas las arma el front
   filtrando, igual que hoy hace vistas.js). */
router.get('/', async (_req, res, next) => {
  try {
    res.json(await consultar("SELECT * FROM actuaciones WHERE tipo = 'NOTIFICACION' ORDER BY fecha DESC, id DESC"));
  } catch (e) {
    next(e);
  }
});

const pendiente = (reemplaza) => (_req, res) =>
  res.status(501).json({ error: `Pendiente de implementar. Reemplaza a ${reemplaza} de DatosProvider.jsx` });

router.post('/', pendiente('generarCedula'));
router.post('/:id/regenerar', pendiente('regenerarCedula'));
router.put('/:id/notificador', pendiente('asignarNotificador'));
router.post('/:id/impresion', pendiente('marcarImpresa'));
router.post('/:id/entrega', pendiente('registrarEntrega'));

export default router;
