/* ============================================================================
   App.jsx  —  MAPA DE RUTAS. Acá se decide QUÉ PÁGINA se ve en cada URL.
   ----------------------------------------------------------------------------
   TRES COSAS ENVUELVEN A TODO, Y EL ORDEN IMPORTA:

     <RolProvider>    quién es el usuario y con qué rol entró
       <DatosProvider>  el store de datos
         <HashRouter>     la navegación

   RolProvider va POR FUERA de DatosProvider a propósito: el store necesita el
   nombre del usuario para firmar la auditoría de cada cambio de estado. Si se
   invierte el orden, useRol() explota dentro del store.

   Cada ruta va envuelta en <RutaProtegida ruta="...">, que rebota al Inicio si
   el rol activo no tiene permiso. QUIÉN VE QUÉ NO SE DEFINE ACÁ: está en
   src/config/modulos.js. Acá solo se enchufa el control.

   SI HAY PROBLEMA ACÁ:
     - "Un link no lleva a ninguna parte": el path de acá no coincide con la
       `ruta` del módulo en config/modulos.js. Ojo que acá va SIN barra inicial
       y en la tabla CON barra -> path="locales" / ruta: "/locales".
     - "Me rebota al Inicio y no debería": no es este archivo. El rol no está
       en el array `roles` de ese módulo.
     - "Entro a una pantalla que no me toca": a ese <Route> le falta el
       <RutaProtegida>, o su prop `ruta` está mal escrita.
     - "Se ve la página pero sin navbar ni menú": la ruta quedó fuera del
       <Route element={<Layout />}>.
     - "La URL cambia pero la pantalla no": revisá el <Outlet /> en Layout.jsx.

   NOTA SOBRE HashRouter (URLs con #, ej: /#/locales): es a propósito y va de
   la mano con vite.config.js, que arma el build en un solo archivo para poder
   abrirlo desde el disco. Si se pasa a BrowserRouter y el servidor no redirige
   todo al index.html, recargar una página interna da 404. No lo cambies sin
   hablarlo con quien despliega.
   ============================================================================ */

import { HashRouter, Route, Routes } from 'react-router-dom';

import RolProvider from './auth/RolProvider';
import DatosProvider from './datos/DatosProvider';
import RutaProtegida from './components/RutaProtegida';
import Layout from './components/Layout';

// --- Inicio y tablero ---
import Home from './pages/Home';
import Tablero from './pages/Tablero';

// --- Padrón ---
import Local from './pages/Local';
import LocalFicha from './pages/LocalFicha';

// --- Circuito ---
import Relevamiento from './pages/Relevamiento';
import Notificaciones from './pages/Notificaciones';
import Documentacion from './pages/Documentacion';
import Validaciones from './pages/Validaciones';
import Prorrogas from './pages/Prorrogas';
import Expediente from './pages/Expediente';

// --- Consulta ---
import Mapa from './pages/Mapa';
import Reportes from './pages/Reportes';

// --- Campo (celular) ---
import Relevar from './pages/campo/Relevar';
import Entregas from './pages/campo/Entregas';

// --- Herramientas ---
import Duplicados from './pages/herramientas/Duplicados';
import Informe9DJ from './pages/herramientas/Informe9DJ';
import Geocodificacion from './pages/herramientas/Geocodificacion';

// --- Configuración ---
import Usuarios from './pages/config/Usuarios';
import Rubros from './pages/config/Rubros';
import Feriados from './pages/config/Feriados';
import Plantilla from './pages/config/Plantilla';
import Parametros from './pages/config/Parametros';

// --- Portal del titular y 404 ---
import Portal from './pages/Portal';
import NoEncontrado from './pages/NoEncontrado';

import './App.css';

function App() {
  return (
    <RolProvider>
      <DatosProvider>
        <HashRouter>
          <Routes>
            {/* Ruta padre: todo lo de adentro se dibuja DENTRO del Layout, o
                sea que hereda navbar + menú lateral. */}
            <Route path="/" element={<Layout />}>
              {/* ---- Inicio ----
                  Sin RutaProtegida: lo ven todos los roles, y sus tarjetas ya
                  vienen filtradas desde adentro de Home. */}
              <Route index element={<Home />} />

              {/* ---- Oficina ---- */}
              <Route path="tablero" element={<RutaProtegida ruta="/tablero"><Tablero /></RutaProtegida>} />
              <Route path="locales" element={<RutaProtegida ruta="/locales"><Local /></RutaProtegida>} />
              {/* La ficha no tiene módulo propio en la tabla de permisos:
                  depende del padrón, así que se protege con esa misma ruta. */}
              <Route path="locales/:id" element={<RutaProtegida ruta="/locales"><LocalFicha /></RutaProtegida>} />
              <Route path="relevamientos" element={<RutaProtegida ruta="/relevamientos"><Relevamiento /></RutaProtegida>} />
              <Route path="notificaciones" element={<RutaProtegida ruta="/notificaciones"><Notificaciones /></RutaProtegida>} />
              <Route path="documentacion" element={<RutaProtegida ruta="/documentacion"><Documentacion /></RutaProtegida>} />
              <Route path="validaciones" element={<RutaProtegida ruta="/validaciones"><Validaciones /></RutaProtegida>} />
              <Route path="prorrogas" element={<RutaProtegida ruta="/prorrogas"><Prorrogas /></RutaProtegida>} />
              <Route path="expedientes" element={<RutaProtegida ruta="/expedientes"><Expediente /></RutaProtegida>} />
              <Route path="mapa" element={<RutaProtegida ruta="/mapa"><Mapa /></RutaProtegida>} />
              <Route path="reportes" element={<RutaProtegida ruta="/reportes"><Reportes /></RutaProtegida>} />

              {/* ---- Campo ---- */}
              <Route path="campo/relevar" element={<RutaProtegida ruta="/campo/relevar"><Relevar /></RutaProtegida>} />
              <Route path="campo/entregas" element={<RutaProtegida ruta="/campo/entregas"><Entregas /></RutaProtegida>} />

              {/* ---- Herramientas ---- */}
              <Route path="herramientas/duplicados" element={<RutaProtegida ruta="/herramientas/duplicados"><Duplicados /></RutaProtegida>} />
              <Route path="herramientas/informe-9dj" element={<RutaProtegida ruta="/herramientas/informe-9dj"><Informe9DJ /></RutaProtegida>} />
              <Route path="herramientas/geocodificacion" element={<RutaProtegida ruta="/herramientas/geocodificacion"><Geocodificacion /></RutaProtegida>} />

              {/* ---- Configuración (tablas maestras y parámetros) ---- */}
              <Route path="config/usuarios" element={<RutaProtegida ruta="/config/usuarios"><Usuarios /></RutaProtegida>} />
              <Route path="config/rubros" element={<RutaProtegida ruta="/config/rubros"><Rubros /></RutaProtegida>} />
              <Route path="config/feriados" element={<RutaProtegida ruta="/config/feriados"><Feriados /></RutaProtegida>} />
              <Route path="config/plantilla" element={<RutaProtegida ruta="/config/plantilla"><Plantilla /></RutaProtegida>} />
              <Route path="config/parametros" element={<RutaProtegida ruta="/config/parametros"><Parametros /></RutaProtegida>} />

              {/* ---- Portal del titular ---- */}
              <Route path="portal" element={<RutaProtegida ruta="/portal"><Portal /></RutaProtegida>} />

              {/* ---- Cualquier otra cosa ---- */}
              <Route path="*" element={<NoEncontrado />} />
            </Route>
          </Routes>
        </HashRouter>
      </DatosProvider>
    </RolProvider>
  );
}

export default App;
