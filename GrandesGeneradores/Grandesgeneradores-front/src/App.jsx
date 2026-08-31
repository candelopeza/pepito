import { Routes, Route, HashRouter} from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Local from './pages/Local';
import Relevamiento from './pages/Relevamiento';
import Tramite from './pages/Tramite';
import Documentacion from './pages/Documentacion';
import Expediente from './pages/Expediente';
import Seguimiento from './pages/Seguimiento';
import Rubro from './pages/config/Rubro';
import Sede from './pages/config/Sede';
import './App.css';

function App() {
  return (
   <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="locales" element={<Local />} />
          <Route path="relevamientos" element={<Relevamiento />} />
          <Route path="tramites" element={<Tramite />} />
          <Route path="documentacion" element={<Documentacion />} />
          <Route path="expedientes" element={<Expediente />} />
          <Route path="seguimiento" element={<Seguimiento />} />
          <Route path="config/rubros" element={<Rubro />} />
          <Route path="config/sedes" element={<Sede />} />
        </Route>
      </Routes>
    </HashRouter>)
  ;
}

export default App;
