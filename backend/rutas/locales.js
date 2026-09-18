/* ============================================================================
   backend/rutas/locales.js  —  EL PADRÓN
   ----------------------------------------------------------------------------
   Reemplaza estas funciones de src/datos/DatosProvider.jsx:

     localesConEstado / localPorId   ->  GET    /locales, GET /locales/:id
     guardarLocal (alta)             ->  POST   /locales
     guardarLocal (edición)          ->  PUT    /locales/:id
     eliminarLocal                   ->  DELETE /locales/:id
     bloquearLocal                   ->  POST   /locales/:id/bloqueo
     desbloquearLocal                ->  DELETE /locales/:id/bloqueo

   EL ESTADO NO SE GUARDA EN NINGUNA COLUMNA. Se calcula con resolverEstado()
   del dominio, igual que hace el front hoy. Por eso este archivo importa
   ../../src/dominio: son las mismas reglas, no una copia.
   ============================================================================ */

import { Router } from 'express';
import { consultar } from '../conexion-bd.js';
import { resolverEstado } from '../../src/dominio/reglas.js';
import { hoyISO } from '../../src/dominio/fechas.js';

const router = Router();

/* Trae todas las actuaciones de una vez. resolverEstado() recibe la lista
   completa y filtra por local, así que con 2.000 locales sigue siendo una
   sola consulta y no 2.000. */
async function actuacionesTodas() {
  return consultar('SELECT * FROM actuaciones ORDER BY fecha, id');
}

/* GET /locales  ->  el padrón completo con el estado calculado de cada local */
router.get('/', async (_req, res, next) => {
  try {
    const hoy = hoyISO();
    const [locales, actuaciones] = await Promise.all([
      consultar('SELECT * FROM locales ORDER BY id'),
      actuacionesTodas(),
    ]);
    res.json(locales.map((l) => ({ ...l, estado: resolverEstado(l, actuaciones, { hoy }) })));
  } catch (e) {
    next(e);
  }
});

/* GET /locales/:id  ->  un local con su estado, actuaciones y relevamientos */
router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [local] = await consultar('SELECT * FROM locales WHERE id = ?', [id]);
    if (!local) return res.status(404).json({ error: 'Local no encontrado' });

    const [actuaciones, relevamientos, auditoria] = await Promise.all([
      consultar('SELECT * FROM actuaciones WHERE local_id = ? ORDER BY fecha, id', [id]),
      consultar('SELECT * FROM relevamientos WHERE local_id = ? ORDER BY fecha_hora', [id]),
      consultar('SELECT * FROM auditoria WHERE local_id = ? ORDER BY momento', [id]),
    ]);

    res.json({
      ...local,
      estado: resolverEstado(local, actuaciones, { hoy: hoyISO() }),
      actuaciones,
      relevamientos,
      auditoria,
    });
  } catch (e) {
    next(e);
  }
});

/* --- PENDIENTES: se completan en el próximo paso -------------------------- */
const pendiente = (reemplaza) => (_req, res) =>
  res.status(501).json({ error: `Pendiente de implementar. Reemplaza a ${reemplaza} de DatosProvider.jsx` });

router.post('/', pendiente('guardarLocal (alta)'));
router.put('/:id', pendiente('guardarLocal (edición)'));
router.delete('/:id', pendiente('eliminarLocal'));
router.post('/:id/bloqueo', pendiente('bloquearLocal'));
router.delete('/:id/bloqueo', pendiente('desbloquearLocal'));

export default router;
