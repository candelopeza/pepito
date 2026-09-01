/* ============================================================================
   Layout.jsx  —  EL MARCO DE LA APP (lo que se ve en TODAS las pantallas)
   ----------------------------------------------------------------------------
   ESTRUCTURA:
       app-container
         ├── Navbar        (barra azul de arriba)
         └── layout-body
               ├── Sidebar      (menú lateral)
               └── main-content
                     └── <Outlet />   <-- ACÁ ENTRA LA PÁGINA

   El <Outlet /> es el agujero donde react-router inserta la página según
   la URL. Sin él, se ve el marco pero el contenido nunca aparece.

   USADO EN: App.jsx (como element de la ruta padre "/")
   ESTILOS:  App.css -> secciones 1 (LAYOUT) y 4 (MAIN CONTENT)

   SI HAY PROBLEMA ACÁ:
     - "Se ve navbar y menú pero el medio está vacío en todas las páginas":
        es el <Outlet />, o la ruta quedó mal anidada en App.jsx.
     - "El menú aparece arriba en vez de al costado": revisá .layout-body
        (tiene que ser display: flex) en App.css sección 1.
   ============================================================================ */

import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

function Layout() {
  return (
    <div className="app-container">

      {/* ===== ZONA 1: barra superior (fija en todas las pantallas) ===== */}
      <Navbar />

      <div className="layout-body">

        {/* ===== ZONA 2: menú lateral (se oculta en celular, ver App.css #11) ===== */}
        <Sidebar />

        {/* ===== ZONA 3: contenido variable ===== */}
        <main className="main-content">
          <Outlet />
        </main>

      </div>
    </div>
  );
}

export default Layout;
