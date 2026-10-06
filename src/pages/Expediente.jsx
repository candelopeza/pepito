import { useCallback, useMemo, useState } from 'react';
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
import Grilla from '../components/ui/Grilla';
import Badge, { BadgeEstado } from '../components/ui/Badge';
import Aviso, { Vacio } from '../components/ui/Aviso';
import AccionesLocal from '../components/AccionesLocal';
import Modal from '../components/ui/Modal';
import Campo from '../components/ui/Campo';
import { useDatos } from '../datos/datosContexto';
import { useRol } from '../auth/rolContexto';
import { puedeEditar } from '../config/modulos';
import { correPlazo } from '../dominio/actuaciones';
import { fmtFecha } from '../dominio/fechas';
import { faltantesRegistrales } from '../dominio/reglas';

function Expediente() {
  const { actuaciones, localesConEstado, localPorId, actuacionesDeLocal, parametros, permisos, numeroDefinitivoExpediente } =
    useDatos();
  const { rol } = useRol();
  const puedeCargarNumero = puedeEditar(rol, 'expedientes', permisos);
  // El expediente provisorio al que se le está cargando el número definitivo.
  const [definitivo, setDefinitivo] = useState(null);
  const [numero, setNumero] = useState('');

  const paraGenerar = localesConEstado.filter((l) => l.estado === 'GENERAR_EXPEDIENTE');
  const iniciados = actuaciones
    .filter((a) => a.tipo === 'EXPEDIENTE')
    .map((a) => ({ ...a, local: localPorId(a.localId) }))
    .reverse();

  /* Cuántas entregas FEHACIENTES tiene el local. Es el control de debido
     proceso: dos entregas efectivas son la condición para el expediente. */
  const entregasFehacientes = useCallback(
    (localId) =>
      actuacionesDeLocal(localId).filter((a) => a.tipo === 'NOTIFICACION' && correPlazo(a.resultado)).length,
    [actuacionesDeLocal],
  );

  const sinDebidoProceso = paraGenerar.filter((l) => entregasFehacientes(l.id) < 2);
  const sinDatos = paraGenerar.filter((l) => faltantesRegistrales(l).length > 0);

  /* Locales que ya agotaron las dos notificaciones y esperan el expediente. */
  const columnasParaGenerar = useMemo(
    () => [
      {
        field: 'nombreLocal',
        headerName: 'Local',
        flex: 1.2,
        minWidth: 200,
        renderCell: ({ row }) => (
          <span className="celda-apilada">
            <Link to={`/locales/${row.id}`} className="link-local">
              {row.nombreLocal}
            </Link>
            <small className="celda-sub">{row.razonSocial || 'SIN RAZÓN SOCIAL'}</small>
          </span>
        ),
      },
      {
        field: 'cuit',
        headerName: 'CUIT',
        width: 150,
        renderCell: ({ row }) => row.cuit || <Badge color="rojo">Falta</Badge>,
      },
      {
        field: 'fehacientes',
        headerName: 'Notificaciones fehacientes',
        width: 230,
        valueGetter: (_v, row) => entregasFehacientes(row.id),
        renderCell: ({ row }) => {
          const cantidad = entregasFehacientes(row.id);
          return cantidad >= 2 ? (
            <Badge color="verde">{cantidad} entregas</Badge>
          ) : (
            <Badge color="rojo">{cantidad} entrega(s)</Badge>
          );
        },
      },
      {
        field: 'estado',
        headerName: 'Estado',
        width: 210,
        renderCell: ({ row }) => <BadgeEstado codigo={row.estado} sinColor />,
      },
      {
        field: 'acciones',
        headerName: 'Acciones',
        width: 260,
        sortable: false,
        filterable: false,
        renderCell: ({ row }) => <AccionesLocal local={row} compacto />,
      },
    ],
    [entregasFehacientes],
  );

  /* Los expedientes ya iniciados. Cada fila es una ACTUACIÓN de tipo
     EXPEDIENTE con su local adentro. */
  const columnasIniciados = useMemo(
    () => [
      {
        field: 'numeroExpediente',
        headerName: 'N° de expediente',
        width: 180,
        renderCell: ({ row }) =>
          String(row.numeroExpediente ?? '').startsWith('PROV-') ? (
            <span className="celda-apilada">
              <strong>{row.numeroExpediente}</strong>
              {puedeCargarNumero ? (
                <button
                  type="button"
                  className="btn-tabla"
                  onClick={() => {
                    setNumero('');
                    setDefinitivo(row);
                  }}
                >
                  Cargar número definitivo
                </button>
              ) : (
                <small className="celda-sub">provisorio</small>
              )}
            </span>
          ) : (
            <strong>{row.numeroExpediente}</strong>
          ),
      },
      {
        field: 'local',
        headerName: 'Local',
        flex: 1,
        minWidth: 180,
        valueGetter: (_v, row) => row.local?.nombreLocal ?? `Local ${row.localId}`,
        renderCell: ({ row }) => (
          <Link to={`/locales/${row.localId}`} className="link-local">
            {row.local?.nombreLocal ?? `Local ${row.localId}`}
          </Link>
        ),
      },
      { field: 'cuit', headerName: 'CUIT', width: 150, valueGetter: (_v, row) => row.local?.cuit || '—' },
      { field: 'fecha', headerName: 'Fecha', width: 120, renderCell: ({ row }) => fmtFecha(row.fecha) },
      { field: 'usuario', headerName: 'Registró', width: 150 },
      {
        field: 'estadoLocal',
        headerName: 'Estado actual del local',
        width: 210,
        valueGetter: (_v, row) => row.local?.estado ?? '',
        /* Puede NO decir "Expediente": si el titular presentó documentación
           después, el local ya salió del circuito y el expediente quedó en el
           historial. */
        renderCell: ({ row }) => <BadgeEstado codigo={row.local?.estado} sinColor />,
      },
      {
        field: 'acciones',
        headerName: 'Acciones',
        width: 260,
        sortable: false,
        filterable: false,
        renderCell: ({ row }) => row.local && <AccionesLocal local={row.local} compacto />,
      },
    ],
    [puedeCargarNumero],
  );
  const provisorios = iniciados.filter((a) => String(a.numeroExpediente ?? '').startsWith('PROV-'));

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
        <Grilla
          filas={paraGenerar}
          columnas={columnasParaGenerar}
          nombreArchivo="expedientes-para-generar"
          vacio="No hay locales para generar expediente."
          alto="auto"
        />
      )}

      {/* ================= INICIADOS ================= */}
      <div className="accesos-header">
        <span>Expedientes iniciados ({iniciados.length})</span>
      </div>

      {provisorios.length > 0 && (
        <Aviso
          tipo="alerta"
          titulo={`${provisorios.length} expediente(s) con número provisorio: falta el de la mesa de entradas`}
        />
      )}

      {definitivo && (
        <Modal abierto etiqueta="EXPEDIENTE" titulo="Número definitivo" onCerrar={() => setDefinitivo(null)}>
          <div className="formulario formulario-modal">
            <div className="bloque-info">
              <strong>{definitivo.local?.nombreLocal ?? `Local ${definitivo.localId}`}</strong>
              <span>Provisorio {definitivo.numeroExpediente}</span>
            </div>
            <Campo
              id="exp-definitivo"
              etiqueta="N° de la mesa de entradas"
              valor={numero}
              onChange={setNumero}
            />
            <div className="form-acciones">
              <button
                type="button"
                className="btn-primario"
                disabled={!numero.trim()}
                onClick={async () => {
                  if (await numeroDefinitivoExpediente(definitivo.id, numero.trim())) setDefinitivo(null);
                }}
              >
                Guardar
              </button>
              <button type="button" className="btn-secundario" onClick={() => setDefinitivo(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {iniciados.length === 0 ? (
        <Vacio titulo="Todavía no se inició ningún expediente" />
      ) : (
        <Grilla
          filas={iniciados}
          columnas={columnasIniciados}
          nombreArchivo="expedientes-iniciados"
          vacio="Todavía no se inició ningún expediente."
          alto="auto"
        />
      )}

    </>
  );
}

export default Expediente;
