/* ============================================================================
   auth/usuarioActual.js  —  EL USUARIO LOGUEADO  *** PROVISORIO ***
   ----------------------------------------------------------------------------
   >>> NO HAY LOGIN. ESTO ES UNA MAQUETA. <<<
   Cualquiera que abra la app "es" uno de estos usuarios, y puede cambiar de
   uno a otro con el selector de la navbar.

   Hay un usuario por rol para que el selector cambie las dos cosas a la vez:
   el rol Y la persona. Sin eso, la auditoría de la demo mostraría siempre el
   mismo nombre firmando actos de roles distintos, que es justo lo que el
   sistema tiene que evitar.

   Los nombres coinciden a propósito con los de datos/semilla.js: así el
   historial que ya viene cargado y el que se genera usando la app quedan
   atribuidos a la misma gente.

   CUANDO EXISTA CiDiTuc: este archivo se borra. La identidad la provee el
   inicio de sesión único (capítulo 8) y el rol sale del usuario local
   vinculado a esa identidad. El Navbar no se toca: ya lee de acá.
   ============================================================================ */

export const USUARIOS_DEMO = {
  relevador: { nombre: 'Jorge Medina', email: 'jmedina@smt.gob.ar', rol: 'relevador' },
  notificador: { nombre: 'Lucía Sosa', email: 'lsosa@smt.gob.ar', rol: 'notificador' },
  administrativo: { nombre: 'Candelaria Peza', email: 'cpeza@smt.gob.ar', rol: 'administrativo' },
  coordinacion: { nombre: 'Mariano Agustín', email: 'magustin@smt.gob.ar', rol: 'coordinacion' },
  direccion: { nombre: 'Dirección de Ambiente', email: 'ambiente@smt.gob.ar', rol: 'direccion' },
  administrador: { nombre: 'Administración DITEC', email: 'ditec@smt.gob.ar', rol: 'administrador' },
  titular: { nombre: 'Ana Gómez', email: 'ana.gomez@gmail.com', rol: 'titular', cuil: '27-30111222-4' },
};

export function usuarioDeRol(rol) {
  return USUARIOS_DEMO[rol] ?? { nombre: 'Usuario', email: '', rol };
}
