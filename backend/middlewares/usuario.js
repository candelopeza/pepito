/* ============================================================================
   backend/middlewares/usuario.js  —  QUIÉN PIDE Y CON QUÉ ROL
   ----------------------------------------------------------------------------
   El front ya sabe qué botones mostrar según el rol (src/config/modulos.js),
   pero eso es interfaz: el código viaja entero al navegador y cualquiera puede
   llamar a la API a mano. La restricción DE VERDAD es esta.

   >>> PROVISORIO HASTA CiDiTuc (capítulo 8 del pliego) <<<
   Hoy no hay login. El front manda en cada pedido dos headers:
     x-usuario-nombre: Mariano Agustín
     x-usuario-rol:    coordinacion
   y el servidor les cree. Cuando exista el inicio de sesión único, este
   archivo cambia para leer el token y buscar el usuario en la tabla `usuarios`.
   Las rutas NO se tocan: siguen usando req.usuario y requiereRol().
   ============================================================================ */

const ROLES_VALIDOS = ['relevador', 'notificador', 'administrativo', 'coordinacion', 'direccion', 'titular', 'sistema'];

/* Se ejecuta en TODOS los pedidos (ver servidor.js). Deja en req.usuario
   { nombre, rol } o null si no vino nada. */
export function identificarUsuario(req, _res, next) {
  const nombre = req.get('x-usuario-nombre');
  const rol = req.get('x-usuario-rol');
  req.usuario = nombre && ROLES_VALIDOS.includes(rol) ? { nombre: decodeURIComponent(nombre), rol } : null;
  next();
}

/* Se pone en las rutas que necesitan un rol puntual.

   Ejemplo:
     router.post('/:id/bloqueo', requiereRol('coordinacion'), async (req, res) => { ... });
     router.put('/parametros', requiereRol('direccion'), ...);
*/
export function requiereRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ error: 'Falta identificar al usuario' });
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
