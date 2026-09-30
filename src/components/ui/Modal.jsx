/* ============================================================================
   ui/Modal.jsx  —  VENTANA EMERGENTE
   ----------------------------------------------------------------------------
   La ventana blanca que se abre encima de la pantalla, con el fondo oscurecido.
   No sabe nada de locales ni de formularios: le pasás título y contenido.

   PROPS
     abierto   si es false no dibuja NADA (ver la nota de abajo)
     etiqueta  (opcional) el renglón chico arriba del título
     titulo    el encabezado
     ancho     (opcional) 'normal' | 'ancho' — 'ancho' para pasos y grillas
     onCerrar  se llama con la X, con Escape o al tocar el fondo
     children  el contenido

   >>> OJO CON ESTO (es la causa de un bug muy típico) <<<
   Cuando `abierto` es false devuelve null: TODO su contenido se desmonta y
   pierde su estado. Eso es lo que queremos: si abrís el modal del local 1,
   escribís algo y lo cerrás, al abrir el local 2 el formulario arranca limpio.
   Si algún día se cambia por esconderlo con CSS, el formulario va a quedar con
   los datos del local anterior.

   3 FORMAS DE CERRARLO: la X, Escape, o un clic en el fondo oscuro.
   El clic en el fondo usa onMouseDown y compara el elemento, así arrastrar
   para seleccionar texto no cierra la ventana.

   >>> SE DIBUJA CON UN PORTAL, DIRECTO EN <body> <<<
   No donde está escrito en el JSX. Es obligatorio: un modal abierto desde un
   botón que vive DENTRO de una tabla (el Data Grid) quedaba encerrado en ella.
   `position: fixed` deja de referirse a la pantalla cuando algún ancestro tiene
   `transform`, `filter` o `contain`, y el Data Grid usa transform para
   desplazar las filas. Resultado: la ventana aparecía adentro de la tabla,
   recortada y sin poder verse entera.

   El portal la saca de ese árbol y la cuelga del <body>, donde `position: fixed`
   vuelve a significar "respecto de la pantalla".

   ESTILOS: App.css sección 12.
   ============================================================================ */

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

function Modal({ abierto, etiqueta, titulo, ancho = 'normal', onCerrar, children }) {
  useEffect(() => {
    if (!abierto) return;

    function alPresionarTecla(e) {
      if (e.key === 'Escape') onCerrar();
    }
    document.addEventListener('keydown', alPresionarTecla);

    // Bloquea el scroll de la página de atrás: con formularios largos, rodar
    // la rueda movía el fondo en vez del contenido del modal.
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', alPresionarTecla);
      document.body.style.overflow = overflowPrevio;
    };
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  function alTocarFondo(e) {
    if (e.target === e.currentTarget) onCerrar();
  }

  return createPortal(
    <div className="modal-fondo" onMouseDown={alTocarFondo}>
      <div
        className={`modal-caja ${ancho === 'ancho' ? 'modal-caja-ancha' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-titulo"
      >
        <div className="modal-encabezado">
          <div>
            {etiqueta && <span className="modal-etiqueta">{etiqueta}</span>}
            <h2 className="modal-titulo" id="modal-titulo">
              {titulo}
            </h2>
          </div>
          <button type="button" className="modal-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>

        <div className="modal-cuerpo">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export default Modal;
