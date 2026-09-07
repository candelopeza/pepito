/* ============================================================================
   ui/Confirmar.jsx  —  "¿SEGURO?"
   ----------------------------------------------------------------------------
   Ventana chica de confirmación para los actos que no se pueden deshacer o que
   producen efectos jurídicos: emitir una cédula, iniciar un expediente,
   fusionar dos locales, confirmar una exención.

   POR QUÉ EXISTE Y NO SE USA window.confirm(): porque acá hace falta EXPLICAR
   la consecuencia, no preguntar "¿está seguro?". "Se va a generar el
   expediente de multa N° tal" es información; "¿confirma?" no es nada.
   Además el confirm del navegador no se puede estilar ni traducir.

   PROPS
     abierto, titulo, onConfirmar, onCancelar
     children        el texto que explica la consecuencia
     textoConfirmar  (opcional) por defecto 'Confirmar'
     peligro         (opcional) pinta el botón de rojo: actos irreversibles
   ============================================================================ */

import Modal from './Modal';

function Confirmar({ abierto, titulo, children, onConfirmar, onCancelar, textoConfirmar = 'Confirmar', peligro = false }) {
  return (
    <Modal abierto={abierto} titulo={titulo} onCerrar={onCancelar}>
      <div className="confirmar-cuerpo">{children}</div>
      <div className="form-acciones">
        <button type="button" className={peligro ? 'btn-peligro' : 'btn-primario'} onClick={onConfirmar}>
          {textoConfirmar}
        </button>
        <button type="button" className="btn-secundario" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </Modal>
  );
}

export default Confirmar;
