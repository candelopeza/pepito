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

   NOTA: antes el rol vivía solo en memoria y recargar (F5) volvía siempre a
   coordinación. En el teléfono eso es a cada rato: volver a abrir la app
   instalada, deslizar hacia abajo, o Responsively cuando cambia de dirección.
   El agente quedaba cargando a nombre de coordinación sin darse cuenta. Ahora
   el rol y el "firmar como" quedan guardados en el dispositivo (ver
   RECORDAR_EN_EL_DISPOSITIVO). Cuando llegue el login se va junto con setRol:
   el rol saldrá de la sesión de CiDiTuc y no habrá nada que recordar.
   ============================================================================ */

import { useEffect, useMemo, useState } from 'react';
import { RolContext } from './rolContexto';
import { ROL_POR_DEFECTO, ROLES, esRolValido } from './roles';
import { usuarioDeRol } from './usuarioActual';

/* PROVISORIO, hasta el login. En false vuelve a vivir solo en memoria, como
   antes: cada recarga arranca en coordinación. */
const RECORDAR_EN_EL_DISPOSITIVO = true;
const CLAVE_GUARDADO = 'grandes-generadores-rol-de-prueba';

/* Lo elegido la última vez en este dispositivo, si todavía tiene sentido: un
   rol que ya no existe, o un agente de otro rol, se descartan. */
function leerGuardado() {
  if (!RECORDAR_EN_EL_DISPOSITIVO) return null;
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_GUARDADO));
    if (!guardado || !esRolValido(guardado.rol)) return null;
    const agente = guardado.agente?.id && guardado.agente.rol === guardado.rol ? guardado.agente : null;
    return { rol: guardado.rol, agente };
  } catch {
    // Ventana privada o almacenamiento bloqueado: se arranca como antes.
    return null;
  }
}

function RolProvider({ children }) {
  const [guardado] = useState(leerGuardado);
  const [rol, setRolInterno] = useState(guardado?.rol ?? ROL_POR_DEFECTO);
  const [agente, setAgente] = useState(guardado?.agente ?? null);

  useEffect(() => {
    if (!RECORDAR_EN_EL_DISPOSITIVO) return;
    try {
      localStorage.setItem(CLAVE_GUARDADO, JSON.stringify({ rol, agente }));
    } catch {
      // Sin almacenamiento sigue andando: solo que no se recuerda.
    }
  }, [rol, agente]);

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
