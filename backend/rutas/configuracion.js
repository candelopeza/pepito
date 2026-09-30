/* ============================================================================
   backend/rutas/configuracion.js  —  CATÁLOGOS, PARÁMETROS Y PLANTILLA
   ----------------------------------------------------------------------------
   Reemplaza estas funciones de src/datos/DatosProvider.jsx:

     usuarios / rubros / feriados   ->  GET    /configuracion/:catalogo
     guardarEnCatalogo (alta)       ->  POST   /configuracion/:catalogo
     guardarEnCatalogo (edición)    ->  PUT    /configuracion/:catalogo/:id
     eliminarDeCatalogo             ->  DELETE /configuracion/:catalogo/:id
     parametros                     ->  GET    /configuracion/parametros
     plantillaCedula                ->  GET    /configuracion/plantilla
<<<<<<< HEAD
     guardarPlantilla               ->  PUT    /configuracion/plantilla
     permisos                       ->  GET    /configuracion/permisos
     guardarPermiso                 ->  PUT    /configuracion/permisos/:modulo/:rol   (SOLO rol administrador)
     restablecerPermisosDeRol       ->  DELETE /configuracion/permisos/rol/:rol       (SOLO rol administrador)
     habilitarRol                   ->  PUT    /configuracion/permisos/rol/:rol       (SOLO rol administrador) { habilitado }
=======
>>>>>>> origin/cande

   GUARDAR parámetros y plantilla NO está soportado: viven en el código
   (backend/parametros-sistema.js) y no en una tabla, así que se cambian
   editando ese archivo. Los PUT responden 405 y lo explican.

   EL NOMBRE DE LA TABLA NUNCA SE ARMA CON LO QUE MANDA EL CLIENTE. `:catalogo`
   se busca en el diccionario CATALOGOS y si no está, es 404. Concatenar el
   parámetro en el SQL sería dejar la base abierta a que alguien escriba el
   nombre de tabla que se le ocurra.

   EL ÚNICO CATÁLOGO QUE ESTE SISTEMA AGREGÓ A LA BASE ES `feriado`. Los demás
   (rubro, usuario, y los de solo lectura) ya estaban.
   ============================================================================ */

import { Router } from 'express';
import { consultar, ejecutar } from '../conexion-bd.js';
import { feriados, parametros } from '../consultas.js';
import { requiereRol } from '../middlewares/usuario.js';
import { ROL_POR_TUSUARIO } from '../mapeo.js';

const router = Router();

/* ---------------------------------------------------------------------------
   PARÁMETROS Y PLANTILLA  (salen de backend/parametros-sistema.js)
   ---------------------------------------------------------------------------
   Van declaradas ANTES que /:catalogo. Express prueba las rutas en orden: si
   /:catalogo estuviera primero, se quedaría con la palabra "parametros" y
   estas dos nunca se ejecutarían.
   --------------------------------------------------------------------------- */

router.get('/parametros', async (_req, res, next) => {
  try {
    res.json(await parametros());
  } catch (e) {
    next(e);
  }
});

/* PUT /configuracion/parametros  ->  no soportado.

   Los plazos, el tope de prórroga y el resto de los parámetros están en
   backend/parametros-sistema.js. Se decidió no agregar una tabla `parametro`,
   así que cambiarlos es editar ese archivo y reiniciar el backend.

   Responde 405 y no 501 a propósito: no es que falte implementarlo, es que este
   recurso no admite escritura tal como está el sistema hoy. */
router.put('/parametros', (_req, res) => {
  res.status(405).json({
    error:
      'Los parámetros no se editan desde la aplicación: están en backend/parametros-sistema.js. ' +
      'Para que Dirección pueda cambiarlos sola hace falta una tabla `parametro`.',
  });
});

router.get('/plantilla', async (_req, res, next) => {
  try {
    const { plantillaCedula } = await parametros();
    res.json({ texto: plantillaCedula });
  } catch (e) {
    next(e);
  }
});

<<<<<<< HEAD
/* Accesos: qué ve y qué modifica cada rol, y qué roles están apagados.
   Devuelve la misma forma que guarda el front:
     { modulos: { [modulo]: { [rol]: 'no' | 'ver' | 'editar' } },
       rolesDeshabilitados: ['relevador', ...] }
   Solo las diferencias respecto del reparto por defecto de src/config/modulos.js. */
router.get('/permisos', async (_req, res, next) => {
  try {
    const filas = await consultar('SELECT modulo, rol, nivel FROM permisos_modulos');
    const modulos = {};
    filas.forEach((f) => {
      modulos[f.modulo] = { ...(modulos[f.modulo] ?? {}), [f.rol]: f.nivel };
    });
    const apagados = await consultar('SELECT rol FROM tipos_usuario WHERE habilitado = 0');
    res.json({ modulos, rolesDeshabilitados: apagados.map((t) => t.rol) });
  } catch (e) {
    next(e);
  }
});

=======
/* PUT /configuracion/plantilla  ->  no soportado, por el mismo motivo. */
router.put('/plantilla', (_req, res) => {
  res.status(405).json({
    error:
      'La plantilla de la cédula está en backend/parametros-sistema.js y se edita ahí. ' +
      'Es el candidato más claro a mudarse a la base si el área quiere redactarla por su cuenta.',
  });
});

/* ---------------------------------------------------------------------------
   CATÁLOGOS
   ---------------------------------------------------------------------------
   Cada entrada dice de qué tabla sale, cuál es su clave y cómo se traduce una
   fila al objeto que espera el front. `soloLectura` marca los catálogos que
   son parte del modelo y no se editan desde la pantalla: cambiar un id de
   `estado` o de `tipo_tramite` rompería la lógica que los referencia por
   número (ver backend/mapeo.js).
   --------------------------------------------------------------------------- */
const CATALOGOS = {
  rubros: {
    tabla: 'rubro',
    pk: 'id_rubro',
    orden: 'nombre_rubro',
    aFront: (f) => ({ id: f.idRubro, nombre: f.nombreRubro }),
    // Los rubros se guardan en mayúsculas, como el resto del catálogo.
    aBase: (body) => ({ nombre_rubro: String(body.nombre ?? '').trim().toUpperCase() }),
    valida: (body) => (String(body.nombre ?? '').trim() ? null : 'El rubro necesita un nombre'),
  },
  usuarios: {
    tabla: 'usuario',
    pk: 'id_usuario',
    orden: 'id_persona',
    aFront: (f) => ({
      id: f.idUsuario,
      nombre: f.idPersona,
      tipoId: f.idTusuario,
      rol: ROL_POR_TUSUARIO[f.idTusuario] ?? 'sistema',
    }),
    aBase: (body) => ({
      id_persona: String(body.nombre ?? '').trim(),
      id_tusuario: Number(body.tipoId) || 1,
    }),
    valida: (body) => (String(body.nombre ?? '').trim() ? null : 'El usuario necesita un identificador de persona'),
  },
  feriados: {
    tabla: 'feriado',
    pk: 'id_feriado',
    orden: 'fecha_feriado',
    aFront: (f) => ({
      id: f.idFeriado,
      fecha: String(f.fechaFeriado).slice(0, 10),
      motivo: f.nombreFeriado,
      alcance: f.alcance,
    }),
    aBase: (body) => ({
      fecha_feriado: body.fecha,
      nombre_feriado: String(body.motivo ?? '').trim(),
      alcance: ['nacional', 'provincial', 'municipal'].includes(body.alcance) ? body.alcance : 'nacional',
    }),
    valida: (body) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.fecha ?? ''))) return 'La fecha del feriado tiene que ser AAAA-MM-DD';
      if (!String(body.motivo ?? '').trim()) return 'El feriado necesita un motivo';
      return null;
    },
  },
  // --- de solo lectura: son el modelo, no configuración -------------------
  estados: {
    tabla: 'estado',
    pk: 'id_estado',
    orden: 'id_estado',
    soloLectura: true,
    aFront: (f) => ({ id: f.idEstado, nombre: f.nombreEstado, objetoId: f.idObjeto }),
  },
  'tipos-tramite': {
    tabla: 'tipo_tramite',
    pk: 'id_ttramite',
    orden: 'id_ttramite',
    soloLectura: true,
    aFront: (f) => ({ id: f.idTtramite, nombre: f.nombreTtramite, objetoId: f.idObjeto }),
  },
  'tipos-usuario': {
    tabla: 'tipo_usuario',
    pk: 'id_tusuario',
    orden: 'id_tusuario',
    soloLectura: true,
    aFront: (f) => ({ id: f.idTusuario, nombre: f.nombreTusuario, rol: ROL_POR_TUSUARIO[f.idTusuario] ?? 'sistema' }),
  },
  objetos: {
    tabla: 'objeto',
    pk: 'id_objeto',
    orden: 'id_objeto',
    soloLectura: true,
    aFront: (f) => ({ id: f.idObjeto, nombre: f.nombreObjeto }),
  },
};

/* Busca la definición del catálogo o responde 404. Devuelve null si no existe,
   y en ese caso la ruta ya respondió y tiene que cortar. */
function definicion(req, res) {
  const cat = CATALOGOS[req.params.catalogo];
  if (!cat) {
    res.status(404).json({ error: `No existe el catálogo ${req.params.catalogo}` });
    return null;
  }
  return cat;
}

>>>>>>> origin/cande
router.get('/:catalogo', async (req, res, next) => {
  try {
    const cat = definicion(req, res);
    if (!cat) return;
    // El feriado sale por su propia función para que el formato coincida
    // exactamente con el que consume el cómputo de días hábiles.
    if (req.params.catalogo === 'feriados') return res.json(await feriados());

    const filas = await consultar(`SELECT * FROM ${cat.tabla} WHERE habilita = 1 ORDER BY ${cat.orden}`);
    res.json(filas.map(cat.aFront));
  } catch (e) {
    next(e);
  }
});

router.post('/:catalogo', requiereRol('coordinacion', 'direccion'), async (req, res, next) => {
  try {
    const cat = definicion(req, res);
    if (!cat) return;
    if (cat.soloLectura) return res.status(405).json({ error: `El catálogo ${req.params.catalogo} no se edita` });

<<<<<<< HEAD
router.put('/parametros', pendiente('guardarParametros'));
// '/permisos/rol/:rol' va ANTES que '/permisos/:modulo/:rol': si no, Express
// tomaría "rol" como nombre de módulo.
router.put('/permisos/rol/:rol', pendiente('habilitarRol'));
router.delete('/permisos/rol/:rol', pendiente('restablecerPermisosDeRol'));
router.put('/permisos/:modulo/:rol', pendiente('guardarPermiso'));
router.put('/plantilla', pendiente('guardarPlantilla'));
router.post('/:catalogo', pendiente('guardarEnCatalogo (alta)'));
router.put('/:catalogo/:id', pendiente('guardarEnCatalogo (edición)'));
router.delete('/:catalogo/:id', pendiente('eliminarDeCatalogo'));
=======
    const error = cat.valida?.(req.body ?? {});
    if (error) return res.status(400).json({ error });

    const datos = cat.aBase(req.body ?? {});
    const columnas = Object.keys(datos);
    const marcadores = columnas.map(() => '?').join(', ');
    const resultado = await ejecutar(
      `INSERT INTO ${cat.tabla} (${columnas.join(', ')}, habilita) VALUES (${marcadores}, 1)`,
      Object.values(datos),
    );

    const [fila] = await consultar(`SELECT * FROM ${cat.tabla} WHERE ${cat.pk} = ?`, [resultado.insertId]);
    res.status(201).json(cat.aFront(fila));
  } catch (e) {
    next(e);
  }
});

router.put('/:catalogo/:id', requiereRol('coordinacion', 'direccion'), async (req, res, next) => {
  try {
    const cat = definicion(req, res);
    if (!cat) return;
    if (cat.soloLectura) return res.status(405).json({ error: `El catálogo ${req.params.catalogo} no se edita` });

    const error = cat.valida?.(req.body ?? {});
    if (error) return res.status(400).json({ error });

    const datos = cat.aBase(req.body ?? {});
    const asignaciones = Object.keys(datos).map((c) => `${c} = ?`).join(', ');
    const resultado = await ejecutar(
      `UPDATE ${cat.tabla} SET ${asignaciones} WHERE ${cat.pk} = ? AND habilita = 1`,
      [...Object.values(datos), Number(req.params.id)],
    );
    if (!resultado.affectedRows) return res.status(404).json({ error: 'No existe ese registro' });

    const [fila] = await consultar(`SELECT * FROM ${cat.tabla} WHERE ${cat.pk} = ?`, [Number(req.params.id)]);
    res.json(cat.aFront(fila));
  } catch (e) {
    next(e);
  }
});

/* Baja LÓGICA, igual que en el resto de la base: habilita = 0. Un rubro que se
   borrara de verdad dejaría 300 locales apuntando a un id que ya no existe. */
router.delete('/:catalogo/:id', requiereRol('coordinacion', 'direccion'), async (req, res, next) => {
  try {
    const cat = definicion(req, res);
    if (!cat) return;
    if (cat.soloLectura) return res.status(405).json({ error: `El catálogo ${req.params.catalogo} no se edita` });

    const resultado = await ejecutar(
      `UPDATE ${cat.tabla} SET habilita = 0 WHERE ${cat.pk} = ?`,
      [Number(req.params.id)],
    );
    if (!resultado.affectedRows) return res.status(404).json({ error: 'No existe ese registro' });

    res.json({ ok: true, id: Number(req.params.id) });
  } catch (e) {
    next(e);
  }
});
>>>>>>> origin/cande

export default router;
