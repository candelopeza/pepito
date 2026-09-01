/* ============================================================================
   Navbar.jsx  —  BARRA AZUL DE ARRIBA
   ----------------------------------------------------------------------------
   CONTENIDO:
     - izquierda: logo + "CIUDAD / SMT", todo eso es un link al Inicio
     - derecha:   el selector de rol (PROVISORIO, ver SelectorRol.jsx)

   USADO EN:  components/Layout.jsx
   ESTILOS:   App.css -> secciones 2 (NAVBAR) y 2.b (SELECTOR DE ROL)

   SI HAY PROBLEMA ACÁ:
     - "No se ve el logo": el SVG está escrito a mano acá abajo (no es un
        archivo de /public). Si desapareció, se rompió el markup del <svg>.
     - "Clic en el logo no vuelve al inicio": el <Link to="/"> de abajo.
     - "La barra tapa el contenido": z-index en App.css sección 2.
     - "El selector de rol no queda a la derecha": es el margin-left: auto
        de .selector-rol en App.css sección 2.b.

   PENDIENTE:
     - MENÚ HAMBURGUESA: acá va a ir el botón ☰ cuando se haga. Queda para
       más adelante, se decidió priorizar los roles.
     - Cuando haya login: sacar <SelectorRol /> y poner en su lugar el nombre
       del usuario real + botón de cerrar sesión.
   ============================================================================ */

import { Link } from 'react-router-dom';
import SelectorRol from './SelectorRol';

function Navbar() {
  return (
    <header className="navbar">

      {/* ===== IZQUIERDA: logo (todo el bloque vuelve al Inicio) ===== */}
      <Link to="/" className="logo-link">

        {/* --- Ícono: SVG inline, dibujado a mano. No es un archivo externo --- */}
        <div className="logo-icon">
          <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="18" fill="#4FC3F7" />
            <circle cx="20" cy="12" r="6" fill="#FFD54F" />
            <path d="M20 20 C10 30, 10 38, 20 38 C30 38, 30 30, 20 20" fill="#0288D1" />
          </svg>
        </div>

        {/* --- Texto del logo (dos líneas) --- */}
        <div className="logo-text">
          <span className="ciudad">CIUDAD</span>
          <span className="smt">SMT</span>
        </div>

      </Link>

      {/* ===== DERECHA: selector de rol =====
          PROVISORIO. Se va entero cuando exista login. */}
      <SelectorRol />

    </header>
  );
}

export default Navbar;
