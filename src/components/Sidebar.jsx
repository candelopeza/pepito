import { NavLink } from 'react-router-dom';

function Sidebar() {
  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        <div className="nav-group">
          <span className="nav-label">Operativo</span>
          <NavLink to="/" end className="nav-link">Inicio</NavLink>
          <NavLink to="/locales" className="nav-link">Locales</NavLink>
          <NavLink to="/relevamientos" className="nav-link">Relevamientos</NavLink>
          <NavLink to="/tramites" className="nav-link">Trámites</NavLink>
          <NavLink to="/documentacion" className="nav-link">Documentación</NavLink>
          <NavLink to="/expedientes" className="nav-link">Expedientes</NavLink>
          <NavLink to="/seguimiento" className="nav-link">Seguimiento</NavLink>
        </div>

        <div className="nav-divider"></div>

        <div className="nav-group">
          <span className="nav-label">Configuración</span>
          <NavLink to="/config/rubros" className="nav-link">Rubros</NavLink>
          <NavLink to="/config/sedes" className="nav-link">Sedes</NavLink>
        </div>
      </nav>
    </aside>
  );
}

export default Sidebar;