/* ============================================================================
   Navbar.jsx  —  BARRA AZUL DE ARRIBA
   ----------------------------------------------------------------------------
   CONTENIDO:
     - izquierda: botón ☰ (abre/cierra el menú lateral) + logo "CIUDAD / SMT",
                  el logo es un link al Inicio
     - derecha:   el selector de rol (PROVISORIO) + el nombre del usuario

   USADO EN:  components/Layout.jsx
   ESTILOS:   App.css -> secciones 2 (NAVBAR) y 2.b (SELECTOR DE ROL)

   PROPS:
     onAlternarMenu (función)  la manda Layout.jsx. El botón ☰ solo avisa que
                               lo apretaron; quién muestra o esconde el menú es
                               Layout, porque es el que tiene al Sidebar.

   >>> EL NOMBRE DEL USUARIO ES DE MENTIRA <<<
   Sale de auth/usuarioActual.js, que hoy es un objeto escrito a mano. NO hay
   login: es solo para ver cómo queda la barra. Ver ese archivo.

   SI HAY PROBLEMA ACÁ:
     - "No se ve el logo": el SVG está escrito a mano acá abajo (no es un
        archivo de /public). Si desapareció, se rompió el markup del <svg>.
     - "Clic en el logo no vuelve al inicio": el <Link to="/"> de abajo.
     - "La barra tapa el contenido": z-index en App.css sección 2.
     - "El ☰ no hace nada": falta la prop onAlternarMenu (la pone Layout.jsx).
     - "El nombre no queda a la derecha": es el margin-left: auto de
        .navbar-derecha en App.css sección 2.

   PENDIENTE:
     - Cuando haya login: sacar <SelectorRol />, y el nombre pasa a salir de
       la sesión real. Además va un menú al tocar el nombre (cerrar sesión,
       cambiar contraseña).
   ============================================================================ */

import { Link } from 'react-router-dom';
import MenuIcon from '@mui/icons-material/Menu';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import SelectorRol from './SelectorRol';
import { useRol } from '../auth/rolContexto';
import { useDatos } from '../datos/datosContexto';
import { fmtFechaHora } from '../dominio/fechas';

function Navbar({ onAlternarMenu }) {
  const { usuario, datosRol } = useRol();
  // Trabajo sin conexión (sección 6.2): "indicación visible de cuántos
  // registros quedan pendientes". Va en la barra para que se vea en todas las
  // pantallas, no solo en la del formulario.
  const { sinConexion, pendientesSinConexion = [], sincronizar } = useDatos();
  const porEnviar = pendientesSinConexion.filter((p) => !p.rechazado).length;
  const rechazados = pendientesSinConexion.length - porEnviar;

  return (
    <header className="navbar">

      {/* ===== IZQUIERDA: hamburguesa + logo ===== */}
      <button
        type="button"
        className="btn-hamburguesa"
        onClick={onAlternarMenu}
        aria-label="Mostrar u ocultar el menú"
        title="Mostrar u ocultar el menú"
      >
        <MenuIcon />
      </button>

      {/* Todo el bloque del logo vuelve al Inicio */}
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

      {/* ===== DERECHA: selector de rol + usuario =====
          El margin-left: auto de .navbar-derecha es lo que empuja este bloque
          al extremo derecho (aprovecha que .navbar ya es flex). */}
      <div className="navbar-derecha">

        {sinConexion && (
          <span className="navbar-conexion" title={sinConexion.desde ? `Datos guardados el ${fmtFechaHora(sinConexion.desde)}` : undefined}>
            Sin conexión
          </span>
        )}
        {porEnviar > 0 && (
          <button
            type="button"
            className="navbar-conexion navbar-conexion-pendientes"
            onClick={() => sincronizar()}
            title="Guardado en el dispositivo. Tocá para enviar ahora."
          >
            {porEnviar} sin enviar
          </button>
        )}
        {rechazados > 0 && <span className="navbar-conexion">{rechazados} no se aceptaron</span>}

        {/* PROVISORIO. Se va entero cuando exista login. */}
        <SelectorRol />

        {/* MAQUETA: el nombre viene de auth/usuarioActual.js, escrito a mano.
            Es un <div>, no un <button>: todavía no despliega nada. Cuando haya
            login acá va el menú de sesión. */}
        <div className="navbar-usuario">
          <span className="navbar-usuario-nombre">
            {usuario.nombre}

          </span>
          <AccountCircleIcon className="navbar-usuario-icono" />
        </div>

      </div>

    </header>
  );
}

export default Navbar;
