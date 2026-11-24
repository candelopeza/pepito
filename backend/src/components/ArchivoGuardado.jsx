/* ============================================================================
   ArchivoGuardado.jsx  —  VER UNA FOTO O UN DOCUMENTO GUARDADO
   ----------------------------------------------------------------------------
   Un botón que pide el archivo al servidor recién cuando alguien lo quiere
   ver (las fotos y los PDF no viajan con la carga de la app). Si es una
   imagen la muestra en chico, con link para verla en grande; si es un PDF,
   deja el link para abrirlo.

   Lo usan el historial de la ficha (la foto de la entrega, el documento de una
   DDJJ) y la pantalla de Validar presentaciones. Los archivos los guarda
   backend/archivos.js, en la tabla opcional `archivo`.

   PROPS
     archivo   { id, nombre } tal como llega en la actuación
     etiqueta  el texto del botón ('Ver foto', 'Ver documento')
   ============================================================================ */

import { useState } from 'react';
import { descargarArchivo } from '../datos/api';

function ArchivoGuardado({ archivo, etiqueta = 'Ver archivo' }) {
  const [abierto, setAbierto] = useState(null);
  const [error, setError] = useState(null);

  if (abierto?.tipo?.startsWith('image/')) {
    return (
      <span className="archivo-abierto">
        <a href={abierto.url} target="_blank" rel="noreferrer" title="Abrir en grande">
          <img src={abierto.url} alt={archivo.nombre || 'Archivo guardado'} className="hist-foto" />
        </a>
        {/* Sin esto, la imagen quedaba abierta para siempre: no había forma
            de volver al botón. */}
        <button type="button" className="btn-tabla" onClick={() => setAbierto(null)}>
          Cerrar
        </button>
      </span>
    );
  }
  if (abierto) {
    return (
      <span className="archivo-abierto">
        <a href={abierto.url} target="_blank" rel="noreferrer" className="btn-tabla">
          Abrir {archivo.nombre || 'el documento'}
        </a>
        <button type="button" className="btn-tabla" onClick={() => setAbierto(null)}>
          Cerrar
        </button>
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        className="btn-tabla"
        onClick={() =>
          descargarArchivo(archivo.id)
            .then(setAbierto)
            .catch((e) => setError(e.message))
        }
      >
        {etiqueta}
      </button>
      {error && <span className="hist-pendiente"> {error}</span>}
    </>
  );
}

export default ArchivoGuardado;
