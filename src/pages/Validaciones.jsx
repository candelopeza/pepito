/* ============================================================================
   pages/Validaciones.jsx  —  BANDEJA DE VALIDACIÓN  (URL: /#/validaciones)
   ----------------------------------------------------------------------------
   Sección 6.3 del pliego. Lo que el titular presentó por el portal y espera
   que un agente de la oficina lo apruebe.

   >>> LA REGLA QUE ESTA PANTALLA PROTEGE <<<
   "La documentación presentada por el titular NO cambia el estado del local
   hasta que un agente la aprueba: el sistema no debe permitir que una carga
   externa suspenda un plazo de forma automática."

   O sea: mientras un documento está acá, el plazo del local SIGUE CORRIENDO.
   Si un local está a dos días del expediente y el titular sube una DDJJ, el
   expediente se sigue acercando hasta que alguien la apruebe. Por eso la
   columna "plazo del local" muestra cuánto falta: son las validaciones que hay
   que mirar primero.

   El aprobar/rechazar está implementado en el store (validarPresentacion) y no
   acá: aprobar hace que el documento empiece a contar como vigente, y eso
   cambia el estado del local por la vía normal del motor de reglas.
   ============================================================================ */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Grilla from '../components/ui/Grilla';
import Badge, { BadgeEstado } from '../components/ui/Badge';
import Aviso, { Vacio } from '../components/ui/Aviso';
import Confirmar from '../components/ui/Confirmar';
import { CampoTexto } from '../components/ui/Campo';
import ArchivoGuardado from '../components/ArchivoGuardado';
import { useDatos } from '../datos/datosContexto';
import { ETIQUETA_DOCUMENTO } from '../dominio/actuaciones';
import { fmtFecha } from '../dominio/fechas';

function Validaciones() {
  const { presentacionesPendientes, localPorId, validarPresentacion, capacidades } = useDatos();
  const [decision, setDecision] = useState(null);
  // El motivo del rechazo es obligatorio: el titular tiene que saber qué
  // corregir, y queda en el historial del local.
  const [motivo, setMotivo] = useState('');

  const pendientes = presentacionesPendientes();

  /* Las columnas necesitan localPorId y setDecision, así que se arman adentro.
     Cada fila es una PRESENTACIÓN, no un local: por eso casi todas las columnas
     tienen que buscar el local al que pertenece. */
  const columnasPendientes = useMemo(
    () => [
      {
        field: 'local',
        headerName: 'Local',
        flex: 1.2,
        minWidth: 200,
        valueGetter: (_v, row) => localPorId(row.localId)?.nombreLocal ?? `Local ${row.localId}`,
        renderCell: ({ row }) => {
          const local = localPorId(row.localId);
          return (
            <span className="celda-apilada">
              <Link to={`/locales/${row.localId}`} className="link-local">
                {local?.nombreLocal ?? `Local ${row.localId}`}
              </Link>
              <small className="celda-sub">{local?.razonSocial}</small>
            </span>
          );
        },
      },
      {
        field: 'tipo',
        headerName: 'Documento',
        flex: 1,
        minWidth: 180,
        valueGetter: (_v, row) => ETIQUETA_DOCUMENTO[row.tipo] ?? row.tipo,
        renderCell: ({ row }) => (
          <span className="celda-apilada">
            {ETIQUETA_DOCUMENTO[row.tipo]}
            <small className="celda-sub">
              N° {row.numero}
              {typeof row.archivo === 'string' && row.archivo ? ` · ${row.archivo}` : ''}
              {!row.archivo ? ' · sin archivo' : ''}
            </small>
            {/* El documento que adjuntó el titular, para ver qué se aprueba. */}
            {row.archivo && typeof row.archivo === 'object' && <ArchivoGuardado archivo={row.archivo} etiqueta="Ver documento" />}
          </span>
        ),
      },
      {
        field: 'expedienteTramite',
        headerName: 'Expediente de trámite',
        width: 180,
        renderCell: ({ row }) => row.expedienteTramite ?? <Badge color="rojo">No registrado</Badge>,
      },
      {
        field: 'vigencia',
        headerName: 'Vigencia propuesta',
        width: 200,
        valueGetter: (_v, row) => row.fechaVencimiento ?? '',
        renderCell: ({ row }) => `${fmtFecha(row.fechaEmision)} → ${fmtFecha(row.fechaVencimiento)}`,
      },
      {
        field: 'estadoLocal',
        headerName: 'Estado del local',
        width: 210,
        valueGetter: (_v, row) => localPorId(row.localId)?.estado ?? '',
        renderCell: ({ row }) => <BadgeEstado codigo={localPorId(row.localId)?.estado} sinColor />,
      },
      {
        field: 'plazoLocal',
        headerName: 'Plazo del local',
        width: 140,
        valueGetter: (_v, row) => localPorId(row.localId)?.plazo?.vencimiento ?? '',
        renderCell: ({ row }) => {
          const local = localPorId(row.localId);
          return local?.plazo ? (
            <span className={local.plazo.vencido ? 'texto-vencido' : ''}>
              {local.plazo.vencido ? 'vencido' : `${local.diasRestantes} día(s)`}
            </span>
          ) : (
            <span className="texto-gris">—</span>
          );
        },
      },
      {
        field: 'decision',
        headerName: 'Decisión',
        width: 200,
        sortable: false,
        filterable: false,
        renderCell: ({ row }) => (
          <span className="celda-acciones">
            <button
              type="button"
              className="btn-tabla"
              onClick={() => {
                setMotivo('');
                setDecision({ p: row, local: localPorId(row.localId), aprobar: true });
              }}
            >
              Aprobar
            </button>
            <button
              type="button"
              className="btn-tabla"
              onClick={() => {
                setMotivo('');
                setDecision({ p: row, local: localPorId(row.localId), aprobar: false });
              }}
            >
              Rechazar
            </button>
          </span>
        ),
      },
    ],
    [localPorId],
  );

  return (
    <>
      <div className="accesos-header">
        <span>Esperan validación ({pendientes.length})</span>
      </div>

      {pendientes.length === 0 ? (
        <Vacio titulo="No hay nada para validar" />
      ) : (
        <>
          <Aviso tipo="alerta" titulo="Mientras están acá, los plazos siguen corriendo" />

          <Grilla
            filas={pendientes}
            columnas={columnasPendientes}
            nombreArchivo="presentaciones-pendientes"
            vacio="No hay presentaciones esperando validación."
            alto="auto"
          />
        </>
      )}

      <Confirmar
        abierto={Boolean(decision)}
        titulo={decision?.aprobar ? 'Aprobar la presentación' : 'Rechazar la presentación'}
        textoConfirmar={decision?.aprobar ? 'Aprobar' : 'Rechazar'}
        peligro={!decision?.aprobar}
        deshabilitado={Boolean(decision) && !decision.aprobar && !motivo.trim()}
        onCancelar={() => setDecision(null)}
        onConfirmar={async () => {
          // Se cierra solo si se guardó.
          if (await validarPresentacion(decision.p.id, decision.aprobar, motivo.trim())) setDecision(null);
        }}
      >
        {decision?.aprobar ? (
          <p>
            La {ETIQUETA_DOCUMENTO[decision.p.tipo]} N° {decision.p.numero} pasa a contar como documentación vigente hasta el{' '}
            {fmtFecha(decision.p.fechaVencimiento)}. <strong>{decision.local?.nombreLocal}</strong> sale del circuito sancionatorio
            y su notificación en curso queda sin efecto.
          </p>
        ) : (
          <>
            <p>
              Se descarta la presentación. El local sigue en <strong>{decision?.local?.estadoEtiqueta}</strong> y su plazo sigue
              corriendo.
              {capacidades?.auditoria
                ? ' El titular va a ver este motivo en su portal.'
                : ' Avisale al titular por qué se rechazó: desde el portal solo va a ver que ya no está.'}
            </p>
            <CampoTexto
              id="val-motivo"
              etiqueta="Motivo del rechazo (obligatorio)"
              valor={motivo}
              onChange={setMotivo}
            />
          </>
        )}
      </Confirmar>
    </>
  );
}

export default Validaciones;
