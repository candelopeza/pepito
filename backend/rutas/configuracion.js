/* ============================================================================
   backend/rutas/configuracion.js  —  CATÁLOGOS, PARÁMETROS Y PLANTILLA
   ----------------------------------------------------------------------------
   Reemplaza estas funciones de src/datos/DatosProvider.jsx:

     usuarios / rubros / feriados   ->  GET    /configuracion/:catalogo
     guardarEnCatalogo (alta)       ->  POST   /configuracion/:catalogo
     guardarEnCatalogo (edición)    ->  PUT    /configuracion/:catalogo/:id
     eliminarDeCatalogo             ->  DELETE /configuracion/:catalogo/:id
     parametros                     ->  GET    /configuracion/parametros
     guardarParametros              ->  PUT    /configuracion/parametros     (SOLO rol direccion)
     plantillaCedula                ->  GET    /configuracion/plantilla
     guardarPlantilla               ->  PUT    /configuracion/plantilla

   `:catalogo` solo puede ser uno de CATALOGOS. Nunca se arma el nombre de la
   tabla con lo que manda el cliente sin pasar por esa lista.
   ============================================================================ */

import { Router } from 'express';
import { consultar } from '../conexion-bd.js';

const router = Router();

/* Catálogos administrables desde Configuración. Clave = nombre de tabla. */
const CATALOGOS = ['usuarios', 'rubros', 'feriados'];

function tablaDeCatalogo(req, res) {
  const { catalogo } = req.params;
  if (!CATALOGOS.includes(catalogo)) {
    res.status(404).json({ error: `No existe el catálogo ${catalogo}` });
    return null;
  }
  return catalogo;
}

/* Parámetros del sistema: una sola fila (id = 1). */
router.get('/parametros', async (_req, res, next) => {
  try {
    const [fila] = await consultar('SELECT * FROM parametros WHERE id = 1');
    res.json(fila ?? {});
  } catch (e) {
    next(e);
  }
});

router.get('/plantilla', async (_req, res, next) => {
  try {
    const [fila] = await consultar('SELECT plantilla_cedula FROM parametros WHERE id = 1');
    res.json({ texto: fila?.plantillaCedula ?? '' });
  } catch (e) {
    next(e);
  }
});

router.get('/:catalogo', async (req, res, next) => {
  try {
    const tabla = tablaDeCatalogo(req, res);
    if (!tabla) return;
    res.json(await consultar(`SELECT * FROM ${tabla} ORDER BY id`));
  } catch (e) {
    next(e);
  }
});

const pendiente = (reemplaza) => (_req, res) =>
  res.status(501).json({ error: `Pendiente de implementar. Reemplaza a ${reemplaza} de DatosProvider.jsx` });

router.put('/parametros', pendiente('guardarParametros'));
router.put('/plantilla', pendiente('guardarPlantilla'));
router.post('/:catalogo', pendiente('guardarEnCatalogo (alta)'));
router.put('/:catalogo/:id', pendiente('guardarEnCatalogo (edición)'));
router.delete('/:catalogo/:id', pendiente('eliminarDeCatalogo'));

export default router;
