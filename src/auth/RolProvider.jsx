/* ============================================================================
   auth/RolProvider.jsx  —  GUARDA QUIÉN ES EL USUARIO Y CON QUÉ ROL ENTRÓ
   ----------------------------------------------------------------------------
   Es la mitad ESCRITURA del sistema de roles. Para LEER desde una pantalla se
   usa `useRol()` de auth/rolContexto.js, nunca este archivo.

   QUÉ REPARTE:
     rol       el id del rol activo ('coordinacion', 'relevador', ...)
     datosRol  el objeto completo del rol, con etiqueta y descripción
     usuario   la persona: { nombre, email, rol }
     setRol    PROVISORIO, cambia rol y usuario juntos
     agente / elegirAgente  PROVISORIO: "firmar como" un usuario cargado en
               la base (tabla `usuario`). Con eso el backend reconoce a la
               persona por su legajo, toma el rol de la base y los actos quedan
               a su nombre en la auditoría. Sin elegir, es el usuario de prueba
               del rol (auth/usuarioActual.js), como antes.

   POR QUÉ EL USUARIO VIVE ACÁ Y NO EN EL STORE DE DATOS: porque el store lo
   necesita (firma la auditoría con el nombre del usuario), y si el usuario
   viviera adentro del store habría una dependencia circular. Por eso en
   App.jsx el orden es <RolProvider> por fuera y <DatosProvider> por dentro.

   >>> PROVISORIO <<<
   CUANDO HAYA LOGIN se cambia SOLO ESTE ARCHIVO: el rol y el usuario pasan a
   salir de la sesión de CiDiTuc y desaparece setRol. Ninguna pantalla se
   entera, porque todas leen con useRol().

   NOTA: el rol vive en memoria. Recargar (F5) vuelve al rol por defecto, y es
   a propósito: un rol viejo guardado en el navegador es justo el tipo de cosa
   que genera bugs difíciles de encontrar cuando aparezca el login de verdad.
   ============================================================================ */

import { useMemo, useState } from 'react';
import { RolContext } from './rolContexto';
import { ROL_POR_DEFECTO, ROLES, esRolValido } from './roles';
import { usuarioDeRol } from './usuarioActual';

function RolProvider({ children }) {
  const [rol, setRolInterno] = useState(ROL_POR_DEFECTO);
  const [agente, setAgente] = useState(null);

  function setRol(nuevoRol) {
    if (!esRolValido(nuevoRol)) {
      console.warn(`[RolProvider] Rol desconocido: "${nuevoRol}". Se ignora.`);
      return;
    }
    setRolInterno(nuevoRol);
    // Cambiar de rol vuelve al usuario de prueba: el agente elegido era de otro rol.
    setAgente(null);
  }

  /* u = { id, nombre (el legajo), rol } de la lista de usuarios de la base, o
     null para volver al usuario de prueba. */
  function elegirAgente(u) {
    if (u && esRolValido(u.rol)) setRolInterno(u.rol);
    setAgente(u ?? null);
  }

  const valor = useMemo(
    () => ({
      rol,
      setRol,
      agente,
      elegirAgente,
      datosRol: ROLES[rol],
      usuario: agente
        ? { id: agente.id, nombre: String(agente.nombre), email: agente.email ?? '', rol: agente.rol, deLaBase: true }
        : usuarioDeRol(rol),
    }),
    [rol, agente],
  );

  return <RolContext.Provider value={valor}>{children}</RolContext.Provider>;
}

export default RolProvider;
