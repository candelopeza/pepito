/* ============================================================================
   pages/Documentacion.jsx  —  DOCUMENTACIÓN  (URL: /#/documentacion)
   ----------------------------------------------------------------------------
   Listado de todo lo presentado (DDJJ, DDJJ de reciclaje y contratos) y el
   alta guiada en tres pasos.

   >>> POR QUÉ EL ALTA ES GUIADA Y NO UN FORMULARIO SUELTO <<<
   Porque registrar documentación no es cargar un dato: es un acto que SACA a
   un local del circuito sancionatorio. Antes de dejar registrar hay que
   mostrar en qué situación está el local, y para eso hace falta consultarla.
   El paso 2 existe para eso: muestra el estado calculado, el plazo en curso y
   qué documentación ya tiene, para que nadie registre una DDJJ sobre un local
   que ya tiene una vigente sin darse cuenta.

   Ese paso 2 antes tenía datos de prueba escritos a mano (tres locales
   inventados con situaciones fijas). Ahora sale del padrón real y del motor de
   estados: lo que muestra es lo que efectivamente va a pasar.

   LA COLUMNA "EXPEDIENTE DE TRÁMITE" es el dato que el sistema viejo no
   guardaba (sección 4.5): sin él no se puede reconstruir el trámite que
   respalda una acreditación. NO es el expediente de multa.
   ============================================================================ */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Step, StepLabel, Stepper } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PageHeader from '../components/ui/PageHeader';
import Grilla from '../components/ui/Grilla';
import Modal from '../components/ui/Modal';
import Badge, { BadgeEstado } from '../components/ui/Badge';
import Aviso from '../components/ui/Aviso';
import BuscadorLocal from '../components/BuscadorLocal';
import FormDocumento from '../components/FormDocumento';
import HistorialActuaciones from '../components/HistorialActuaciones';
import { useRol } from '../auth/rolContexto';
import Validaciones from './Validaciones';
import { useDatos } from '../datos/datosContexto';
import { puedeEditar } from '../config/modulos';
import { ETIQUETA_DOCUMENTO, TIPOS_DOCUMENTO } from '../dominio/actuaciones';
import { estaVigente } from '../dominio/vigencias';
import { fmtFecha } from '../dominio/fechas';

const PASOS = ['Seleccionar local', 'Situación del proceso', 'Documento'];

function Documentacion() {
  const { rol } = useRol();
  const { actuaciones, localesConEstado, localPorId, actuacionesDeLocal, usuarios, registrarDocumento, permisos } = useDatos();
  const puedeCargar = puedeEditar(rol, 'documentacion', permisos);
  // Validar es decidir: lo hacen administrativo y coordinación. El resto ve
  // la tabla de documentación sin la bandeja.
  const puedeValidar = ['administrativo', 'coordinacion', 'administrador'].includes(rol);

  const [modal, setModal] = useState(false);
  const [paso, setPaso] = useState(0);
  const [localId, setLocalId] = useState('');

  const localElegido = localId ? localPorId(localId) : null;
  const localesSinExentos = useMemo(
    () => localesConEstado.filter((l) => l.estado !== 'EXENTO_CONFIRMADO'),
    [localesConEstado],
  );

  function cerrar() {
    setModal(false);
    setPaso(0);
    setLocalId('');
  }

  /* Las filas: las actuaciones documentales de todos los locales, con el
     nombre del local resuelto para poder buscar y ordenar por él. */
  const documentos = useMemo(
    () =>
      actuaciones
        .filter((a) => TIPOS_DOCUMENTO.includes(a.tipo))
        .map((a) => {
          const local = localesConEstado.find((l) => l.id === a.localId);
          return {
            ...a,
            /* Muchos locales de la migración no tienen nombre comercial
               cargado (solo razón social): sin este respaldo, la columna
               quedaba en blanco y parecía que el documento no tenía local. */
            nombreLocal: local?.nombreLocal || local?.razonSocial || `Local N° ${a.localId}`,
            razonSocialLocal: local?.razonSocial ?? '',
            estadoLocal: local?.estado ?? null,
            vigente: a.validado !== false && estaVigente(a.fechaVencimiento),
          };
        }),
    [actuaciones, localesConEstado],
  );

  const columnas = useMemo(
    () => [
      {
        field: 'nombreLocal',
        headerName: 'Local',
        flex: 1,
        minWidth: 180,
        renderCell: ({ row }) => (
          <span className="celda-apilada">
            <Link to={`/locales/${row.localId}`} className="link-local">
              {row.nombreLocal}
            </Link>
            {row.razonSocialLocal && row.razonSocialLocal !== row.nombreLocal && (
              <small className="celda-sub">{row.razonSocialLocal}</small>
            )}
          </span>
        ),
      },
      {
        field: 'tipo',
        headerName: 'Tipo',
        width: 175,
        valueFormatter: (value) => ETIQUETA_DOCUMENTO[value] ?? value,
      },
      { field: 'numero', headerName: 'Número', width: 135 },
      {
        field: 'expedienteTramite',
        headerName: 'Expediente de trámite',
        width: 180,
        renderCell: ({ row }) =>
          row.expedienteTramite ? (
            row.expedienteTramite
          ) : row.origen === 'INFORME_9DJ' ? (
            <span className="texto-gris" title="Los contratos informados por la prestataria no tienen expediente de presentación">
              no aplica
            </span>
          ) : (
            <Badge color="rojo">No registrado</Badge>
          ),
      },
      { field: 'fechaEmision', headerName: 'Emisión', width: 115, valueFormatter: (value) => fmtFecha(value) },
      {
        field: 'fechaVencimiento',
        headerName: 'Vencimiento',
        width: 160,
        // El CSV exporta lo que diga el formatter; sin él salía la fecha cruda.
        valueFormatter: (value) => (value ? fmtFecha(value) : ''),
        renderCell: ({ row }) => {
          if (row.fechaVencimiento) return fmtFecha(row.fechaVencimiento);
          // Un contrato del informe 9DJ no vence por fecha: vale mientras el
          // último informe de la prestataria lo sostenga (modelo de foto).
          if (row.origen === 'INFORME_9DJ') {
            return (
              <span className="texto-gris" title="Vale mientras el último informe de la prestataria lo sostenga; no se rige por fecha.">
                lo sostiene el informe
              </span>
            );
          }
          return <span className="texto-gris">—</span>;
        },
      },
      {
        field: 'vigencia',
        headerName: 'Vigencia',
        width: 190,
        valueGetter: (_v, row) => (row.validado === false ? 'pendiente' : row.vigente ? 'vigente' : 'vencida'),
        renderCell: ({ row }) =>
          row.validado === false ? (
            <Badge color="amarillo">Pendiente de validación</Badge>
          ) : row.vigente ? (
            <Badge color="verde">Vigente</Badge>
          ) : (
            <Badge color="gris">Vencida</Badge>
          ),
      },
      {
        field: 'origen',
        headerName: 'Origen',
        width: 175,
        renderCell: ({ value }) =>
          value === 'INFORME_9DJ' ? <Badge color="azul">Informe 9 de Julio</Badge> : <span>Presentado por el titular</span>,
      },
      { field: 'usuario', headerName: 'Cargado por', width: 150 },
      {
        field: 'estadoLocal',
        headerName: 'Estado del local',
        width: 215,
        renderCell: ({ value }) => <BadgeEstado codigo={value} sinColor />,
      },
    ],
    [],
  );

  /* LA BÚSQUEDA ES LA DE LA GRILLA. Esta pantalla tenía su propio buscador
     encima de la tabla, que hacía lo mismo que el buscador rápido del Data
     Grid. Con los dos puestos, el resultado salía de combinarlos y no había
     forma de entender por qué faltaba una fila. */
  const filas = documentos;

  const sinExpediente = documentos.filter((d) => !d.expedienteTramite && d.origen !== 'INFORME_9DJ').length;

  return (
    <>
      <PageHeader
        etiqueta="DOCUMENTACIÓN"
        titulo="DDJJ, RECICLAJE Y CONTRATOS"
        subtitulo={`${documentos.length} documento(s) registrados · ${documentos.filter((d) => d.vigente).length} vigentes`}
        botonVolver
      />

      {/* La bandeja de validación vive acá: es la misma materia que la tabla
          de abajo, antes separada en su propia pestaña. */}
      {puedeValidar && <Validaciones />}

      {sinExpediente > 0 && (
        <Aviso tipo="alerta" titulo={`${sinExpediente} documentos sin número de expediente de trámite`}>
        </Aviso>
      )}

      <Grilla
        filas={filas}
        columnas={columnas}
        nombreArchivo="documentacion"
        vacio="Todavía no hay documentación registrada."
        ordenInicial={[{ field: 'fechaEmision', sort: 'desc' }]}
        botones={
          puedeCargar && (
            <button
              type="button"
              className="btn-icono btn-icono-azul"
              title="Registrar documentación"
              onClick={() => setModal(true)}
            >
              <AddIcon fontSize="small" />
            </button>
          )
        }
      />

      {/* ================= ALTA GUIADA ================= */}
      {modal && (
        <Modal abierto etiqueta="DOCUMENTACIÓN" titulo="Registrar documentación" ancho="ancho" onCerrar={cerrar}>
          <Stepper activeStep={paso} alternativeLabel className="documentacion-stepper">
            {PASOS.map((p) => (
              <Step key={p}>
                <StepLabel>{p}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {/* ---------- PASO 1: elegir el local ---------- */}
          {paso === 0 && (
            <div className="paso-documentacion">
              <div className="paso-encabezado">
                <h3>Seleccionar establecimiento</h3>
                <p>Elegí el local para ver su situación actual antes de registrar nada.</p>
              </div>

              {/* Antes era un desplegable con los 2.200 locales. Ahora se busca
                  escribiendo parte del nombre, la dirección o el CUIT. */}
              <BuscadorLocal
                locales={localesSinExentos}
                valor={localId}
                onElegir={setLocalId}
                etiqueta="Local"
                ayuda="Escribí el nombre, la dirección o el CUIT. Los exentos confirmados no aparecen: no presentan documentación."
              />

              <div className="form-acciones">
                <button type="button" className="btn-primario" disabled={!localId} onClick={() => setPaso(1)}>
                  Continuar
                </button>
                <button type="button" className="btn-secundario" onClick={cerrar}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* ---------- PASO 2: la situación real del local ---------- */}
          {paso === 1 && localElegido && (
            <div className="paso-documentacion">
              <div className="paso-encabezado">
                <h3>Situación del proceso</h3>
                <p>El sistema resolvió la etapa actual a partir del historial de actuaciones del local.</p>
              </div>

              <div className="local-seleccionado">
                <span className="local-seleccionado-label">LOCAL</span>
                <strong>{localElegido.nombreLocal}</strong>
                <span>
                  {localElegido.razonSocial || 'Sin razón social'} · {localElegido.direccion}
                </span>
              </div>

              <div className="ficha-situacion">
                <div className="ficha-estado">
                  <BadgeEstado codigo={localElegido.estado} />
                </div>
                {localElegido.plazo && (
                  <div className={`ficha-plazo ${localElegido.plazo.vencido ? 'ficha-plazo-vencido' : ''}`}>
                    <strong>Plazo en curso</strong>
                    <span>
                      Vence el {fmtFecha(localElegido.plazo.vencimiento)} ·{' '}
                      {localElegido.plazo.vencido ? 'VENCIDO' : `faltan ${localElegido.diasRestantes} día(s)`}
                    </span>
                  </div>
                )}
              </div>

              {/* Si ya tiene algo vigente, avisarlo: registrar otra cosa no
                  está prohibido, pero casi siempre es un error de carga. */}
              {localElegido.estadoGrupo === 'documental' ? (
                <Aviso tipo="alerta" titulo="Este local ya tiene documentación vigente">
                  Está fuera del circuito sancionatorio. Registrar otro documento es válido (por ejemplo un contrato que reemplaza
                  una DDJJ), pero revisá que no sea una carga repetida.
                </Aviso>
              ) : (
                <Aviso tipo="ok" titulo="Corresponde registrar documentación">
                  Al registrarla, el local sale del circuito sancionatorio por el plazo de vigencia del documento.
                </Aviso>
              )}

              <div className="accesos-header">
                <span>Últimas actuaciones</span>
              </div>
              <HistorialActuaciones actuaciones={actuacionesDeLocal(localElegido.id).slice(-4)} usuarios={usuarios} />

              <div className="form-acciones">
                <button type="button" className="btn-primario" onClick={() => setPaso(2)}>
                  Registrar documento
                </button>
                <button type="button" className="btn-secundario" onClick={() => setPaso(0)}>
                  Volver
                </button>
              </div>
            </div>
          )}

          {/* ---------- PASO 3: el documento ---------- */}
          {paso === 2 && localElegido && (
            <FormDocumento
              local={localElegido}
              onGuardar={async (d) => {
                // Se cierra solo si se registró: si falla, queda lo escrito.
                if (await registrarDocumento(localElegido.id, d)) cerrar();
              }}
              onCancelar={() => setPaso(1)}
            />
          )}
        </Modal>
      )}
    </>
  );
}

export default Documentacion;
