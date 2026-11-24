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
import UbicarEnMapa from './UbicarEnMapa';
import { useDatos } from '../datos/datosContexto';

function SeccionGeocodificacion() {
  const { localesConEstado, guardarLocal, geocodificarPendientes } = useDatos();
  const [editando, setEditando] = useState(null);
  // El local que se está ubicando a mano en el mapa (UbicarEnMapa).
  const [ubicando, setUbicando] = useState(null);
  /* Por qué no se pudo ubicar cada uno, según el último "Reintentar". Antes la
     columna quedaba vacía: el backend explicaba el motivo y acá se perdía. */
  const [motivos, setMotivos] = useState(() => new Map());

  const sinGeo = localesConEstado
    .filter((l) => l.sinGeo)
    .map((l) => ({ ...l, motivoSinGeo: motivos.get(l.id) ?? l.motivoSinGeo ?? '' }));

  async function reintentar() {
    const r = await geocodificarPendientes();
    if (r?.sinResolver) setMotivos(new Map(r.sinResolver.map((x) => [x.id, x.motivo])));
  }
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
      /* La columna "Coordenada del relevamiento" se sacó el 17/11/2026 a pedido
         de cande: decía lo mismo en todas las filas ("no se usa para el
         padrón") y no aportaba nada. La regla sigue igual: la coordenada del
         relevamiento nunca se copia al padrón. */
      {
        field: 'accion',
        headerName: 'Acción',
        width: 300,
        sortable: false,
        filterable: false,
        renderCell: ({ row }) => (
          <span style={{ display: 'flex', gap: 6 }}>
            {/* Cuando el mapa no tiene la altura de esa calle, corregir la
                dirección no alcanza: se ubica a mano (24/11/2026). */}
            <button type="button" className="btn-tabla" onClick={() => setUbicando(row)}>
              Ubicar en el mapa
            </button>
            <button type="button" className="btn-tabla" onClick={() => setEditando(row)}>
              Corregir dirección
            </button>
          </span>
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
        <button type="button" className="btn-secundario" onClick={reintentar}>
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

      {ubicando && <UbicarEnMapa local={ubicando} onCerrar={() => setUbicando(null)} />}

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
