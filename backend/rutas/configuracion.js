/* ============================================================================
   backend/rutas/configuracion.js  —  CATÁLOGOS, PARÁMETROS, PLANTILLA, ACCESOS
   ----------------------------------------------------------------------------
   Reemplaza estas funciones de src/datos/DatosProvider.jsx:

     usuarios / rubros / feriados   ->  GET    /configuracion/:catalogo
     guardarEnCatalogo (alta)       ->  POST   /configuracion/:catalogo
     guardarEnCatalogo (edición)    ->  PUT    /configuracion/:catalogo/:id
     eliminarDeCatalogo             ->  DELETE /configuracion/:catalogo/:id
     parametros                     ->  GET    /configuracion/parametros
     guardarParametros              ->  PUT    /configuracion/parametros   (Dirección)
     plantillaCedula                ->  GET    /configuracion/plantilla
     guardarPlantilla               ->  PUT    /configuracion/plantilla    (Dirección)
     permisos                       ->  GET    /configuracion/permisos
     guardarPermiso                 ->  PUT    /configuracion/permisos/:modulo/:rol   (SOLO rol administrador)
     restablecerPermisosDeRol       ->  DELETE /configuracion/permisos/rol/:rol       (SOLO rol administrador)
     habilitarRol                   ->  PUT    /configuracion/permisos/rol/:rol       (SOLO rol administrador) { habilitado }
     capacidades                    ->  GET    /configuracion/capacidades

   GUARDAR PARÁMETROS Y PLANTILLA necesita la tabla opcional `parametro`
   (sql/06-tabla-parametros.sql). Sin ella, los valores siguen viviendo en
   backend/parametros-sistema.js y los PUT responden 405 explicándolo. Con
   ella, la Dirección los cambia desde la pantalla sin programador, que es lo
   que pide la sección 4.1.

   LOS PERMISOS DE ACCESOS necesitan las tablas opcionales `permisos_modulos` y
   `tipos_usuario` (sql/07-tablas-accesos.sql). Sin ellas, se lee el reparto
   por defecto del código y las escrituras responden 501.

   EL NOMBRE DE LA TABLA NUNCA SE ARMA CON LO QUE MANDA EL CLIENTE. `:catalogo`
   se busca en el diccionario CATALOGOS y si no está, es 404. Concatenar el
   parámetro en el SQL sería dejar la base abierta a que alguien escriba el
   nombre de tabla que se le ocurra.
   ============================================================================ */

import { Router } from 'express';
import { exigeHistorialObservaciones } from './actuaciones.js';
import { CODIGOS_ESTADO } from '../../src/dominio/estados.js';
import { consultar, ejecutar } from '../conexion-bd.js';
import { CLAVES_PARAMETRO, feriados, parametros } from '../consultas.js';
import { aceptaRolDeclarado, firmante, olvidarUsuarios, requiereRol } from '../middlewares/usuario.js';
import { ROL_POR_TUSUARIO, TUSUARIO_POR_ROL } from '../mapeo.js';
import { capacidades, tiene } from '../capacidades.js';
import { modoGeocodificador } from '../geocodificador.js';
import { estadoTareas } from '../tareas-programadas.js';
import { MODULOS, NIVELES, esPermisoFijo } from '../../src/config/modulos.js';
import { LIMITE_ES_OFICIAL, LIMITE_MUNICIPAL } from '../limite-municipal.js';

const router = Router();

/* Los roles que se pueden asignar a una persona. 'sistema' no: es el actor de
   los procesos automáticos, no un tipo de usuario de login. */
const ROLES_ASIGNABLES = Object.keys(TUSUARIO_POR_ROL).filter((r) => r !== 'sistema');

/* ---------------------------------------------------------------------------
   CAPACIDADES  —  qué funciones opcionales están prendidas
   ---------------------------------------------------------------------------
   Lo pide el front al arrancar para no ofrecer botones que el servidor no
   puede cumplir (la constancia de impresión, guardar parámetros, ...). */
router.get('/capacidades', (_req, res) => {
  res.json({
    ...capacidades(),
    geocodificador: modoGeocodificador(),
    aceptaRolDeclarado: aceptaRolDeclarado(),
    tareaDiaria: estadoTareas(),
    // Si "Editar observaciones" se ofrece sin el historial (sql/05).
    exigeHistorialObservaciones: exigeHistorialObservaciones(),
  });
});

/* ---------------------------------------------------------------------------
   PARÁMETROS Y PLANTILLA
   ---------------------------------------------------------------------------
   Van declaradas ANTES que /:catalogo. Express prueba las rutas en orden: si
   /:catalogo estuviera primero, se quedaría con la palabra "parametros" y
   estas nunca se ejecutarían.
   --------------------------------------------------------------------------- */

router.get('/parametros', async (_req, res, next) => {
  try {
    res.json(await parametros());
  } catch (e) {
    next(e);
  }
});

/* Qué valor admite cada parámetro. Un plazo de 0 días o un tope negativo no
   son una decisión de la Dirección, son un error de tipeo: se rechazan. */
const VALIDAR_PARAMETRO = {
  plazoNotif1: (v) => Number.isInteger(v) && v >= 1 && v <= 60,
  plazoNotif2: (v) => Number.isInteger(v) && v >= 1 && v <= 60,
  contarDiaEntrega: (v) => typeof v === 'boolean',
  modoBisiesto: (v) => ['01-mar', '28-feb'].includes(v),
  exigirDatosSiempre: (v) => typeof v === 'boolean',
  emisionAutomatica: (v) => typeof v === 'boolean',
  emisionRespaldo: (v) => typeof v === 'boolean',
  topeProrrogaDias: (v) => Number.isInteger(v) && v >= 0 && v <= 365,
  maxProrrogasPorLocal: (v) => Number.isInteger(v) && v >= 0 && v <= 20,
  // { CODIGO: 'texto' }: solo códigos que existen y textos cortos. El código
  // no se toca (sección 3.1: código estable, etiqueta editable).
  etiquetasEstado: (v) =>
    v !== null &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.entries(v).every(([codigo, texto]) => CODIGOS_ESTADO.includes(codigo) && typeof texto === 'string' && texto.trim().length <= 80),
};

async function guardarClaves(req, pares) {
  for (const [clave, valor] of pares) {
    await ejecutar(
      `INSERT INTO parametro (clave, valor, modificado_por, modificado_en)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE valor = VALUES(valor), modificado_por = VALUES(modificado_por), modificado_en = NOW()`,
      [clave, JSON.stringify(valor), firmante(req)],
    );
  }
}

const SIN_TABLA_PARAMETROS =
  'Los parámetros todavía no se pueden cambiar desde la aplicación en esta base. Mientras tanto se cambian desde DITEC.';

/* PUT /configuracion/parametros  ->  solo la Dirección (sección 4.1: "editables
   únicamente desde el rol Dirección"). Se guardan solo las claves conocidas;
   cambiar un plazo NO recalcula los vencimientos ya guardados. */
router.put('/parametros', requiereRol('direccion'), async (req, res, next) => {
  try {
    if (!tiene('parametros')) return res.status(405).json({ error: SIN_TABLA_PARAMETROS, capacidad: 'parametros' });

    const cuerpo = req.body ?? {};
    const pares = [];
    for (const clave of Object.keys(VALIDAR_PARAMETRO)) {
      if (cuerpo[clave] === undefined) continue;
      if (!VALIDAR_PARAMETRO[clave](cuerpo[clave])) {
        return res.status(400).json({ error: `Valor inválido para ${clave}: ${JSON.stringify(cuerpo[clave])}` });
      }
      pares.push([clave, cuerpo[clave]]);
    }
    if (!pares.length) return res.status(400).json({ error: 'No llegó ningún parámetro para guardar' });

    await guardarClaves(req, pares);
    res.json(await parametros());
  } catch (e) {
    next(e);
  }
});

/* GET /configuracion/limite-municipal  ->  el polígono del ejido.

   Lo necesita el mapa para dibujarlo, y tiene que ser EL MISMO contra el que se
   valida en el backend: si el front dibujara su propia copia, el día que se
   cargue el KML oficial el mapa mostraría un límite y el sistema validaría
   contra otro. */
router.get('/limite-municipal', (_req, res) => {
  res.json({ poligono: LIMITE_MUNICIPAL, oficial: LIMITE_ES_OFICIAL });
});

router.get('/plantilla', async (_req, res, next) => {
  try {
    const { plantillaCedula } = await parametros();
    res.json({ texto: plantillaCedula });
  } catch (e) {
    next(e);
  }
});

/* PUT /configuracion/plantilla  ->  el texto de la cédula (sección 6.4:
   "plantilla editable por el área"). Se guarda como un parámetro más. */
router.put('/plantilla', requiereRol('coordinacion', 'direccion'), async (req, res, next) => {
  try {
    if (!tiene('parametros')) return res.status(405).json({ error: SIN_TABLA_PARAMETROS, capacidad: 'parametros' });
    const texto = String(req.body?.texto ?? '');
    if (!texto.trim()) return res.status(400).json({ error: 'La plantilla no puede quedar vacía' });
    if (texto.length > 20000) return res.status(400).json({ error: 'La plantilla es demasiado larga' });
    if (!CLAVES_PARAMETRO.includes('plantillaCedula')) throw new Error('Falta la clave plantillaCedula');

    await guardarClaves(req, [['plantillaCedula', texto]]);
    res.json({ texto });
  } catch (e) {
    next(e);
  }
});

/* ---------------------------------------------------------------------------
   ACCESOS  (qué ve y qué modifica cada rol, y qué roles están apagados)
   ---------------------------------------------------------------------------
   También van ANTES que /:catalogo, por el mismo motivo que parámetros y
   plantilla: "permisos" no es un catálogo.

   Se guardan solo las DIFERENCIAS respecto del reparto por defecto de
   src/config/modulos.js, igual que hace el front. Ese mismo archivo se usa
   acá para validar: no se puede guardar un permiso de un módulo que no
   existe, ni quitarle al administrador la pantalla de Tipos de usuario
   (FIJOS): siempre tiene que quedar una puerta para deshacer un error.
   --------------------------------------------------------------------------- */

const ACCESOS_VACIOS = { modulos: {}, rolesDeshabilitados: [] };
const SIN_TABLAS_ACCESOS = 'Los permisos por tipo de usuario todavía no se pueden guardar en esta base.';
const ROLES_DE_ACCESOS = ROLES_ASIGNABLES;

/* Devuelve la misma forma que guarda el front:
     { modulos: { [modulo]: { [rol]: 'no' | 'ver' | 'editar' } },
       rolesDeshabilitados: ['relevador', ...] }
   Sin las tablas devuelve el objeto vacío: rige el reparto del código. */
router.get('/permisos', async (_req, res, next) => {
  try {
    if (!tiene('accesos')) return res.json(ACCESOS_VACIOS);
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

function rolDeAccesos(req, res) {
  const { rol } = req.params;
  if (!ROLES_DE_ACCESOS.includes(rol)) {
    res.status(400).json({ error: `No existe el tipo de usuario ${rol}` });
    return null;
  }
  return rol;
}

// '/permisos/rol/:rol' va ANTES que '/permisos/:modulo/:rol': si no, Express
// tomaría "rol" como nombre de módulo.

/* PUT /configuracion/permisos/rol/:rol  { habilitado }  ->  prende o apaga un
   tipo de usuario entero. */
router.put('/permisos/rol/:rol', requiereRol('administrador'), async (req, res, next) => {
  try {
    if (!tiene('accesos')) return res.status(501).json({ error: SIN_TABLAS_ACCESOS, capacidad: 'accesos' });
    const rol = rolDeAccesos(req, res);
    if (!rol) return;
    if (typeof req.body?.habilitado !== 'boolean') {
      return res.status(400).json({ error: 'Falta indicar si el tipo de usuario queda habilitado (true o false)' });
    }
    await ejecutar(
      `INSERT INTO tipos_usuario (rol, habilitado) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE habilitado = VALUES(habilitado)`,
      [rol, req.body.habilitado ? 1 : 0],
    );
    res.json({ ok: true, rol, habilitado: req.body.habilitado });
  } catch (e) {
    next(e);
  }
});

/* DELETE /configuracion/permisos/rol/:rol  ->  el rol vuelve al reparto del código. */
router.delete('/permisos/rol/:rol', requiereRol('administrador'), async (req, res, next) => {
  try {
    if (!tiene('accesos')) return res.status(501).json({ error: SIN_TABLAS_ACCESOS, capacidad: 'accesos' });
    const rol = rolDeAccesos(req, res);
    if (!rol) return;
    await ejecutar('DELETE FROM permisos_modulos WHERE rol = ?', [rol]);
    res.json({ ok: true, rol });
  } catch (e) {
    next(e);
  }
});

/* PUT /configuracion/permisos/:modulo/:rol  { nivel }  ->  'no' | 'ver' | 'editar'. */
router.put('/permisos/:modulo/:rol', requiereRol('administrador'), async (req, res, next) => {
  try {
    if (!tiene('accesos')) return res.status(501).json({ error: SIN_TABLAS_ACCESOS, capacidad: 'accesos' });
    const rol = rolDeAccesos(req, res);
    if (!rol) return;
    const { modulo } = req.params;
    if (!MODULOS.some((m) => m.id === modulo)) return res.status(400).json({ error: `No existe el módulo ${modulo}` });
    const nivel = req.body?.nivel;
    if (!NIVELES.includes(nivel)) return res.status(400).json({ error: `Nivel inválido. Valores posibles: ${NIVELES.join(', ')}` });
    if (esPermisoFijo(modulo, rol) && nivel !== 'editar') {
      return res.status(409).json({ error: 'Ese permiso es fijo: el administrador siempre conserva Tipos de usuario.' });
    }
    await ejecutar(
      `INSERT INTO permisos_modulos (modulo, rol, nivel) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE nivel = VALUES(nivel)`,
      [modulo, rol, nivel],
    );
    res.json({ ok: true, modulo, rol, nivel });
  } catch (e) {
    next(e);
  }
});

/* ---------------------------------------------------------------------------
   CATÁLOGOS
   ---------------------------------------------------------------------------
   Cada entrada dice de qué tabla sale, cuál es su clave y cómo se traduce una
   fila al objeto que espera el front. `soloLectura` marca los catálogos que
   son parte del modelo y no se editan desde la pantalla: cambiar un id de
   `estado` o de `tipo_tramite` rompería la lógica que los referencia por
   número (ver backend/mapeo.js).

   `roles` dice quién escribe el catálogo (si no está, coordinación y
   dirección). `incluyeBajas` hace que la lista traiga también los dados de
   baja, marcados con `activo: false`: la pantalla de Usuarios los muestra con
   su llave apagada para poder reactivarlos.
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

  /* USUARIOS (sección 7.1: la Dirección da de alta, asigna rol y da de baja
     sin intervención técnica).

     La tabla `usuario` del área guarda id_persona (el legajo de la persona en
     el padrón municipal, el mismo que va a usar CiDiTuc) y su tipo. No tiene
     nombre ni correo: hasta que esté CiDiTuc, el nombre que se muestra es el
     legajo. El rol se recibe como texto ('notificador') y se traduce al id
     de tipo_usuario con TUSUARIO_POR_ROL; la llave "activo" es `habilita`. */
  usuarios: {
    tabla: 'usuario',
    pk: 'id_usuario',
    orden: 'id_persona',
    incluyeBajas: true,
    roles: ['direccion'],
    aFront: (f) => ({
      id: f.idUsuario,
      nombre: String(f.idPersona ?? ''),
      legajo: String(f.idPersona ?? ''),
      tipoId: f.idTusuario,
      rol: ROL_POR_TUSUARIO[f.idTusuario] ?? 'sistema',
      activo: Number(f.habilita) === 1,
    }),
    aBase: (body, { alta }) => {
      const datos = { id_persona: String(body.legajo ?? body.nombre ?? '').trim() };
      const tipo = TUSUARIO_POR_ROL[body.rol] ?? (Number(body.tipoId) || null);
      if (tipo) datos.id_tusuario = tipo;
      if (!alta && body.activo !== undefined) datos.habilita = body.activo ? 1 : 0;
      return datos;
    },
    valida: (body, { alta }) => {
      if (!String(body.legajo ?? body.nombre ?? '').trim()) return 'El usuario necesita su legajo (id de persona)';
      if (alta && !body.rol) return 'Elegí el tipo de usuario';
      if (body.rol !== undefined && !ROLES_ASIGNABLES.includes(body.rol)) return `Tipo de usuario inválido: ${body.rol}`;
      return null;
    },
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

/* Quién puede escribir: los `roles` del catálogo, o coordinación y dirección.
   El administrador siempre (ver requiereRol en middlewares/usuario.js). */
function autorizarEscritura(req, res, next) {
  const cat = CATALOGOS[req.params.catalogo];
  const roles = cat?.roles ?? ['coordinacion', 'direccion'];
  return requiereRol(...roles)(req, res, next);
}

/* Reglas propias de los usuarios, que no son de forma sino de seguridad:
   - el rol administrador solo lo da (o lo toca) otro administrador;
   - nadie se da de baja a sí mismo (quedaría afuera sin poder volver);
   - el legajo no se repite: dos usuarios con el mismo legajo serían la misma
     persona con dos roles, y el middleware no sabría cuál usar. */
async function controlarUsuario(req, body, idEditado = null) {
  const pideAdmin = body.rol === 'administrador';
  const esAdmin = req.usuario?.rol === 'administrador';
  if (pideAdmin && !esAdmin) return { status: 403, error: 'Solo un administrador puede dar el rol administrador' };

  if (idEditado) {
    const [actual] = await consultar('SELECT id_tusuario FROM usuario WHERE id_usuario = ?', [idEditado]);
    if (actual && ROL_POR_TUSUARIO[actual.idTusuario] === 'administrador' && !esAdmin) {
      return { status: 403, error: 'Solo un administrador puede modificar a otro administrador' };
    }
    if (body.activo === false && req.usuario?.id === idEditado) {
      return { status: 409, error: 'No podés darte de baja a vos mismo' };
    }
  }

  const legajo = String(body.legajo ?? body.nombre ?? '').trim();
  const [repetido] = await consultar('SELECT id_usuario, habilita FROM usuario WHERE id_persona = ? AND id_usuario <> ?', [
    legajo,
    idEditado ?? 0,
  ]);
  if (repetido) {
    return {
      status: 409,
      error:
        Number(repetido.habilita) === 1
          ? `Ya existe un usuario con el legajo ${legajo}`
          : `Ya existe un usuario con el legajo ${legajo}, dado de baja: reactivalo desde la lista`,
    };
  }
  return null;
}

router.get('/:catalogo', async (req, res, next) => {
  try {
    const cat = definicion(req, res);
    if (!cat) return;
    // El feriado sale por su propia función para que el formato coincida
    // exactamente con el que consume el cómputo de días hábiles.
    if (req.params.catalogo === 'feriados') return res.json(await feriados());

    const filtro = cat.incluyeBajas ? '' : 'WHERE habilita = 1';
    const filas = await consultar(`SELECT * FROM ${cat.tabla} ${filtro} ORDER BY ${cat.orden}`);
    res.json(filas.map(cat.aFront));
  } catch (e) {
    next(e);
  }
});

router.post('/:catalogo', autorizarEscritura, async (req, res, next) => {
  try {
    const cat = definicion(req, res);
    if (!cat) return;
    if (cat.soloLectura) return res.status(405).json({ error: `El catálogo ${req.params.catalogo} no se edita` });

    const body = req.body ?? {};
    const error = cat.valida?.(body, { alta: true });
    if (error) return res.status(400).json({ error });

    if (req.params.catalogo === 'usuarios') {
      const problema = await controlarUsuario(req, body);
      if (problema) return res.status(problema.status).json({ error: problema.error });
    }

    const datos = cat.aBase(body, { alta: true });
    const columnas = Object.keys(datos);
    const marcadores = columnas.map(() => '?').join(', ');
    const resultado = await ejecutar(
      `INSERT INTO ${cat.tabla} (${columnas.join(', ')}, habilita) VALUES (${marcadores}, 1)`,
      Object.values(datos),
    );
    if (req.params.catalogo === 'usuarios') olvidarUsuarios();

    const [fila] = await consultar(`SELECT * FROM ${cat.tabla} WHERE ${cat.pk} = ?`, [resultado.insertId]);
    res.status(201).json(cat.aFront(fila));
  } catch (e) {
    next(e);
  }
});

router.put('/:catalogo/:id', autorizarEscritura, async (req, res, next) => {
  try {
    const cat = definicion(req, res);
    if (!cat) return;
    if (cat.soloLectura) return res.status(405).json({ error: `El catálogo ${req.params.catalogo} no se edita` });

    const id = Number(req.params.id);
    const body = req.body ?? {};
    const error = cat.valida?.(body, { alta: false });
    if (error) return res.status(400).json({ error });

    if (req.params.catalogo === 'usuarios') {
      const problema = await controlarUsuario(req, body, id);
      if (problema) return res.status(problema.status).json({ error: problema.error });
    }

    const datos = cat.aBase(body, { alta: false });
    const asignaciones = Object.keys(datos).map((c) => `${c} = ?`).join(', ');
    // Los catálogos que muestran las bajas también las dejan editar: es la
    // forma de reactivar un usuario.
    const soloActivos = cat.incluyeBajas ? '' : ' AND habilita = 1';
    const resultado = await ejecutar(
      `UPDATE ${cat.tabla} SET ${asignaciones} WHERE ${cat.pk} = ?${soloActivos}`,
      [...Object.values(datos), id],
    );
    if (!resultado.affectedRows) return res.status(404).json({ error: 'No existe ese registro' });
    if (req.params.catalogo === 'usuarios') olvidarUsuarios();

    const [fila] = await consultar(`SELECT * FROM ${cat.tabla} WHERE ${cat.pk} = ?`, [id]);
    res.json(cat.aFront(fila));
  } catch (e) {
    next(e);
  }
});

/* Baja LÓGICA, igual que en el resto de la base: habilita = 0. Un rubro que se
   borrara de verdad dejaría 300 locales apuntando a un id que ya no existe. */
router.delete('/:catalogo/:id', autorizarEscritura, async (req, res, next) => {
  try {
    const cat = definicion(req, res);
    if (!cat) return;
    if (cat.soloLectura) return res.status(405).json({ error: `El catálogo ${req.params.catalogo} no se edita` });

    const id = Number(req.params.id);
    if (req.params.catalogo === 'usuarios') {
      if (req.usuario?.id === id) return res.status(409).json({ error: 'No podés darte de baja a vos mismo' });
      const [actual] = await consultar('SELECT id_tusuario FROM usuario WHERE id_usuario = ?', [id]);
      if (actual && ROL_POR_TUSUARIO[actual.idTusuario] === 'administrador' && req.usuario?.rol !== 'administrador') {
        return res.status(403).json({ error: 'Solo un administrador puede dar de baja a otro administrador' });
      }
    }

    const resultado = await ejecutar(`UPDATE ${cat.tabla} SET habilita = 0 WHERE ${cat.pk} = ?`, [id]);
    if (!resultado.affectedRows) return res.status(404).json({ error: 'No existe ese registro' });
    if (req.params.catalogo === 'usuarios') olvidarUsuarios();

    res.json({ ok: true, id });
  } catch (e) {
    next(e);
  }
});

export default router;
