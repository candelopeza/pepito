/* ============================================================================
   ui/PageHeader.jsx  —  ENCABEZADO DE PÁGINA (pieza reutilizable)
   ----------------------------------------------------------------------------
   OJO: lo usan TODAS las páginas. Si lo tocás, cambia en todas.
   ESTILOS: App.css -> secciones 4 (TÍTULOS) y 5 (BOTÓN VOLVER)

   PROPS:
     etiqueta    (texto)  el renglón chico azul de arriba, ej: "LOCALES"
     titulo      (texto)  el título grande, ej: "PADRÓN DE ESTABLECIMIENTOS"
     botonVolver (bool)   si es true, agrega el botón "VOLVER AL INICIO".
                          Va en todas las páginas MENOS en Home (que ya es
                          el inicio, volver a sí misma no tiene sentido).

   SI HAY PROBLEMA ACÁ:
     - "A una página le falta el botón Volver": no es este archivo, es que
        esa página no le pasó la prop `botonVolver`.
     - "El título aparece en blanco": la página no pasó `titulo`.
     - "El botón Volver quedó pegado al contenido": es el margin de
        .info-bar en App.css sección 5.

   NOTA: reutiliza la clase .info-bar, que también usa Home para el bloque
   de usuario + fecha. Si retocás .info-bar, mirá las dos pantallas.
   ============================================================================ */

import { Link } from 'react-router-dom';

function PageHeader({ etiqueta, titulo, botonVolver = false }) {
  return (
    <>
      {/* ===== 1. Renglón chico azul ===== */}
      <h2 className="inicio-tag">{etiqueta}</h2>

      {/* ===== 2. Título grande ===== */}
      <h1 className="sistema-titulo">{titulo}</h1>

      {/* ===== 3. Botón Volver (solo si la página lo pidió) ===== */}
      {botonVolver && (
        <div className="info-bar">
          <Link to="/" className="admin-badge btn-volver">
            <span>← VOLVER AL INICIO</span>
          </Link>
        </div>
      )}
    </>
  );
}

export default PageHeader;
