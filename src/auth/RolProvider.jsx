/* ============================================================================
   auth/RolProvider.jsx  —  GUARDA QUIÉN ES EL USUARIO Y CON QUÉ ROL ENTRÓ
   ----------------------------------------------------------------------------
   Es la mitad ESCRITURA del sistema de roles. Para LEER desde una pantalla se
   usa `useRol()` de auth/rolContexto.js, nunca este archivo.

   QUÉ REPARTE:
     rol       el id del rol activo ('coordinacion', 'relevador', ...)
     datosRol  el objeto completo del rol, con etiqueta y descripción
     usuario   la persona: { id, nombre (el legajo), email, rol, deLaBase }
     agente / elegirAgente  el usuario elegido en la barra, de la tabla
               `usuario` de la base. El backend lo reconoce por su legajo,
               toma el rol de SU tipo de usuario y los actos quedan a su nombre
               en la auditoría. Sin elegir nadie, se es público: titular, sin
               nombre, y el servidor no acepta ninguna escritura.

   >>> DESDE EL 06/11/2026 NO HAY PERFILES DE PRUEBA <<<
   Antes se podía elegir cualquier rol en la barra, con usuarios inventados
   (Jorge Medina, Ana Gómez...). Eso se fue: el único camino es un usuario
   cargado en Accesos → Usuarios, igual que en producción. Para probar con
   otro rol se da de alta un usuario de ese tipo.

   POR QUÉ EL USUARIO VIVE ACÁ Y NO EN EL STORE DE DATOS: porque el store lo
   necesita (firma la auditoría con el nombre del usuario), y si el usuario
   viviera adentro del store habría una dependencia circular. Por eso en
   App.jsx el orden es <RolProvider> por fuera y <DatosProvider> por dentro.

   >>> PROVISORIO <<<
   CUANDO HAYA LOGIN (CiDiTuc) se cambia SOLO ESTE ARCHIVO: el usuario pasa a
   salir de la sesión y desaparece elegirAgente. Ninguna pantalla se entera,
   porque todas leen con useRol().

   El usuario elegido queda guardado en el dispositivo: recargar (F5) o volver
   a abrir la app instalada en el teléfono no lo pierde. Con el login esto
   también se va: no habrá nada que recordar.
   ============================================================================ */

import { useEffect, useMemo, useState } from 'react';
import { RolContext } from './rolContexto';
import { ROL_POR_DEFECTO, ROLES, esRolValido } from './roles';

const CLAVE_GUARDADO = 'grandes-generadores-usuario';
// Dónde se guardaba hasta el 06/11/2026 (junto con el rol de prueba). Se lee
// una vez para no obligar a elegir de nuevo, y se borra.
const CLAVE_VIEJA = 'grandes-generadores-rol-de-prueba';

function usuarioValido(u) {
  return u && u.id && esRolValido(u.rol) ? u : null;
}

/* El elegido la última vez en este dispositivo, si todavía tiene sentido. */
function leerGuardado() {
  try {
    const guardado = usuarioValido(JSON.parse(localStorage.getItem(CLAVE_GUARDADO)));
    if (guardado) return guardado;
    const viejo = usuarioValido(JSON.parse(localStorage.getItem(CLAVE_VIEJA))?.agente);
    localStorage.removeItem(CLAVE_VIEJA);
    return viejo;
  } catch {
    // Ventana privada o almacenamiento bloqueado: se arranca sin usuario.
    return null;
  }
}

function RolProvider({ children }) {
  const [agente, setAgente] = useState(leerGuardado);

  useEffect(() => {
    try {
      if (agente) localStorage.setItem(CLAVE_GUARDADO, JSON.stringify(agente));
      else localStorage.removeItem(CLAVE_GUARDADO);
    } catch {
      // Sin almacenamiento sigue andando: solo que no se recuerda.
    }
  }, [agente]);

  /* u = { id, nombre (el legajo), rol } de la lista de usuarios de la base, o
     null para salir. */
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
