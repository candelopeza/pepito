/* ============================================================================
   pages/Relevamiento.jsx  —  RELEVAMIENTOS  (URL: /#/relevamientos)
   ----------------------------------------------------------------------------
   RUTA EN: App.jsx -> <Route path="relevamientos" ... />
   ESTILOS: App.css -> sección 7 (TARJETAS)

   ESTA PANTALLA ES UN MENÚ, NO UNA PANTALLA DE DATOS.
   Solo muestra 4 tarjetas de opciones. No lista relevamientos ni tiene datos.

   >>> IMPORTANTE: NINGUNA TARJETA FUNCIONA TODAVÍA <<<
   Las 4 <Card> están sin prop `to`, así que el clic NO hace nada. Es lo
   esperado, no un bug: las pantallas de destino no están hechas.

   CÓMO SE ACTIVA UNA TARJETA (3 pasos):
     1. crear la página nueva en pages/
     2. agregarle un <Route> en App.jsx
     3. pasarle to="/esa-ruta" a la <Card> de acá

   SI HAY PROBLEMA ACÁ:
     - "Hago clic y no pasa nada": ver arriba, falta el `to`.
     - "No aparece ningún relevamiento": esta pantalla no lista nada.
        Si hay que listarlos, se copia la estructura de tabla de Local.jsx.

   Misma forma que Tramite.jsx y Documentacion.jsx.
   ============================================================================ */

import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';

function Relevamiento() {
  return (
    <>
      {/* ---------- BLOQUE 1: encabezado ---------- */}
      <PageHeader etiqueta="RELEVAMIENTOS" titulo="REGISTRO Y CONSULTA DE INSPECCIONES" botonVolver />

      {/* ---------- BLOQUE 2: separador ---------- */}
      <div className="accesos-header">
        <span>OPCIONES</span>
      </div>

      {/* ---------- BLOQUE 3: opciones ----------
          Las 4 sin `to` -> por ahora son botones muertos. */}
      <div className="grid-accesos">
        <Card titulo="Nuevo Relevamiento" descripcion="Cargar inspección" />
        <Card titulo="Consultar" descripcion="Ver todos los relevamientos" />
        <Card titulo="Filtrar por Inspector" />
        <Card titulo="Gran Generador / Menor" />
      </div>
    </>
  );
}

export default Relevamiento;
