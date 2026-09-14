/* ============================================================================
   pages/herramientas/Geocodificacion.jsx
   (URL: /#/herramientas/geocodificacion)
   ----------------------------------------------------------------------------
   Sección 9.2 del pliego. La vista de revisión de los locales que quedaron sin
   ubicación.

   >>> LA REGLA QUE JUSTIFICA QUE ESTA PANTALLA EXISTA <<<
   "Cuando la dirección no puede geocodificarse, el local queda sin ubicación y
   debe aparecer en una vista de revisión para que la oficina corrija la
   dirección. NO debe completarse con un valor aproximado ni con la coordenada
   del relevamiento."

   Es más fácil poner un punto aproximado y que el mapa "no tenga huecos". Pero
   un punto aproximado en un mapa se lee como un dato: alguien va a rutear una
   entrega hacia ahí. Preferimos el hueco visible.

   VALIDACIÓN TERRITORIAL: toda coordenada obtenida se valida contra el
   polígono del ejido municipal y la que cae afuera se DESCARTA, no se guarda.
   [NO PORTAR] El recuadro que usa el sistema viejo (lat -28,0 a -26,0 / lng
   -66,5 a -64,0) abarca toda la provincia y deja pasar locales de otros
   departamentos: sirve como filtro previo, no como validación.
   ============================================================================ */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Badge from '../../components/ui/Badge';
import Aviso, { Vacio } from '../../components/ui/Aviso';
import Modal from '../../components/ui/Modal';
import FormLocal from '../../components/FormLocal';
import { useDatos } from '../../datos/datosContexto';
import { LIMITE_MUNICIPAL } from '../../dominio/geo';

function Geocodificacion() {
  const { localesConEstado, guardarLocal, geocodificarPendientes } = useDatos();
  const [editando, setEditando] = useState(null);

  const sinGeo = localesConEstado.filter((l) => l.sinGeo);
  const total = localesConEstado.length;

  return (
    <>
      <PageHeader
        etiqueta="HERRAMIENTAS"
        titulo="GEOCODIFICACIÓN PENDIENTE"
        subtitulo={`${sinGeo.length} de ${total} locales sin ubicación`}
        botonVolver
        acciones={
          <button type="button" className="btn-secundario" onClick={geocodificarPendientes}>
            Reintentar geocodificación
          </button>
        }
      />
      {sinGeo.length === 0 ? (
        <Vacio titulo="Todos los locales tienen ubicación">
          No hay direcciones para corregir.
        </Vacio>
      ) : (
        <>
          <table className="tabla-datos">
            <thead>
              <tr>
                <th>Local</th>
                <th>Dirección declarada</th>
                <th>Por qué no se pudo</th>
                <th>Coordenada del relevamiento</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {sinGeo.map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link to={`/locales/${l.id}`} className="link-local">
                      {l.nombreLocal}
                    </Link>
                    <small className="celda-sub">N° {l.id}</small>
                  </td>
                  <td>{l.direccion || <Badge color="rojo">Sin dirección</Badge>}</td>
                  <td>{l.motivoSinGeo}</td>
                  {/* Se muestra a propósito, con la advertencia: es el dato que
                      en el sistema viejo se terminaba copiando al padrón. */}
                  <td className="texto-gris">
                    no se usa para el padrón
                    <small className="celda-sub">aunque exista, no es la ubicación del establecimiento</small>
                  </td>
                  <td>
                    <button type="button" className="btn-tabla" onClick={() => setEditando(l)}>
                      Corregir dirección
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* ---------- El límite contra el que se valida ---------- */}

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

export default Geocodificacion;
