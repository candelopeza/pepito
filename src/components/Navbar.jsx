/* ============================================================================
   Navbar.jsx  —  BARRA AZUL DE ARRIBA
   ----------------------------------------------------------------------------
   CONTENIDO:
     - izquierda: botón ☰ (abre/cierra el menú lateral) + logo "CIUDAD / SMT",
                  el logo es un link al Inicio
     - derecha:   avisos de conexión + quién es el usuario

   USADO EN:  components/Layout.jsx
   ESTILOS:   App.css -> secciones 2 (NAVBAR) y 2.b (SELECTOR DE ROL)

   PROPS:
     onAlternarMenu (función)  la manda Layout.jsx. El botón ☰ solo avisa que
                               lo apretaron; quién muestra o esconde el menú es
                               Layout, porque es el que tiene al Sidebar.

   >>> NO HAY LOGIN TODAVÍA <<<
   Hasta que el sistema se sume a CiDiTuc no hay forma de identificarse: todo
   el que abre la app es titular (auth/RolProvider.jsx) y la barra muestra
   "Titular del local". El 06/11/2026 se sacó el desplegable "Elegí tu
   usuario…" (components/SelectorRol.jsx, borrado): la Dirección decidió que
   los tipos de usuario se vinculen directamente en CiDiTuc.

   SI HAY PROBLEMA ACÁ:
     - "No se ve el logo": es src/assets/logo-ciudad-smt.png (el símbolo
        recortado del logo oficial, 03/11/2026). Antes era un SVG dibujado a
        mano. En el teléfono se oculta a propósito (App.css, .logo-icon).
     - "Clic en el logo no vuelve al inicio": el <Link to="/"> de abajo.
     - "La barra tapa el contenido": z-index en App.css sección 2.
     - "El ☰ no hace nada": falta la prop onAlternarMenu (la pone Layout.jsx).
     - "El nombre no queda a la derecha": es el margin-left: auto de
        .navbar-derecha en App.css sección 2.

   PENDIENTE:
     - Cuando haya login: el nombre pasa a salir de la sesión real. Además
       va un menú al tocar el nombre (cerrar sesión, cambiar contraseña).
   ============================================================================ */

import { Link } from 'react-router-dom';
import MenuIcon from '@mui/icons-material/Menu';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { useRol } from '../auth/rolContexto';
import { useDatos } from '../datos/datosContexto';
import { fmtFechaHora } from '../dominio/fechas';
import logoCiudadSmt from '../assets/logo-ciudad-smt.png';

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

        {/* --- Ícono: el símbolo oficial de Ciudad SMT (src/assets/logo-ciudad-smt.png),
            con el fondo transparente, sobre el azul de la barra.
            alt vacío porque al lado ya dice CIUDAD SMT. --- */}
        <div className="logo-icon">
          <img src={logoCiudadSmt} alt="" width="40" height="40" />
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

        {/* Es un <div>, no un <button>: todavía no despliega nada. Cuando haya
            login acá va el menú de sesión. */}
        <div className="navbar-usuario">
          <span className="navbar-usuario-nombre">
            {usuario.nombre ? `Legajo ${usuario.nombre}` : datosRol.etiqueta}
          </span>
          <AccountCircleIcon className="navbar-usuario-icono" />
        </div>

      </div>

    </header>
  );
}

export default Navbar;
