/* ============================================================================
   pages/Tramite.jsx  —  GESTIÓN DE TRÁMITES  (URL: /#/tramites)
   ----------------------------------------------------------------------------
   RUTA EN: App.jsx -> <Route path="tramites" ... />
   ESTILOS: App.css -> sección 7 (TARJETAS)

   ESTA PANTALLA ES UN MENÚ, NO UNA PANTALLA DE DATOS.
   Muestra los 4 tipos de trámite como tarjetas. No lista trámites reales.

   >>> IMPORTANTE: NINGUNA TARJETA FUNCIONA TODAVÍA <<<
   Las 4 <Card> están sin prop `to`: el clic no hace nada. Es lo esperado,
   las pantallas de destino no existen.

   CÓMO SE ACTIVA UNA TARJETA (3 pasos):
     1. crear la página nueva en pages/
     2. agregarle un <Route> en App.jsx
     3. pasarle to="/esa-ruta" a la <Card> de acá

   OJO: el orden de las tarjetas refleja el circuito administrativo real
   (1ra notificación -> 2da notificación -> revisión). No las mezcles sin
   confirmar con el área, la secuencia significa algo.

   Misma forma que Relevamiento.jsx y Documentacion.jsx.
   ============================================================================ */

import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';

function Tramite() {
  return (
    <>
      {/* ---------- BLOQUE 1: encabezado ---------- */}
      <PageHeader etiqueta="TRÁMITES" titulo="GESTIÓN DE TRÁMITES" botonVolver />

      {/* ---------- BLOQUE 2: separador ---------- */}
      <div className="accesos-header">
        <span>TIPOS DE TRÁMITE</span>
      </div>

      {/* ---------- BLOQUE 3: opciones ----------
          Las 3 primeras son pasos del circuito; la última es el listado
          general. Todas sin `to` todavía. */}
      <div className="grid-accesos">
        <Card titulo="Primera Notificación" />
        <Card titulo="Segunda Notificación" />
        <Card titulo="Revisión de Documentación" />
        <Card titulo="Todos los Trámites" />
      </div>
    </>
  );
}

export default Tramite;
