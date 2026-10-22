/* ============================================================================
   SeccionGeocodificacion.jsx  —  LA REVISIÓN DE UBICACIONES, DENTRO DEL MAPA
   ----------------------------------------------------------------------------
   Sección 9.2 del pliego. Antes era una pestaña aparte (Herramientas →
   Geocodificación pendiente); ahora vive al pie del MAPA, que es donde el
   problema se ve: el hueco del mapa y su corrección en la misma pantalla.
   Solo la ven los roles que pueden corregir (la monta Mapa.jsx).

   >>> LA REGLA QUE JUSTIFICA QUE ESTA SECCIÓN EXISTA <<<
   "Cuando la dirección no puede geocodificarse, el local queda sin ubicación y
   debe aparecer en una vista de revisión para que la oficina corrija la
   dirección. NO debe completarse con un valor aproximado ni con la coordenada
   del relevamiento."

   DOS PARTES:
     arriba  los locales SIN ubicación, para corregirles la dirección
     abajo   los que TIENEN una ubicación que no se corresponde con su
             dirección (RevisionCoordenadas), para recalcularla
   ============================================================================ */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Grilla from './ui/Grilla';
import Badge from './ui/Badge';
import { Vacio } from './ui/Aviso';
import Modal from './ui/Modal';
import FormLocal from './FormLocal';
import RevisionCoordenadas from './RevisionCoordenadas';
import { useDatos } from '../datos/datosContexto';

function SeccionGeocodificacion() {
  const { localesConEstado, guardarLocal, geocodificarPendientes } = useDatos();
  const [editando, setEditando] = useState(null);

  const sinGeo = localesConEstado.filter((l) => l.sinGeo);
  const total = localesConEstado.length;

  /* Las columnas necesitan setEditando (el botón de corregir), así que se
     arman adentro del componente. */
  const columnasSinGeo = useMemo(
    () => [
      {
        field: 'nombreLocal',
        headerName: 'Local',
        flex: 1,
        minWidth: 400,
        renderCell: ({ row }) => (
          <span className="celda-apilada">
            <Link to={`/locales/${row.id}`} className="link-local">
              {row.nombreLocal}
            </Link>
            <small className="celda-sub">N° {row.id}</small>
          </span>
        ),
      },
      {
        field: 'direccion',
        headerName: 'Dirección declarada',
        flex: 1.2,
        minWidth: 200,
        renderCell: ({ row }) => row.direccion || <Badge color="rojo">Sin dirección</Badge>,
      },
      { field: 'motivoSinGeo', headerName: 'Por qué no se pudo', flex: 1, minWidth: 200 },
      {
        field: 'coordenadaRelevamiento',
        headerName: 'Coordenada del relevamiento',
        width: 450,
        sortable: false,
        filterable: false,
        /* Se muestra a propósito, con la advertencia: es el dato que en el
           sistema viejo se terminaba copiando al padrón. */
        renderCell: () => (
          <span className="celda-apilada texto">
            no se usa para el padrón
            <small className="celda-sub">aunque exista, no es la ubicación del establecimiento</small>
          </span>
        ),
      },
      {
        field: 'accion',
        headerName: 'Acción',
        width: 200,
        sortable: false,
        filterable: false,
        renderCell: ({ row }) => (
          <button type="button" className="btn-tabla" onClick={() => setEditando(row)}>
            Corregir dirección
          </button>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <div className="accesos-header">
        <span>
          Geocodificación pendiente ({sinGeo.length} de {total} locales sin ubicación)
        </span>
        <button type="button" className="btn-secundario" onClick={geocodificarPendientes}>
          Reintentar geocodificación
        </button>
      </div>
      {sinGeo.length === 0 ? (
        <Vacio titulo="Todos los locales tienen ubicación">
          No hay direcciones para corregir.
        </Vacio>
      ) : (
        <>
          <Grilla
            filas={sinGeo}
            columnas={columnasSinGeo}
            nombreArchivo="locales-sin-coordenada"
            vacio="Todos los locales tienen coordenada."
            alto="auto"
          />
        </>
      )}

      {/* ---------- El límite contra el que se valida ---------- */}

      <RevisionCoordenadas />

      {editando && (
        <Modal abierto etiqueta="PADRÓN" titulo={`Corregir la dirección de ${editando.nombreLocal}`} ancho="ancho" onCerrar={() => setEditando(null)}>
          <FormLocal
            local={editando}
            onGuardar={(l) => {
              // Al guardar, guardarLocal() vuelve a geocodificar sola: no hay
              // un paso aparte que alguien pueda olvidarse de ejecutar.
              guardarLocal(l);
              setEditando(null);
            }}
            onCancelar={() => setEditando(null)}
          />
        </Modal>
      )}
    </>
  );
}

export default SeccionGeocodificacion;
