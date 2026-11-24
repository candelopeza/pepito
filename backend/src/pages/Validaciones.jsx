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

   AL APROBAR, COORDINACIÓN COMPLETA EL TIPO Y EL EXPEDIENTE (28/10/2026): el
   titular ya no los carga en el portal (COORDINACION_COMPLETA_PRESENTACION,
   src/dominio/reglas.js). Sin expediente no se aprueba. Desde el 30/10/2026
   también el número del documento. Decide solo coordinación
   (ROLES_QUE_VALIDAN); administrativo ve la bandeja sin la columna de
   decisión.
   ============================================================================ */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Grilla from '../components/ui/Grilla';
import Badge, { BadgeEstado } from '../components/ui/Badge';
import Aviso, { Vacio } from '../components/ui/Aviso';
import Confirmar from '../components/ui/Confirmar';
import Campo, { CampoSelect, CampoTexto } from '../components/ui/Campo';
import ArchivoGuardado from '../components/ArchivoGuardado';
import ConstanciaArca from '../components/ConstanciaArca';
import { useDatos } from '../datos/datosContexto';
import { useRol } from '../auth/rolContexto';
import { ETIQUETA_DOCUMENTO, TIPOS_DOCUMENTO } from '../dominio/actuaciones';
import { CONSTANCIA_ARCA_SOLO_EN_FICHA, COORDINACION_COMPLETA_PRESENTACION, ROLES_QUE_VALIDAN } from '../dominio/reglas';
import { vencimientoDocumento, vencimientoMensual } from '../dominio/vigencias';
import { fmtFecha, hoyISO } from '../dominio/fechas';

function Validaciones() {
  const { presentacionesPendientes, localPorId, validarPresentacion, capacidades, parametros } = useDatos();
  const { rol } = useRol();
  const puedeDecidir = rol === 'administrador' || ROLES_QUE_VALIDAN.includes(rol);
  const [decision, setDecision] = useState(null);
  // El motivo del rechazo es obligatorio: el titular tiene que saber qué
  // corregir, y queda en el historial del local.
  const [motivo, setMotivo] = useState('');
  // Lo que completa coordinación al aprobar: { tipo, numero, expedienteTramite, fechaVencimiento }.
  const [completar, setCompletar] = useState({ tipo: '', numero: '', expedienteTramite: '', fechaVencimiento: '' });

  const pendientes = presentacionesPendientes();

  /* El vencimiento que va a quedar, con la misma cuenta que hace el servidor:
     el contrato del titular vale un mes desde hoy (dominio/vigencias.js); si
     el tipo no cambió queda el presentado; si cambió, se calcula con el tipo
     nuevo. */
  const p = decision?.p;
  const vencimientoPropuesto = !p
    ? ''
    : completar.tipo === 'CONTRATO'
      ? vencimientoMensual(hoyISO())
      : completar.tipo === p.tipo
        ? p.fechaVencimiento
        : vencimientoDocumento({ tipo: completar.tipo, fechaEmision: p.fechaEmision }, parametros?.modoBisiesto);
  const faltaParaAprobar = !completar.numero.trim() || !completar.expedienteTramite.trim();

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
              <small className="celda-sub">
                {local?.razonSocial}
                {local?.cuit ? ` · CUIT ${local.cuit}` : ''}
              </small>
              {local?.cuit && !CONSTANCIA_ARCA_SOLO_EN_FICHA && <ConstanciaArca cuit={local.cuit} />}
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
              {/* Lo del portal llega sin número: lo carga coordinación al aprobar. */}
              {row.numero ? `N° ${row.numero}` : 'Sin N°'}
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
        // Lo que llega del portal ya no lo trae: lo carga coordinación al aprobar.
        renderCell: ({ row }) =>
          row.expedienteTramite ||
          (COORDINACION_COMPLETA_PRESENTACION ? (
            <Badge color="amarillo">Se carga al aprobar</Badge>
          ) : (
            <Badge color="rojo">No registrado</Badge>
          )),
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
                setCompletar({
                  tipo: row.tipo,
                  numero: row.numero ?? '',
                  expedienteTramite: row.expedienteTramite ?? '',
                  fechaVencimiento: row.tipo === 'CONTRATO' ? (row.fechaVencimiento ?? '') : '',
                });
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
    ].filter((c) => puedeDecidir || c.field !== 'decision'),
    [localPorId, puedeDecidir],
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
        deshabilitado={Boolean(decision) && (decision.aprobar ? faltaParaAprobar : !motivo.trim())}
        onCancelar={() => setDecision(null)}
        onConfirmar={async () => {
          const datos = decision.aprobar
            ? {
                tipo: completar.tipo,
                numero: completar.numero.trim(),
                expedienteTramite: completar.expedienteTramite.trim(),
              }
            : {};
          // Se cierra solo si se guardó.
          if (await validarPresentacion(decision.p.id, decision.aprobar, motivo.trim(), datos)) setDecision(null);
        }}
      >
        {decision?.aprobar ? (
          <>
            <div className="form-grilla">
              <CampoSelect
                id="val-tipo"
                etiqueta="Tipo de documentación"
                valor={completar.tipo}
                onChange={(v) => setCompletar((c) => ({ ...c, tipo: v }))}
                opciones={TIPOS_DOCUMENTO.map((t) => ({ id: t, etiqueta: ETIQUETA_DOCUMENTO[t] }))}
                vacio={null}
              />
              <Campo
                id="val-numero"
                etiqueta="Número del documento"
                valor={completar.numero}
                onChange={(v) => setCompletar((c) => ({ ...c, numero: v }))}
                largoMaximo={50}
              />
              <Campo
                id="val-expediente"
                etiqueta="N° de expediente del trámite"
                valor={completar.expedienteTramite}
                onChange={(v) => setCompletar((c) => ({ ...c, expedienteTramite: v }))}
                largoMaximo={50}
              />
            </div>
            {completar.tipo === 'CONTRATO' && (
              <p className="texto-chico">
                El contrato presentado por el titular queda vigente <strong>un mes desde hoy</strong>. Después, cada informe mensual
                de 9 de Julio confirma si el local sigue con contrato. Al aprobarlo, el local pasa a la tabla de frecuencia de
                recolección de Herramientas → Informe 9 de Julio.
              </p>
            )}
            <p>
              La {ETIQUETA_DOCUMENTO[completar.tipo]}
              {completar.numero.trim() ? ` N° ${completar.numero.trim()}` : ''} pasa a contar como documentación vigente
              {vencimientoPropuesto ? ` hasta el ${fmtFecha(vencimientoPropuesto)}` : ''}.{' '}
              <strong>{decision.local?.nombreLocal}</strong> sale del circuito sancionatorio y su notificación en curso queda sin
              efecto.
            </p>
          </>
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
