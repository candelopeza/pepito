/* ============================================================================
   backend/middlewares/usuario.js  —  QUIÉN PIDE Y CON QUÉ ROL
   ----------------------------------------------------------------------------
   El front ya sabe qué botones mostrar según el rol (src/config/modulos.js),
   pero eso es interfaz: el código viaja entero al navegador y cualquiera puede
   llamar a la API a mano. La restricción DE VERDAD es esta.

   >>> PROVISORIO HASTA CiDiTuc (capítulo 8 del pliego) <<<
   Hoy no hay login. El front manda en cada pedido dos headers:
     x-usuario-nombre: el id_persona del agente en el padrón municipal
     x-usuario-rol:    coordinacion
   y el servidor les cree. Cuando exista el inicio de sesión único, este
   archivo cambia para leer el token. Las rutas NO se tocan: siguen usando
   req.usuario y requiereRol().

   LO QUE SÍ SE VERIFICA CONTRA LA BASE: si el nombre coincide con un
   `id_persona` de la tabla `usuario`, se toma el rol de SU tipo_usuario y no
   el que vino en el header. Un agente cargado en la base no puede subirse el
   rol editando un header; solo los que no están cargados usan lo declarado.
   ============================================================================ */

import { consultar } from '../conexion-bd.js';
import { ROL_POR_TUSUARIO } from '../mapeo.js';

/* 'administrador' se sumó: es el perfil de control total que ya existía en el
   front (src/auth/roles.js) y que el backend no reconocía, así que toda
   escritura suya terminaba en 401. Ver también requiereRol() abajo. */
const ROLES_VALIDOS = ['relevador', 'notificador', 'administrativo', 'coordinacion', 'direccion', 'administrador', 'titular', 'sistema'];

/* >>> EL ROL DECLARADO POR UN USUARIO QUE NO ESTÁ EN LA BASE <<<
   Mientras se prueba, hace falta poder entrar con cualquier rol aunque la
   tabla `usuario` tenga tres filas: por eso, por defecto, se acepta el rol
   que manda el navegador. En producción eso es inaceptable (cualquiera se
   declara coordinación), así que se apaga con una línea en el .env:

     ACEPTAR_ROL_DECLARADO=no

   Con eso solo entran los agentes cargados en la tabla `usuario`, con el rol
   de su tipo de usuario. Sigue sin ser un login (eso es CiDiTuc), pero ya no
   alcanza con inventarse un rol. */
export function aceptaRolDeclarado() {
  return String(process.env.ACEPTAR_ROL_DECLARADO ?? 'si').trim().toLowerCase() !== 'no';
}

/* Caché de los usuarios de la base. Son tres filas hoy y no cambian entre
   pedido y pedido: consultarlas en cada request es latencia regalada. Se
   vence sola para que un alta nueva no obligue a reiniciar el servidor. */
let cache = { usuarios: null, vence: 0 };
const DURACION_CACHE_MS = 60_000;

async function usuariosDeLaBase() {
  if (cache.usuarios && Date.now() < cache.vence) return cache.usuarios;
  const filas = await consultar('SELECT id_usuario, id_persona, id_tusuario FROM usuario WHERE habilita = 1');
  const mapa = new Map(filas.map((u) => [String(u.idPersona).toLowerCase(), u]));
  cache = { usuarios: mapa, vence: Date.now() + DURACION_CACHE_MS };
  return mapa;
}

/* Se llama después de dar de alta, editar o dar de baja un usuario desde
   Accesos → Usuarios: el cambio vale en el próximo pedido, sin esperar el
   minuto de la caché. */
export function olvidarUsuarios() {
  cache = { usuarios: null, vence: 0 };
}

/* Se ejecuta en TODOS los pedidos (ver servidor.js). Deja en req.usuario
   { id, nombre, rol } o null si no vino nada identificable. */
export async function identificarUsuario(req, _res, next) {
  try {
    const cabeceraNombre = req.get('x-usuario-nombre');
    const cabeceraRol = req.get('x-usuario-rol');
    if (!cabeceraNombre) {
      req.usuario = null;
      return next();
    }

    const nombre = decodeURIComponent(cabeceraNombre);
    const registrado = (await usuariosDeLaBase()).get(nombre.toLowerCase());

    if (registrado) {
      // Está en la base: manda su tipo_usuario, no lo que dijo el header.
      req.usuario = {
        id: registrado.idUsuario,
        nombre,
        rol: ROL_POR_TUSUARIO[registrado.idTusuario] ?? 'sistema',
      };
    } else if (aceptaRolDeclarado() && ROLES_VALIDOS.includes(cabeceraRol)) {
      // No está cargado todavía: vale lo declarado, como antes.
      req.usuario = { id: null, nombre, rol: cabeceraRol };
    } else {
      req.usuario = null;
    }
    next();
  } catch (e) {
    next(e);
  }
}

/* Se pone en las rutas que necesitan un rol puntual.

   Ejemplo:
     router.post('/:id/bloqueo', requiereRol('coordinacion'), async (req, res) => { ... });
     router.put('/parametros', requiereRol('direccion'), ...);
*/
export function requiereRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ error: 'Falta identificar al usuario' });
    // El administrador es el perfil de control total (src/auth/roles.js):
    // pasa por cualquier ruta, igual que en el front ve y ejecuta todo.
    if (req.usuario.rol === 'administrador') return next();
    if (!roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: `El rol ${req.usuario.rol} no puede hacer esto` });
    }
    next();
  };
}

/* Nombre para firmar actuaciones y auditoría. Si no hay usuario, firma el
   sistema (procesos automáticos, sección 7.2). */
export function firmante(req) {
  return req.usuario?.nombre ?? 'Sistema';
}
