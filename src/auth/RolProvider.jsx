/* ============================================================================
   auth/RolProvider.jsx  —  GUARDA QUIÉN ES EL USUARIO Y CON QUÉ ROL ENTRÓ
   ----------------------------------------------------------------------------
   Es la mitad ESCRITURA del sistema de roles. Para LEER desde una pantalla se
   usa `useRol()` de auth/rolContexto.js, nunca este archivo.

   QUÉ REPARTE:
     rol       el id del rol activo ('coordinacion', 'relevador', ...)
     datosRol  el objeto completo del rol, con etiqueta y descripción
     usuario   la persona: { id, nombre (el legajo), email, rol, deLaBase }
     agente / elegirAgente  el usuario identificado: { id, nombre (el
               legajo), rol } de la tabla `usuario` de la base. El backend lo
               reconoce por su legajo, toma el rol de SU tipo de usuario y los
               actos quedan a su nombre en la auditoría. Mientras nadie lo
               llame, se es público: titular, sin nombre, y el servidor no
               acepta ninguna escritura.

   >>> DESDE EL 06/11/2026 NADIE PUEDE IDENTIFICARSE TODAVÍA <<<
   Se sacaron los perfiles de prueba (usuarios inventados) y después también
   el desplegable "Elegí tu usuario…" de la barra: la Dirección decidió que
   los tipos de usuario se vinculen directamente en CiDiTuc. elegirAgente()
   queda como el punto donde el login va a enchufar la identidad.

   POR QUÉ EL USUARIO VIVE ACÁ Y NO EN EL STORE DE DATOS: porque el store lo
   necesita (firma la auditoría con el nombre del usuario), y si el usuario
   viviera adentro del store habría una dependencia circular. Por eso en
   App.jsx el orden es <RolProvider> por fuera y <DatosProvider> por dentro.

   >>> PROVISORIO <<<
   CUANDO HAYA LOGIN (CiDiTuc) se cambia SOLO ESTE ARCHIVO: el usuario pasa a
   salir de la sesión y desaparece elegirAgente. Ninguna pantalla se entera,
   porque todas leen con useRol().

   Ya no se guarda nada en el dispositivo. Hasta el 06/11/2026 el elegido en
   la barra quedaba en localStorage; esas claves se borran al arrancar para
   que un navegador que había elegido "administrador" no siga siéndolo.
   ============================================================================ */

import { useEffect, useMemo, useState } from 'react';
import { RolContext } from './rolContexto';
import { ROL_POR_DEFECTO, ROLES, esRolValido } from './roles';

const CLAVES_VIEJAS = ['grandes-generadores-usuario', 'grandes-generadores-rol-de-prueba'];

function usuarioValido(u) {
  return u && u.id && esRolValido(u.rol) ? u : null;
}

function RolProvider({ children }) {
  const [agente, setAgente] = useState(null);

  useEffect(() => {
    try {
      CLAVES_VIEJAS.forEach((c) => localStorage.removeItem(c));
    } catch {
      // Ventana privada o almacenamiento bloqueado: no hay nada que borrar.
    }
  }, []);

  /* u = { id, nombre (el legajo), rol } de la tabla usuario, o null para
     salir. Hoy no lo llama nadie: es el enchufe para el login de CiDiTuc. */
  function elegirAgente(u) {
    setAgente(usuarioValido(u));
  }

  const valor = useMemo(() => {
    const rol = agente?.rol ?? ROL_POR_DEFECTO;
    return {
      rol,
      agente,
      elegirAgente,
      datosRol: ROLES[rol],
      usuario: agente
        ? { id: agente.id, nombre: String(agente.nombre), email: agente.email ?? '', rol, deLaBase: true }
        : { id: null, nombre: '', email: '', rol },
    };
  }, [agente]);

  return <RolContext.Provider value={valor}>{children}</RolContext.Provider>;
}

export default RolProvider;
