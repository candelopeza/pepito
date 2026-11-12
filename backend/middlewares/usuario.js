/* ============================================================================
   backend/middlewares/usuario.js  —  QUIÉN PIDE Y CON QUÉ ROL
   ----------------------------------------------------------------------------
   El front ya sabe qué botones mostrar según el rol (src/config/modulos.js),
   pero eso es interfaz: el código viaja entero al navegador y cualquiera puede
   llamar a la API a mano. La restricción DE VERDAD es esta.

   >>> CON CiDiTuc (capítulo 8 del pliego), desde el 12/11/2026 <<<
   El front manda en cada pedido el token de CiDiTuc (Authorization: Bearer).
   cidituc.js lo verifica y saca el número de persona (id_persona). Con ese
   número se busca en la tabla `usuario`:
     - está y habilita = 1  →  req.usuario con el rol de SU tipo de usuario
                                (Accesos → Tipos de usuario manda sobre lo
                                que puede hacer). Es el personal del área.
     - no está               →  es público: rol titular, con el CUIL que
                                traiga el token, para el portal.
   Token inválido o vencido → nadie (req.usuario = null): lee lo público y no
   puede escribir. Las rutas NO se tocan: siguen usando req.usuario y
   requiereRol().

   LAS DOS CABECERAS DE ANTES (x-usuario-nombre / x-usuario-rol) solo se
   aceptan con ACEPTAR_ROL_DECLARADO=si: son para las pruebas automáticas y
   para desarrollar sin CiDiTuc. En producción se ignoran, porque cualquiera
   podría mandar el legajo de un administrador en una cabecera.
   ============================================================================ */

import { consultar } from '../conexion-bd.js';
import { ROL_POR_TUSUARIO } from '../mapeo.js';
import { personaDelToken, tokenDelPedido } from '../cidituc.js';

/* 'administrador' se sumó: es el perfil de control total que ya existía en el
   front (src/auth/roles.js) y que el backend no reconocía, así que toda
   escritura suya terminaba en 401. Ver también requiereRol() abajo. */
const ROLES_VALIDOS = ['relevador', 'notificador', 'administrativo', 'coordinacion', 'direccion', 'administrador', 'titular', 'sistema'];

/* >>> EL ROL DECLARADO POR UN USUARIO QUE NO ESTÁ EN LA BASE: APAGADO <<<
   Desde el 06/11/2026 solo entran los agentes cargados en la tabla `usuario`,
   con el rol de su tipo de usuario, igual que en producción. Un nombre que no
   está en la base no es nadie (req.usuario = null) y no puede escribir. Sigue
   sin ser un login (eso es CiDiTuc), pero no alcanza con inventarse un rol.

   La excepción son las pruebas automáticas (pruebas/*.mjs), que mandan roles
   declarados sin pasar por la base. Para correrlas se prende con una línea en
   el .env del backend de prueba, NUNCA en el de producción:

     ACEPTAR_ROL_DECLARADO=si */
export function aceptaRolDeclarado() {
  return String(process.env.ACEPTAR_ROL_DECLARADO ?? 'no').trim().toLowerCase() === 'si';
}

/* Caché de los usuarios de la base. Son tres filas hoy y no cambian entre
   pedido y pedido: consultarlas en cada request es latencia regalada. Se
   vence sola para que un alta nueva no obligue a reiniciar el servidor. */
let cache = { usuarios: null, vence: 0 };
const DURACION_CACHE_MS = 60_000;

/* `fresco`: ignorar la caché y leer la tabla ahora. Lo pide GET /sesion, que
   es el único pedido que hace la página al recargar: así un cambio de tipo de
   usuario hecho directo en la base se ve con recargar, sin esperar el minuto
   ni reiniciar. La lectura fresca renueva la caché para los demás pedidos. */
async function usuariosDeLaBase(fresco = false) {
  if (!fresco && cache.usuarios && Date.now() < cache.vence) return cache.usuarios;
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

function rolDe(registrado) {
  return ROL_POR_TUSUARIO[registrado.idTusuario] ?? 'sistema';
}

/* Se ejecuta en TODOS los pedidos (ver servidor.js). Deja en req.usuario
   { id, nombre (el id_persona), rol, cuil, nombreCompleto } o null si no vino
   nada identificable. */
export async function identificarUsuario(req, _res, next) {
  try {
    req.usuario = null;

    // 1. El token de CiDiTuc: la identificación real.
    const token = tokenDelPedido(req);
    if (token) {
      const persona = await personaDelToken(token);
      if (persona) {
        const registrado = (await usuariosDeLaBase(req.path === '/sesion')).get(persona.idPersona.toLowerCase());
        req.usuario = {
          id: registrado?.idUsuario ?? null,
          nombre: persona.idPersona,
          rol: registrado ? rolDe(registrado) : 'titular',
          cuil: persona.cuil ?? null,
          nombreCompleto: persona.nombre ?? null,
          porCidituc: true,
        };
      }
      return next();
    }

    // 2. Las cabeceras de prueba: solo en modo prueba.
    if (!aceptaRolDeclarado()) return next();
    const cabeceraNombre = req.get('x-usuario-nombre');
    const cabeceraRol = req.get('x-usuario-rol');
    if (!cabeceraNombre) return next();

    const nombre = decodeURIComponent(cabeceraNombre);
    const registrado = (await usuariosDeLaBase()).get(nombre.toLowerCase());

    if (registrado) {
      // Está en la base: manda su tipo_usuario, no lo que dijo el header.
      req.usuario = { id: registrado.idUsuario, nombre, rol: rolDe(registrado) };
    } else if (ROLES_VALIDOS.includes(cabeceraRol)) {
      // No está cargado: vale lo declarado (solo en modo prueba).
      req.usuario = { id: null, nombre, rol: cabeceraRol };
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
