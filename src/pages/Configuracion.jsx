/* ============================================================================
   pages/Configuracion.jsx  —  CONFIGURACIÓN  (URL: /#/configuracion)
   ----------------------------------------------------------------------------
   Las cuatro pantallas de configuración, juntas: eran pestañas separadas del
   menú (Rubros, Feriados, Plantilla, Parámetros) con el mismo fin y casi los
   mismos roles. Acá son secciones de UNA página; Parámetros sigue siendo solo
   de Dirección (sección 4.1 del pliego), así que esa solapa no aparece para
   coordinación.
   ============================================================================ */

import { useState } from 'react';
import PageHeader from '../components/ui/PageHeader';
import Rubros from './config/Rubros';
import Feriados from './config/Feriados';
import Plantilla from './config/Plantilla';
import Parametros from './config/Parametros';
import { useRol } from '../auth/rolContexto';

const SECCIONES = [
  { id: 'rubros', etiqueta: 'Rubros', Componente: Rubros },
  { id: 'feriados', etiqueta: 'Feriados', Componente: Feriados },
  { id: 'plantilla', etiqueta: 'Plantilla de cédula', Componente: Plantilla },
  // Editables únicamente desde el rol Dirección (sección 4.1).
  { id: 'parametros', etiqueta: 'Parámetros', Componente: Parametros, roles: ['direccion', 'administrador'] },
];

function Configuracion() {
  const { rol } = useRol();
  const visibles = SECCIONES.filter((s) => !s.roles || s.roles.includes(rol));
  const [activa, setActiva] = useState(visibles[0]?.id);
  const seccion = visibles.find((s) => s.id === activa) ?? visibles[0];

  return (
    <>
      <PageHeader etiqueta="CONFIGURACIÓN" titulo="CONFIGURACIÓN DEL SISTEMA" botonVolver />

      <div className="pestanas-internas">
        {visibles.map((s) => (
          <button
            key={s.id}
            type="button"
            className={s.id === seccion?.id ? 'btn-primario' : 'btn-secundario'}
            onClick={() => setActiva(s.id)}
          >
            {s.etiqueta}
          </button>
        ))}
      </div>

      {seccion && <seccion.Componente />}
    </>
  );
}

export default Configuracion;
