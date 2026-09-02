/* ============================================================================
   pages/config/Rubro.jsx  —  ADMIN DE RUBROS  (URL: /#/config/rubros)
   ----------------------------------------------------------------------------
   RUTA EN: App.jsx -> <Route path="config/rubros" ... />
   MENÚ:    components/Sidebar.jsx, grupo "Configuración"

   >>> PANTALLA VACÍA A PROPÓSITO (placeholder) <<<
   Hoy solo tiene el encabezado y un texto explicativo. No hay tabla de
   rubros, ni alta, ni edición, ni baja. Si entrás y "no hay nada", es esto,
   no un error.

   QUÉ FALTA HACER ACÁ:
     - tabla de rubros existentes  -> copiar la estructura de pages/Local.jsx
     - formulario de alta/edición  -> las clases ya están listas en
       App.css sección 10 (.formulario / .form-grupo / .btn-primario)

   OJO: el estilo del <p> está inline (style={{...}}) en vez de una clase.
   Cuando esta pantalla se haga en serio, pasarlo a App.css.

   Gemela de pages/config/Sede.jsx: están igual, cambia solo el texto.
   ============================================================================ */

import PageHeader from '../../components/ui/PageHeader';

function Rubro() {
  return (
    <>
      {/* ---------- BLOQUE 1: encabezado ---------- */}
      <PageHeader etiqueta="CONFIGURACIÓN" titulo="ADMINISTRACIÓN DE RUBROS" botonVolver />

      {/* ---------- BLOQUE 2: texto provisorio ----------
          Acá va a ir la tabla + el formulario. */}
      <p style={{ marginTop: '20px', color: '#666' }}>
        Acá se cargan y editan los rubros de los establecimientos.
      </p>
    </>
  );
}

export default Rubro;
