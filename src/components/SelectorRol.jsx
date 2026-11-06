/* ============================================================================
   SelectorRol.jsx  —  "ELEGÍ TU USUARIO" EN LA BARRA  *** PROVISORIO ***
   ----------------------------------------------------------------------------
   El desplegable de la navbar con los usuarios cargados en la base (Accesos →
   Usuarios). Elegir uno hace que el backend reconozca a la persona por su
   legajo, tome el rol de su tipo de usuario y firme los actos a su nombre.

   >>> DESDE EL 06/11/2026 NO HAY ROLES DE PRUEBA <<<
   Antes acá se podía elegir cualquier rol, con usuarios inventados. Ya no: el
   servidor (ACEPTAR_ROL_DECLARADO, backend/middlewares/usuario.js) solo
   reconoce a los usuarios de la base, y la barra ofrece únicamente esos.

   Sigue siendo provisorio porque NO es un login: cualquiera que abra la app
   puede elegir cualquier legajo. Es la identificación acordada hasta que el
   sistema se sume a CiDiTuc; ese día este archivo se borra, se saca su línea
   de Navbar.jsx y el usuario sale de la sesión (auth/RolProvider.jsx).

   USADO EN: components/Navbar.jsx
   ESTILOS:  App.css -> sección 2.b (SELECTOR DE ROL)

   SI HAY PROBLEMA ACÁ:
     - "No aparece tal persona": no está cargada en Accesos → Usuarios, o está
        dada de baja (activo = false).
     - "Elijo y no cambia la pantalla": la pantalla no está leyendo el rol con
        useRol(), o filtra con una lista propia en vez de src/config/modulos.js.
     - "Elijo estando en una pantalla que ese rol no puede ver": RutaProtegida
        te devuelve al Inicio. Es lo esperado.
   ============================================================================ */

import { useRol } from '../auth/rolContexto';
import { LISTA_ROLES } from '../auth/roles';
import { useDatos } from '../datos/datosContexto';

function SelectorRol() {
  const { agente, elegirAgente } = useRol();
  const { usuarios } = useDatos();

  const activos = usuarios.filter((u) => u.activo !== false);

  // Sin usuarios cargados no hay nada que elegir: la barra queda limpia y la
  // app es solo el portal del titular (ROL_POR_DEFECTO).
  if (activos.length === 0) return null;

  return (
    <div className="selector-rol">
      <span className="selector-rol-aviso" title="Identificación provisoria hasta el ingreso por CiDiTuc">
        USUARIO
      </span>
      {/* Select nativo a propósito: accesible con teclado y se ve igual en
          cualquier navegador, sin librerías. Para algo provisorio alcanza. */}
      <select
        className="selector-rol-select"
        value={agente?.id ?? ''}
        onChange={(e) => elegirAgente(activos.find((u) => String(u.id) === e.target.value) ?? null)}
        aria-label="Entrar como"
      >
        <option value="">Elegí tu usuario…</option>
        {activos.map((u) => (
          <option key={u.id} value={u.id}>
            Legajo {u.nombre} — {LISTA_ROLES.find((r) => r.id === u.rol)?.etiqueta ?? u.rol}
          </option>
        ))}
      </select>
    </div>
  );
}

export default SelectorRol;
