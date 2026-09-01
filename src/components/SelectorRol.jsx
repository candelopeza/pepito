/* ============================================================================
   SelectorRol.jsx  —  *** PROVISORIO: BORRAR CUANDO HAYA LOGIN ***
   ----------------------------------------------------------------------------
   Es el desplegable de la navbar para cambiar de tipo de usuario a mano.
   NO es una funcionalidad del sistema: es una herramienta para probar y para
   mostrarle al área cómo ve la pantalla cada rol, sin necesidad de backend.

   Está en un archivo aparte justamente para que el día que exista login se
   borre entero y se saque su línea de Navbar.jsx. Nada más depende de él.

   >>>>>>>>>>>>>>>>>>>>>>>>>>>>>  ATENCIÓN  <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
   ESTO NO PUEDE LLEGAR A PRODUCCIÓN ASÍ. Cualquiera que abra el sistema puede
   auto-asignarse Administrador desde este desplegable. Mientras sea una demo
   interna no hay problema, pero antes de publicarlo hay que reemplazarlo por
   el login real y que sea el backend el que decida el rol.
   >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

   USADO EN: components/Navbar.jsx
   ESTILOS:  App.css -> sección 2.b (SELECTOR DE ROL)
   ROLES:    salen solos de src/auth/roles.js (no hay lista escrita acá)

   SI HAY PROBLEMA ACÁ:
     - "Falta un rol en la lista": agregalo en src/auth/roles.js, el
        desplegable se arma solo con lo que haya ahí.
     - "Cambio el rol y no cambia la pantalla": el problema no es este
        archivo. La pantalla no está leyendo el rol con useRol(), o filtra
        con una lista propia en vez de usar src/config/modulos.js.
     - "Cambio de rol estando en una pantalla que el rol nuevo no puede ver":
        RutaProtegida te devuelve al Inicio automáticamente. Es lo esperado.
   ============================================================================ */

import { useRol } from '../auth/rolContexto';
import { LISTA_ROLES } from '../auth/roles';

function SelectorRol() {
  const { rol, setRol } = useRol();

  return (
    <div className="selector-rol">
      {/* Etiqueta chiquita que deja claro que esto es de prueba */}
      <span className="selector-rol-aviso" title="Herramienta de prueba: se elimina cuando haya login">
        PRUEBA
      </span>

      {/* Select nativo a propósito: es accesible con teclado y se ve igual
          en cualquier navegador, sin librerías. Para algo temporal alcanza. */}
      <select
        className="selector-rol-select"
        value={rol}
        onChange={(e) => setRol(e.target.value)}
        aria-label="Cambiar tipo de usuario (provisorio)"
      >
        {LISTA_ROLES.map((r) => (
          <option key={r.id} value={r.id}>
            {r.etiqueta}
          </option>
        ))}
      </select>
    </div>
  );
}

export default SelectorRol;
