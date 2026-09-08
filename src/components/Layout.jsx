/* ============================================================================
   Layout.jsx  —  EL MARCO DE LA APP (lo que se ve en TODAS las pantallas)
   ----------------------------------------------------------------------------
   ESTRUCTURA:
       app-container
         ├── Navbar        (barra azul de arriba, con el botón ☰)
         └── layout-body
               ├── sidebar-fondo  (el gris de atrás, solo con el menú abierto)
               ├── Sidebar        (menú lateral, se dibuja ENCIMA del contenido)
               └── main-content
                     └── <Outlet />   <-- ACÁ ENTRA LA PÁGINA

   El <Outlet /> es el agujero donde react-router inserta la página según
   la URL. Sin él, se ve el marco pero el contenido nunca aparece.

   ---------------------------------------------------------------------------
   EL MENÚ SE SUPERPONE, NO EMPUJA.
   Al abrirlo, el contenido de atrás NO se mueve ni se re-acomoda: el menú se
   dibuja arriba, como un cajón, con el fondo oscurecido. Eso lo hace el
   `position: fixed` de .sidebar (App.css sección 3), no este archivo.
   Por eso también arranca CERRADO: si arrancara abierto, taparía la pantalla
   apenas entrás.
   ---------------------------------------------------------------------------

   POR QUÉ EL "MENÚ ABIERTO / CERRADO" VIVE ACÁ Y NO EN EL NAVBAR:
   el botón ☰ está en el Navbar, pero lo que se muestra o se esconde es el
   Sidebar. Son dos componentes hermanos: ninguno puede tocar al otro. Así que
   el estado se guarda en el padre común (este archivo) y se reparte: al
   Navbar le baja la función para alternarlo, y al Sidebar la de cerrarlo.

   3 FORMAS DE CERRARLO:
     - el mismo botón ☰
     - un clic en el fondo gris
     - la tecla Escape
   Además se cierra solo al elegir una pantalla del menú: es un cajón, no una
   barra fija, y quedaría tapando lo que acabás de abrir.

   USADO EN: App.jsx (como element de la ruta padre "/")
   ESTILOS:  App.css -> secciones 1 (LAYOUT), 3 (SIDEBAR) y 4 (MAIN CONTENT)

   SI HAY PROBLEMA ACÁ:
     - "Se ve navbar y menú pero el medio está vacío en todas las páginas":
        es el <Outlet />, o la ruta quedó mal anidada en App.jsx.
     - "Al abrir el menú se corre todo el contenido": el .sidebar dejó de ser
        `position: fixed` (App.css sección 3). No es este archivo.
     - "El menú queda abierto tapando la pantalla": ver las 3 formas de
        cerrarlo de arriba; si ninguna anda, revisá que llegue `cerrarMenu`.
     - "Escape no cierra el menú": el listener solo se agrega mientras está
        abierto, mirá el useEffect.
   ============================================================================ */

import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

function Layout() {
  // Arranca cerrado: el menú se dibuja ENCIMA del contenido, así que abierto
  // por defecto taparía la pantalla apenas entrás.
  const [menuAbierto, setMenuAbierto] = useState(false);

  // ===== CERRAR CON LA TECLA ESCAPE =====
  // El listener va en document porque el foco puede estar en cualquier lado.
  // Se quita al cerrar (el return del efecto): si no, quedarían listeners
  // acumulados cada vez que se abre el menú.
  useEffect(() => {
    if (!menuAbierto) return;

    function alPresionarTecla(e) {
      if (e.key === 'Escape') setMenuAbierto(false);
    }

    document.addEventListener('keydown', alPresionarTecla);
    return () => document.removeEventListener('keydown', alPresionarTecla);
  }, [menuAbierto]);

  const cerrarMenu = () => setMenuAbierto(false);

  return (
    <div className="app-container">

      {/* ===== ZONA 1: barra superior (fija en todas las pantallas) ===== */}
      <Navbar onAlternarMenu={() => setMenuAbierto((abierto) => !abierto)} />

      <div className="layout-body">

        {/* ===== ZONA 2: menú lateral =====
            Se desmonta al cerrarlo en vez de esconderse con CSS: así sus links
            tampoco se pueden alcanzar con el tabulador mientras está cerrado.

            El fondo gris es un <button> y no un <div> a propósito: un div con
            onClick no se puede activar con el teclado y el navegador no lo
            anuncia como algo apretable. */}
        {menuAbierto && (
          <>
            <button
              type="button"
              className="sidebar-fondo"
              onClick={cerrarMenu}
              aria-label="Cerrar el menú"
            />
            <Sidebar onNavegar={cerrarMenu} />
          </>
        )}

        {/* ===== ZONA 3: contenido variable =====
            Ocupa siempre el mismo ancho, esté el menú abierto o cerrado. */}
        <main className="main-content">
          <Outlet />
        </main>

      </div>
    </div>
  );
}

export default Layout;
