/* ============================================================================
   ui/Modal.jsx  —  VENTANA EMERGENTE (pieza reutilizable)
   ----------------------------------------------------------------------------
   Es la cajita gris que se abre encima de la pantalla, con el fondo oscurecido.
   No sabe nada de locales ni de formularios: le pasás un título y el contenido
   que quieras adentro. Sirve igual para Rubros, Sedes o lo que venga.

   USADO EN: pages/Local.jsx (ver y editar un local)
   ESTILOS:  App.css -> sección 12 (MODAL)

   PROPS:
     abierto   (bool)     si es false no dibuja NADA (ver nota de abajo)
     titulo    (texto)    el encabezado de la ventana
     onCerrar  (función)  se llama al tocar la X, la tecla Escape o el fondo
     children  (JSX)      el contenido, normalmente un formulario

   ---------------------------------------------------------------------------
   OJO CON ESTO (es la causa de un bug muy típico):
   cuando `abierto` es false, este componente devuelve null, o sea que TODO su
   contenido se desmonta y pierde su estado. Eso es lo que queremos: si abrís
   el modal para el local 1, escribís algo y lo cerrás, al abrir el local 2 el
   formulario arranca limpio. Si algún día se cambia por ocultarlo con CSS, el
   formulario va a quedar con los datos del local anterior.
   ---------------------------------------------------------------------------

   3 FORMAS DE CERRARLO (las tres llaman a onCerrar):
     - el botón X
     - la tecla Escape
     - un clic en el fondo oscuro

   SI HAY PROBLEMA ACÁ:
     - "Se cierra solo cuando arrastro para seleccionar texto": no debería,
       por eso usa onMouseDown y compara el elemento. Ver el comentario abajo.
     - "Escape no lo cierra": el listener se agrega solo cuando está abierto.
       Si onCerrar cambia de identidad en cada render del padre, el efecto se
       re-suscribe todo el tiempo; envolvé onCerrar en useCallback.
     - "El fondo de atrás sigue scrolleando": es así hoy, no está bloqueado.
       Con formularios cortos no molesta; si más adelante hay modales largos,
       acá va un document.body.style.overflow = 'hidden'.
   ============================================================================ */

import { useEffect } from 'react';

function Modal({ abierto, titulo, onCerrar, children }) {

  // ===== A. CERRAR CON LA TECLA ESCAPE =====
  // El listener va en document porque el foco puede estar en cualquier lado.
  // Se quita al cerrar (el return del efecto): si no, quedarían listeners
  // acumulados cada vez que se abre el modal.
  useEffect(() => {
    if (!abierto) return;

    function alPresionarTecla(e) {
      if (e.key === 'Escape') onCerrar();
    }

    document.addEventListener('keydown', alPresionarTecla);
    return () => document.removeEventListener('keydown', alPresionarTecla);
  }, [abierto, onCerrar]);

  // ===== B. SI ESTÁ CERRADO, NO DIBUJA NADA =====
  if (!abierto) return null;

  // ===== C. CERRAR AL TOCAR EL FONDO =====
  // Se usa onMouseDown y no onClick, y se compara target con currentTarget.
  // Motivo: si alguien arrastra el mouse desde adentro del formulario hasta
  // afuera (seleccionando texto, por ejemplo), el navegador considera eso un
  // clic sobre el fondo y el modal se cerraría solo, perdiendo lo escrito.
  function alTocarFondo(e) {
    if (e.target === e.currentTarget) onCerrar();
  }

  // ===== D. LO QUE SE DIBUJA =====
  return (
    <div className="modal-fondo" onMouseDown={alTocarFondo}>
      <div className="modal-caja" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">

        {/* --- Encabezado: título + botón cerrar --- */}
        <div className="modal-encabezado">
          <h2 className="modal-titulo" id="modal-titulo">{titulo}</h2>
          <button
            type="button"
            className="modal-cerrar"
            onClick={onCerrar}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        {/* --- Contenido: lo que le haya pasado la pantalla --- */}
        <div className="modal-cuerpo">
          {children}
        </div>

      </div>
    </div>
  );
}

export default Modal;
