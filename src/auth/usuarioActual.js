/* ============================================================================
   auth/usuarioActual.js  —  EL USUARIO LOGUEADO  *** PROVISORIO ***
   ----------------------------------------------------------------------------
   >>> ESTO ES UNA MAQUETA. NO HAY LOGIN NI BACKEND TODAVÍA. <<<
   El nombre está escrito a mano acá abajo para poder ver cómo queda la barra
   de arriba. No sale de ningún lado: no hay sesión, no hay token, no hay
   validación. Cualquiera que abra la app "es" esta persona.

   USADO EN: components/Navbar.jsx (arriba a la derecha)

   ---------------------------------------------------------------------------
   CUANDO EXISTA EL BACKEND, ESTE ES EL ÚNICO ARCHIVO A REEMPLAZAR:
   este objeto pasa a salir de la respuesta del login (o de un contexto de
   sesión, al estilo de auth/rolContexto.js). El Navbar no se toca: ya lee
   `nombre` desde acá.
   ---------------------------------------------------------------------------

   OJO: el ROL sigue saliendo de auth/rolContexto.js, no de este archivo. Son
   dos cosas separadas a propósito: el selector de rol de la navbar es una
   herramienta de prueba para ver los permisos, y se borra aparte.
   ============================================================================ */

export const USUARIO_ACTUAL = {
  nombre: 'Mariano Agustín',
};
