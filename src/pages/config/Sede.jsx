/* ============================================================================
   pages/config/Sede.jsx  —  ADMIN DE SEDES  (URL: /#/config/sedes)
   ----------------------------------------------------------------------------
   RUTA EN: App.jsx -> <Route path="config/sedes" ... />
   MENÚ:    components/Sidebar.jsx, grupo "Configuración"

   >>> PANTALLA VACÍA A PROPÓSITO (placeholder) <<<
   Hoy solo tiene el encabezado y un texto explicativo. No hay tabla de
   sedes, ni alta, ni edición, ni baja. Si entrás y "no hay nada", es esto,
   no un error.

   QUÉ FALTA HACER ACÁ:
     - tabla de sedes existentes   -> copiar la estructura de pages/Local.jsx
     - formulario de alta/edición  -> las clases ya están listas en
       App.css sección 10 (.formulario / .form-grupo / .btn-primario)

   OJO: el estilo del <p> está inline (style={{...}}) en vez de una clase.
   Cuando esta pantalla se haga en serio, pasarlo a App.css.

   Gemela de pages/config/Rubro.jsx: están igual, cambia solo el texto.
   ============================================================================ */

import PageHeader from '../../components/ui/PageHeader';

function Sede() {
  return (
    <>
      {/* ---------- BLOQUE 1: encabezado ---------- */}
      <PageHeader etiqueta="CONFIGURACIÓN" titulo="ADMINISTRACIÓN DE SEDES" botonVolver />

      {/* ---------- BLOQUE 2: texto provisorio ----------
          Acá va a ir la tabla + el formulario. */}
      <p style={{ marginTop: '20px', color: '#666' }}>
        Acá se cargan y editan las sedes del sistema.
      </p>
    </>
  );
}

export default Sede;
