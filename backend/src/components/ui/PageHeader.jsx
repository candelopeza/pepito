/* ============================================================================
   ui/PageHeader.jsx  —  ENCABEZADO DE PÁGINA
   ----------------------------------------------------------------------------
   OJO: lo usan TODAS las páginas. Si lo tocás, cambia en todas.

   PROPS
     etiqueta     el renglón chico azul de arriba, ej: "LOCALES"
     titulo       el título grande
     subtitulo    (opcional) una línea de contexto debajo del título
     botonVolver  agrega "VOLVER AL INICIO". Va en todas menos en Home.
     volverA      (opcional) volver a otra parte en vez del inicio, ej. el
                  padrón desde la ficha de un local: volverA="/locales"
     volverTexto  (opcional) el texto de ese botón
     acciones     (opcional) JSX a la derecha del bloque de volver: los botones
                  propios de la pantalla

   ESTILOS: App.css secciones 4 y 5.
   ============================================================================ */

import { Link } from 'react-router-dom';

function PageHeader({ etiqueta, titulo, subtitulo, botonVolver = false, volverA = '/', volverTexto, acciones }) {
  const mostrarBarra = botonVolver || acciones;

  return (
    <>
      <h2 className="inicio-tag">{etiqueta}</h2>
      <h1 className="sistema-titulo">{titulo}</h1>
      {subtitulo && <p className="pagina-subtitulo">{subtitulo}</p>}

      {mostrarBarra && (
        <div className="info-bar">
          {botonVolver && (
            <Link to={volverA} className="admin-badge btn-volver">
              <span>← {volverTexto ?? 'VOLVER AL INICIO'}</span>
            </Link>
          )}
          {/* El margin-left: auto de .header-acciones empuja los botones de la
              pantalla al extremo derecho. */}
          {acciones && <div className="header-acciones">{acciones}</div>}
        </div>
      )}
    </>
  );
}

export default PageHeader;
