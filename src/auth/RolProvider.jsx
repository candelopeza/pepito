/* ============================================================================
   auth/RolProvider.jsx  —  QUIÉN ESTÁ USANDO EL SISTEMA
   ----------------------------------------------------------------------------
   La identidad es el usuario elegido en la barra: uno de los usuarios REALES
   de la tabla `usuario` de la base, identificado por su id_persona (el mismo
   número que usa CiDiTuc). No existen usuarios de prueba: sin elegir uno, el
   sistema queda en "Sin identificar" y solo muestra la pantalla de inicio.

   El backend hace su propio control (middlewares/usuario.js): reconoce al
   usuario por su id_persona y le asigna el rol QUE DICE LA BASE, no el que
   declare el navegador (ACEPTAR_ROL_DECLARADO=no).

   CUANDO EXISTA CiDiTuc: la identidad la provee el inicio de sesión único.
   Se reemplazan este archivo y el selector de la barra; las pantallas no se
   tocan, porque ya leen todo de este contexto.

   NOTA: la elección vive en memoria. Recargar (F5) vuelve a "Sin identificar",
   y es a propósito: una identidad vieja guardada en el navegador es justo el
   tipo de cosa que genera bugs difíciles cuando aparezca el login de verdad.
   ============================================================================ */

import { useMemo, useState } from 'react';
import { RolContext } from './rolContexto';
import { ROLES, esRolValido } from './roles';

const SIN_IDENTIFICAR = {
  id: null,
  etiqueta: 'Sin identificar',
  descripcion: 'Elegí tu usuario en la barra de arriba para empezar a trabajar.',
};

function RolProvider({ children }) {
  const [agente, setAgente] = useState(null);

  /* u = { id, nombre (el id_persona), rol } de la lista de usuarios de la
     base, o null para salir. */
  function elegirAgente(u) {
    setAgente(u && esRolValido(u.rol) ? u : null);
  }

  const rol = agente?.rol ?? null;

  const valor = useMemo(
    () => ({
      rol,
      agente,
      elegirAgente,
      datosRol: ROLES[rol] ?? SIN_IDENTIFICAR,
      usuario: agente
        ? { id: agente.id, nombre: String(agente.nombre), email: agente.email ?? '', rol: agente.rol, deLaBase: true }
        : { id: null, nombre: 'Sin identificar', email: '', rol: null },
    }),
    [rol, agente],
  );

  return <RolContext.Provider value={valor}>{children}</RolContext.Provider>;
}

export default RolProvider;
