/* ============================================================================
   App.jsx  —  MAPA DE RUTAS. Acá se decide QUÉ PÁGINA se ve en cada URL.
   ----------------------------------------------------------------------------
   Es el único lugar donde se declaran las URLs de la app.

   DOS COSAS ENVUELVEN A TODO:
     <RolProvider>  -> deja el rol del usuario disponible en cualquier pantalla
     <HashRouter>   -> maneja la navegación

   Y cada ruta va envuelta en <RutaProtegida ruta="...">, que rebota al Inicio
   si el rol activo no tiene permiso. QUIÉN VE QUÉ *NO* SE DEFINE ACÁ:
   está en src/config/modulos.js. Acá solo se enchufa el control.

   SI HAY PROBLEMA ACÁ:
     - "Un link no lleva a ninguna parte / página en blanco":
        el path de acá no coincide con la `ruta` de src/config/modulos.js.
        Los dos tienen que apuntar a lo mismo (ojo: acá SIN barra inicial,
        en la tabla de módulos CON barra -> path="locales" / ruta: "/locales").
     - "Me rebota al Inicio y no debería": no es un bug de este archivo.
        El rol no está en el array `roles` de ese módulo (config/modulos.js).
     - "Entro a una pantalla que no me toca": a ese <Route> le falta el
        <RutaProtegida>, o su prop `ruta` está mal escrita.
     - "Se ve la página pero sin navbar ni menú":
        la ruta quedó fuera del <Route element={<Layout />}>.
     - "La URL cambia pero la pantalla no": revisá el <Outlet /> en Layout.jsx.

   NOTA: usa HashRouter (URLs con #, ej: /#/locales) en vez de BrowserRouter.
   Es a propósito y va de la mano con vite.config.js, que arma el build en un
   solo archivo para poder abrirlo desde el disco. Si se pasa a BrowserRouter
   y el servidor no redirige todo al index.html, recargar una página interna
   da 404. No lo cambies sin hablarlo con quien despliega.
   ============================================================================ */

// --- 1. Router ---
import { Routes, Route, HashRouter } from 'react-router-dom';

// --- 2. Roles y control de acceso ---
import RolProvider from './auth/RolProvider';
import RutaProtegida from './components/RutaProtegida';

// --- 3. Layout (navbar + sidebar + contenedor del contenido) ---
import Layout from './components/Layout';

// --- 4. Páginas operativas ---
import Home from './pages/Home';
import Local from './pages/Local';
import Relevamiento from './pages/Relevamiento';
import Tramite from './pages/Tramite';
import Documentacion from './pages/Documentacion';
import Expediente from './pages/Expediente';
import Seguimiento from './pages/Seguimiento';

// --- 5. Páginas de configuración (solo administrador) ---
import Rubro from './pages/config/Rubro';
import Sede from './pages/config/Sede';

// --- 6. Estilos de componentes y páginas ---
import './App.css';

function App() {
  return (
    // RolProvider va POR FUERA del router: el rol no depende de la URL.
    <RolProvider>
      <HashRouter>
        <Routes>
          {/* Ruta padre: todo lo de adentro se dibuja DENTRO del Layout,
              o sea que hereda navbar + sidebar. */}
          <Route path="/" element={<Layout />}>

            {/* ---- Inicio ---- */}
            {/* `index` = la ruta padre pelada, o sea /#/
                No lleva RutaProtegida: el Inicio lo ven todos los roles, y
                sus tarjetas ya vienen filtradas desde adentro de Home. */}
            <Route index element={<Home />} />

            {/* ---- Módulos operativos ----
                La prop `ruta` de RutaProtegida tiene que ser IGUAL al campo
                `ruta` del módulo en src/config/modulos.js. */}
            <Route
              path="locales"
              element={<RutaProtegida ruta="/locales"><Local /></RutaProtegida>}
            />
            <Route
              path="relevamientos"
              element={<RutaProtegida ruta="/relevamientos"><Relevamiento /></RutaProtegida>}
            />
            <Route
              path="tramites"
              element={<RutaProtegida ruta="/tramites"><Tramite /></RutaProtegida>}
            />
            <Route
              path="documentacion"
              element={<RutaProtegida ruta="/documentacion"><Documentacion /></RutaProtegida>}
            />
            <Route
              path="expedientes"
              element={<RutaProtegida ruta="/expedientes"><Expediente /></RutaProtegida>}
            />
            <Route
              path="seguimiento"
              element={<RutaProtegida ruta="/seguimiento"><Seguimiento /></RutaProtegida>}
            />

            {/* ---- Configuración (tablas maestras) ---- */}
            <Route
              path="config/rubros"
              element={<RutaProtegida ruta="/config/rubros"><Rubro /></RutaProtegida>}
            />
            <Route
              path="config/sedes"
              element={<RutaProtegida ruta="/config/sedes"><Sede /></RutaProtegida>}
            />

            {/* PENDIENTE: no hay ruta 404. Si alguien entra a una URL que no
                existe, ve el Layout vacío (sin error). Cuando haga falta:
                <Route path="*" element={<NoEncontrado />} /> */}
          </Route>
        </Routes>
      </HashRouter>
    </RolProvider>
  );
}

export default App;
