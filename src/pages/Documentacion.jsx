/* ============================================================================
   pages/Documentacion.jsx  —  DDJJ Y CONTRATOS  (URL: /#/documentacion)
   ----------------------------------------------------------------------------
   RUTA EN: App.jsx -> <Route path="documentacion" ... />
   ESTILOS: App.css -> sección 7 (TARJETAS)

   ESTA PANTALLA ES UN MENÚ, NO UNA PANTALLA DE DATOS.
   Son 6 tarjetas, y OJO que son de dos naturalezas distintas:
       - por TIPO de documento:   Declaraciones Juradas, Contratos, DDJJ Reciclaje
       - por ESTADO del documento: Vigentes, Vencidas, Pendientes de Revisión
   Están mezcladas en la misma grilla. Si más adelante confunde al usuario,
   convendría separarlas en dos bloques con su propio .accesos-header.

   >>> IMPORTANTE: NINGUNA TARJETA FUNCIONA TODAVÍA <<<
   Las 6 <Card> están sin prop `to`: el clic no hace nada. Es lo esperado.

   CÓMO SE ACTIVA UNA TARJETA (3 pasos):
     1. crear la página nueva en pages/
     2. agregarle un <Route> en App.jsx
     3. pasarle to="/esa-ruta" a la <Card> de acá

   Misma forma que Relevamiento.jsx y Tramite.jsx.
   ============================================================================ */

import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';

function Documentacion() {
  return (
    <>
      {/* ---------- BLOQUE 1: encabezado ---------- */}
      <PageHeader etiqueta="DOCUMENTACIÓN" titulo="DDJJ, CONTRATOS Y DOCUMENTOS" botonVolver />

      {/* ---------- BLOQUE 2: separador ---------- */}
      <div className="accesos-header">
        <span>CATEGORÍAS</span>
      </div>

      {/* ---------- BLOQUE 3: opciones ---------- */}
      <div className="grid-accesos">
        {/* --- por tipo de documento --- */}
        <Card titulo="Declaraciones Juradas" />
        <Card titulo="Contratos" />
        <Card titulo="DDJJ de Reciclaje" />

        {/* --- por estado del documento --- */}
        <Card titulo="Vigentes" />
        <Card titulo="Vencidas" />
        <Card titulo="Pendientes de Revisión" />
      </div>
    </>
  );
}

export default Documentacion;
