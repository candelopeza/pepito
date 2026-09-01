/* ============================================================================
   auth/RolProvider.jsx  —  GUARDA EL ROL ACTIVO Y LO REPARTE A TODA LA APP
   ----------------------------------------------------------------------------
   Es la MITAD ESCRITURA del sistema de roles.
   Para LEER el rol desde una pantalla no se usa este archivo: se usa
   `useRol()` de auth/rolContexto.js.

   PROBLEMA QUE RESUELVE: el rol lo necesitan pantallas que están muy lejos
   entre sí (la navbar, el menú, el inicio, el bloqueo de rutas). Pasarlo por
   props de padre a hijo sería un infierno. El Context lo deja disponible en
   cualquier componente, sin cadena de props.

   QUIÉN LO USA: App.jsx envuelve toda la app con <RolProvider>.
   Sin eso, useRol() tira error (a propósito).

   >>> PROVISORIO <<<
   Hoy el rol arranca en ROL_POR_DEFECTO y se cambia a mano con el selector de
   la navbar. CUANDO HAYA LOGIN, se cambia SOLO ESTE ARCHIVO: el rol pasa a
   salir de la sesión del usuario y se elimina el setRol público. Ninguna
   pantalla se entera del cambio, porque todas leen con useRol().

   SI HAY PROBLEMA ACÁ:
     - "Cambio el rol y no cambia nada en pantalla": el componente no está
       leyendo con useRol(), o filtra con una lista propia en vez de usar
       src/config/modulos.js.
     - "Recargo la página (F5) y vuelve a Administrador": es lo esperado, el
       rol vive en memoria. Se podría guardar en localStorage, pero preferí
       no hacerlo: cuando exista login, un rol viejo guardado en el navegador
       es justo el tipo de cosa que genera bugs difíciles de encontrar.
   ============================================================================ */

import { useMemo, useState } from 'react';
import { RolContext } from './rolContexto';
import { ROL_POR_DEFECTO, ROLES, esRolValido } from './roles';

function RolProvider({ children }) {
  const [rol, setRolInterno] = useState(ROL_POR_DEFECTO);

  // Filtro de seguridad: si alguien intenta setear un rol que no existe, lo
  // ignoramos y avisamos por consola. Sin esto, un rol inventado dejaría al
  // usuario con la pantalla vacía y sin ninguna pista del motivo.
  function setRol(nuevoRol) {
    if (!esRolValido(nuevoRol)) {
      console.warn(`[RolProvider] Rol desconocido: "${nuevoRol}". Se ignora.`);
      return;
    }
    setRolInterno(nuevoRol);
  }

  // useMemo para no crear un objeto nuevo en cada render (haría re-renderizar
  // de más a todo lo que consume el contexto).
  const valor = useMemo(
    () => ({
      rol,                    // el id: 'administrador', 'inspector', ...
      setRol,                 // PROVISORIO: desaparece cuando haya login
      datosRol: ROLES[rol],   // el objeto completo, con etiqueta y descripción
    }),
    [rol]
  );

  return <RolContext.Provider value={valor}>{children}</RolContext.Provider>;
}

export default RolProvider;
