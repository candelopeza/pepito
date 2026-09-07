/* ============================================================================
   pages/Expediente.jsx  —  EXPEDIENTES DE MULTA  (URL: /#/expedientes)
   ----------------------------------------------------------------------------
   Etapa 6 del circuito. Dos bloques: los que hay que generar y los ya
   iniciados.

   >>> ACÁ SE HABLA SIEMPRE DEL EXPEDIENTE DE MULTA <<<
   Existen DOS clases de expediente en este sistema y confundirlos es un error
   grave:
     - EXPEDIENTE DE MULTA: el que cierra el circuito sancionatorio. Es este.
     - EXPEDIENTE DE TRÁMITE: el que se abre cuando un titular PRESENTA una
       DDJJ o un contrato. Ese vive en Documentación, no acá.
   Uno acredita cumplimiento, el otro inicia una sanción. No comparten campo ni
   tipo de actuación, a propósito.

   >>> EL EXPEDIENTE NO ES UN ESTADO TERMINAL <<<
   Desde un local en Expediente, coordinación puede reingresarlo al circuito:
   eso genera una nueva primera notificación y reinicia la intimación desde
   cero. El botón está en las acciones de cada fila.

   DEBIDO PROCESO: ningún local debería llegar a expediente sin dos
   notificaciones con entrega efectiva. La columna "notificaciones" muestra
   cuántas entregas fehacientes tiene cada uno, justamente para poder detectar
   los casos que el error B-1 del sistema viejo dejó pasar (una cédula que
   constaba como no entregada avanzaba igual a expediente al vencer el plazo).
   ============================================================================ */

import { Link } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import Badge, { BadgeEstado } from '../components/ui/Badge';
import Aviso, { Vacio } from '../components/ui/Aviso';
import AccionesLocal from '../components/AccionesLocal';
import { useDatos } from '../datos/datosContexto';
import { correPlazo } from '../dominio/actuaciones';
import { fmtFecha } from '../dominio/fechas';
import { faltantesRegistrales } from '../dominio/reglas';

function Expediente() {
  const { actuaciones, localesConEstado, localPorId, actuacionesDeLocal, parametros } = useDatos();

  const paraGenerar = localesConEstado.filter((l) => l.estado === 'GENERAR_EXPEDIENTE');
  const iniciados = actuaciones
    .filter((a) => a.tipo === 'EXPEDIENTE')
    .map((a) => ({ ...a, local: localPorId(a.localId) }))
    .reverse();

  /* Cuántas entregas FEHACIENTES tiene el local. Es el control de debido
     proceso: dos entregas efectivas son la condición para el expediente. */
  const entregasFehacientes = (localId) =>
    actuacionesDeLocal(localId).filter((a) => a.tipo === 'NOTIFICACION' && correPlazo(a.resultado)).length;

  const sinDebidoProceso = paraGenerar.filter((l) => entregasFehacientes(l.id) < 2);
  const sinDatos = paraGenerar.filter((l) => faltantesRegistrales(l).length > 0);

  return (
    <>
      <PageHeader
        etiqueta="EXPEDIENTES"
        titulo="EXPEDIENTES DE MULTA"
        subtitulo={`${paraGenerar.length} para generar · ${iniciados.length} iniciados`}
        botonVolver
      />

      {/* ================= PARA GENERAR ================= */}
      <div className="accesos-header">
        <span>Expedientes para generar ({paraGenerar.length})</span>
      </div>

      {sinDebidoProceso.length > 0 && (
        <Aviso tipo="bloqueo" titulo={`${sinDebidoProceso.length} local(es) llegaron acá sin dos entregas fehacientes`}>
          {sinDebidoProceso.map((l) => l.nombreLocal).join(' · ')}. Revisalos antes de elevar: ningún local debería llegar a
          expediente sin que consten dos notificaciones con entrega efectiva. En el sistema viejo esto pasaba por el error B-1, que
          leía el resultado de entrega de la columna equivocada.
        </Aviso>
      )}

      {sinDatos.length > 0 && parametros.exigirDatosSiempre && (
        <Aviso tipo="alerta" titulo={`${sinDatos.length} local(es) sin datos registrales completos`}>
          Un expediente de multa contra un local sin CUIT ni razón social es tan impugnable como una notificación. Con el parámetro
          actual, el sistema no deja generarlo hasta completarlos.
        </Aviso>
      )}

      {paraGenerar.length === 0 ? (
        <Vacio titulo="No hay expedientes para generar">
          Un local llega acá cuando vence la segunda notificación sin presentación, o cuando vence una prórroga.
        </Vacio>
      ) : (
        <table className="tabla-datos tabla-bandeja">
          <thead>
            <tr>
              <th>Local</th>
              <th>CUIT</th>
              <th>Notificaciones fehacientes</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {paraGenerar.map((l) => {
              const fehacientes = entregasFehacientes(l.id);
              return (
                <tr key={l.id}>
                  <td>
                    <Link to={`/locales/${l.id}`} className="link-local">
                      {l.nombreLocal}
                    </Link>
                    <small className="celda-sub">{l.razonSocial || 'SIN RAZÓN SOCIAL'}</small>
                  </td>
                  <td>{l.cuit || <Badge color="rojo">Falta</Badge>}</td>
                  <td>
                    {fehacientes >= 2 ? (
                      <Badge color="verde">{fehacientes} entregas</Badge>
                    ) : (
                      <Badge color="rojo">{fehacientes} entrega(s)</Badge>
                    )}
                  </td>
                  <td>
                    <BadgeEstado codigo={l.estado} />
                  </td>
                  <td>
                    <AccionesLocal local={l} compacto />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* ================= INICIADOS ================= */}
      <div className="accesos-header">
        <span>Expedientes iniciados ({iniciados.length})</span>
      </div>

      {iniciados.length === 0 ? (
        <Vacio titulo="Todavía no se inició ningún expediente" />
      ) : (
        <table className="tabla-datos">
          <thead>
            <tr>
              <th>N° de expediente</th>
              <th>Local</th>
              <th>CUIT</th>
              <th>Fecha</th>
              <th>Registró</th>
              <th>Estado actual del local</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {iniciados.map((e) => (
              <tr key={e.id}>
                <td>
                  <strong>{e.numeroExpediente}</strong>
                </td>
                <td>
                  <Link to={`/locales/${e.localId}`} className="link-local">
                    {e.local?.nombreLocal ?? `Local ${e.localId}`}
                  </Link>
                </td>
                <td>{e.local?.cuit || '—'}</td>
                <td>{fmtFecha(e.fecha)}</td>
                <td>{e.usuario}</td>
                <td>
                  {/* Puede NO decir "Expediente": si el titular presentó
                      documentación después, el local ya salió del circuito y
                      el expediente quedó en el historial. */}
                  <BadgeEstado codigo={e.local?.estado} />
                </td>
                <td>{e.local && <AccionesLocal local={e.local} compacto />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Aviso tipo="info" titulo="Integración con expedientes municipales (pendiente, sección 8.3)">
        Hoy el número se genera fuera del sistema y se transcribe a mano. La integración debería permitir iniciar el expediente
        desde acá y recibir el número asignado. Conviene diseñarla de modo que la indisponibilidad de ese sistema no bloquee la
        operación: si la comunicación falla, se registra el número a mano y se reconcilia después. El formulario ya acepta las dos
        cosas.
      </Aviso>
    </>
  );
}

export default Expediente;
