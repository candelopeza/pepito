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
import Campo, { CampoSelect, CampoTexto } from '../components/ui/Campo';
import { useDatos } from '../datos/datosContexto';
import { useRol } from '../auth/rolContexto';
import { puedeEditar } from '../config/modulos';
import { correPlazo } from '../dominio/actuaciones';
import { diasEntre, fmtFecha, fmtFechaHora, hoyISO } from '../dominio/fechas';
import { faltantesRegistrales } from '../dominio/reglas';

/* Cómo se muestra cada estado del trámite de expediente (objeto 7 de la tabla
   `estado`). "Habilitado" no aparece acá: es la ausencia de trámite (el local
   en Generar expediente). */
const SITUACION_EXPEDIENTE = {
  24: { etiqueta: 'Generado', color: 'azul' },
  26: { etiqueta: 'En trámite', color: 'amarillo' },
  27: { etiqueta: 'Cerrado', color: 'gris' },
};

function Expediente() {
  const {
    actuaciones, localesConEstado, localPorId, actuacionesDeLocal, parametros, permisos,
    numeroDefinitivoExpediente, novedadesExpedientes, novedadExpediente,
  } = useDatos();
  const { rol } = useRol();
  const puedeCargarNumero = puedeEditar(rol, 'expedientes', permisos);
  // El NÚMERO (completar un provisorio o corregir uno cargado) es solo del
  // personal administrativo: es quien habla con la mesa de entradas.
  const puedeTocarNumero = ['administrativo', 'administrador'].includes(rol);
  // El expediente provisorio al que se le está cargando el número definitivo.
  const [definitivo, setDefinitivo] = useState(null);
  const [numero, setNumero] = useState('');
  const [motivoCorreccion, setMotivoCorreccion] = useState('');
  // El paso de ratificación: el número se muestra y se pide confirmarlo antes
  // de guardar. Asignarle a un comercio el expediente de otro es el error más
  // caro de esta pantalla.
  const [ratificando, setRatificando] = useState(false);

  const [novedadDe, setNovedadDe] = useState(null); // el expediente del modal de novedad
  const [novedad, setNovedad] = useState({ detalle: '', publica: false, nuevoEstado: '' });

  const paraGenerar = localesConEstado.filter((l) => l.estado === 'GENERAR_EXPEDIENTE');

  /* La bitácora agrupada por trámite, para la columna "última novedad". */
  const novedadesPorTramite = useMemo(() => {
    const porTramite = new Map();
    for (const n of novedadesExpedientes) {
      if (!porTramite.has(n.idTramite)) porTramite.set(n.idTramite, []);
      porTramite.get(n.idTramite).push(n);
    }
    return porTramite;
  }, [novedadesExpedientes]);

  const esCorreccion = Boolean(definitivo) && !String(definitivo.numeroExpediente ?? '').startsWith('PROV-');

  const expedientes = actuaciones
    .filter((a) => a.tipo === 'EXPEDIENTE')
    .map((a) => ({ ...a, local: localPorId(a.localId), novedades: novedadesPorTramite.get(a.id) ?? [] }));

  /* Los que una persona ya pidió y la dependencia todavía no respondió (estado
     25, SOLICITADO). Se separan de los habilitados A PROPÓSITO: habilitado lo
     decide el sistema al recalcular, solicitado lo decidió un agente. */
  const solicitados = expedientes.filter((a) => a.idEstado === 25);
  const iniciados = expedientes.filter((a) => a.idEstado !== 25).reverse();

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

  const columnasSolicitados = useMemo(
    () => [
      {
        field: 'local',
        headerName: 'Local',
        flex: 1,
        minWidth: 200,
        valueGetter: (_v, row) => row.local?.nombreLocal ?? `Local ${row.localId}`,
        renderCell: ({ row }) => (
          <span className="celda-apilada">
            <Link to={`/locales/${row.localId}`} className="link-local">
              {row.local?.nombreLocal ?? `Local ${row.localId}`}
            </Link>
            <small className="celda-sub">{row.local?.razonSocial || 'SIN RAZÓN SOCIAL'}</small>
          </span>
        ),
      },
      { field: 'fecha', headerName: 'Solicitado el', width: 130, renderCell: ({ row }) => fmtFecha(row.fecha) },
      {
        field: 'espera',
        headerName: 'Esperando hace',
        width: 150,
        /* Sin umbral ni color A PROPÓSITO: todavía no se sabe cuánto tarda de
           verdad la dependencia, así que inventar un límite sería un juicio
           sin fundamento. El dato pelado alcanza: quien lee "23 días" saca su
           conclusión. Cuando haya movimientos reales acumulados se va a poder
           calcular el promedio y recién ahí definir un umbral. */
        valueGetter: (_v, row) => diasEntre(String(row.fecha ?? '').slice(0, 10), hoyISO()),
        renderCell: ({ row }) => <span>{diasEntre(String(row.fecha ?? '').slice(0, 10), hoyISO())} día(s)</span>,
      },
      { field: 'usuario', headerName: 'Pidió', width: 140 },
      {
        field: 'motivo',
        headerName: 'Canal y observaciones',
        flex: 1,
        minWidth: 200,
        valueGetter: (_v, row) => row.motivo ?? '',
        renderCell: ({ row }) => <span className="texto-gris">{row.motivo ?? ''}</span>,
      },
      {
        field: 'acciones',
        headerName: 'Acciones',
        width: 260,
        sortable: false,
        filterable: false,
        // Cuando llega el número, "Registrar expediente de multa" completa
        // este mismo trámite: habilitado → solicitado → generado.
        renderCell: ({ row }) => row.local && <AccionesLocal local={row.local} compacto />,
      },
    ],
    [],
  );

  /* Los expedientes ya iniciados. Cada fila es una ACTUACIÓN de tipo
     EXPEDIENTE con su local adentro. */
  const columnasIniciados = useMemo(
    () => [
      {
        field: 'numeroExpediente',
        headerName: 'N° de expediente',
        width: 190,
        /* El número es "175079/2026": para que el orden sea año y después
           número (y no alfabético, donde 9999/2026 va después de 10000/2027),
           se ordena por una clave derivada. Los provisorios van al final. */
        valueGetter: (_v, row) => {
          const m = /^(\d+)\/(\d{4})$/.exec(String(row.numeroExpediente ?? ''));
          return m ? Number(m[2]) * 10_000_000_000 + Number(m[1]) : Number.MAX_SAFE_INTEGER;
        },
        renderCell: ({ row }) =>
          String(row.numeroExpediente ?? '').startsWith('PROV-') ? (
            <span className="celda-apilada">
              <strong>{row.numeroExpediente}</strong>
              {puedeTocarNumero ? (
                <button
                  type="button"
                  className="btn-tabla"
                  onClick={() => {
                    setNumero('');
                    setMotivoCorreccion('');
                    setRatificando(false);
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
            <span className="celda-apilada">
              <strong>{row.numeroExpediente}</strong>
              {/* El número guardado no se edita: se CORRIGE, con motivo que
                  queda en la bitácora. */}
              {puedeTocarNumero && (
                <button
                  type="button"
                  className="btn-tabla"
                  onClick={() => {
                    setNumero('');
                    setMotivoCorreccion('');
                    setRatificando(false);
                    setDefinitivo(row);
                  }}
                >
                  Corregir número
                </button>
              )}
            </span>
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
      {
        field: 'situacion',
        headerName: 'Situación',
        width: 120,
        valueGetter: (_v, row) => SITUACION_EXPEDIENTE[row.idEstado]?.etiqueta ?? 'Generado',
        renderCell: ({ row }) => {
          const sit = SITUACION_EXPEDIENTE[row.idEstado] ?? SITUACION_EXPEDIENTE[24];
          return <Badge color={sit.color}>{sit.etiqueta}</Badge>;
        },
      },
      {
        field: 'ultimaNovedad',
        headerName: 'Última novedad',
        flex: 1,
        minWidth: 220,
        valueGetter: (_v, row) => row.novedades[row.novedades.length - 1]?.detalle ?? '',
        renderCell: ({ row }) => {
          const ultima = row.novedades[row.novedades.length - 1];
          if (!ultima) return <span className="texto-gris">sin movimientos</span>;
          return (
            <span className="celda-apilada" title={ultima.detalle}>
              <span>{ultima.detalle}</span>
              <small className="celda-sub">{fmtFechaHora(ultima.momento)}</small>
            </span>
          );
        },
      },
      {
        field: 'novedad',
        headerName: 'Bitácora',
        width: 150,
        sortable: false,
        filterable: false,
        renderCell: ({ row }) =>
          puedeCargarNumero ? (
            <button
              type="button"
              className="btn-tabla"
              onClick={() => {
                setNovedad({ detalle: '', publica: false, nuevoEstado: '' });
                setNovedadDe(row);
              }}
            >
              Registrar novedad
            </button>
          ) : null,
      },
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
        subtitulo={`${paraGenerar.length} habilitados sin pedir · ${solicitados.length} esperando el número · ${iniciados.length} iniciados`}
        botonVolver
      />

      {/* ================= PARA GENERAR ================= */}
      <div className="accesos-header">
        <span>Expedientes para generar ({paraGenerar.length})</span>
      </div>

      {sinDebidoProceso.length > 0 && (
        <Aviso tipo="bloqueo" titulo={`${sinDebidoProceso.length} local(es) llegaron acá sin dos entregas fehacientes`}>
          {sinDebidoProceso.map((l) => l.nombreLocal).join(' · ')}. Revisalos antes de relevar: ningún local debería llegar a
          expediente sin que consten dos notificaciones con entrega efectiva. Coordinación puede usar «Volver a notificar» en
          las opciones de cada uno.
          {sinDebidoProceso.map((l) => l.nombreLocal).join(' · ')}.
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

      {/* ================= SOLICITADOS: esperando el número =================
          La diferencia con los de arriba es QUIÉN decidió: los habilitados los
          determina el sistema al recalcular; estos los pidió un agente y la
          dependencia todavía no respondió. La columna de espera es la que
          responde "cuáles llevan demasiado tiempo sin respuesta". */}
      <div className="accesos-header">
        <span>Número solicitado, esperando respuesta ({solicitados.length})</span>
      </div>
      {solicitados.length === 0 ? (
        <Vacio titulo="No hay solicitudes esperando">

        </Vacio>
      ) : (
        <Grilla
          filas={solicitados}
          columnas={columnasSolicitados}
          nombreArchivo="expedientes-solicitados"
          vacio="No hay solicitudes esperando respuesta."
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

      {novedadDe && (
        <Modal
          abierto
          etiqueta="BITÁCORA"
          titulo={`Novedad del expediente ${novedadDe.numeroExpediente ?? ''}`}
          onCerrar={() => setNovedadDe(null)}
        >
          <div className="formulario formulario-modal">
            <p className="texto-chico">
              Cada movimiento queda con fecha, autor y observación: es lo que convierte esta pantalla en una fuente confiable y no
              en un cuaderno de notas.
            </p>
            <CampoTexto
              id="nov-detalle"
              etiqueta="¿Qué pasó? (obligatorio)"
              valor={novedad.detalle}
              onChange={(v) => setNovedad((p) => ({ ...p, detalle: v }))}
            />
            <CampoSelect
              id="nov-estado"
              etiqueta="¿Cambia la situación del expediente?"
              valor={novedad.nuevoEstado}
              onChange={(v) => setNovedad((p) => ({ ...p, nuevoEstado: v }))}
              opciones={[
                { id: 'EN_TRAMITE', etiqueta: 'Pasa a «En trámite»' },
                { id: 'CERRADO', etiqueta: 'Pasa a «Cerrado» (concluyó)' },
              ]}
              vacio="No, es solo una novedad"
              ayuda="Los estados que maneja la otra dependencia están PENDIENTES de confirmar con la Dirección."
            />
            <label className="campo">
              <span>
                <input
                  type="checkbox"
                  checked={novedad.publica}
                  onChange={(e) => setNovedad((p) => ({ ...p, publica: e.target.checked }))}
                />{' '}
                El titular puede verla en el portal
              </span>
            </label>
            <p className="texto-chico texto-gris">
              Lo interno y lo publicable se separan acá, en el momento de cargar: el titular ve que tiene expediente y en qué estado
              está, nunca las observaciones internas de la oficina.
            </p>
            <div className="form-acciones">
              <button
                type="button"
                className="btn-primario"
                disabled={!novedad.detalle.trim()}
                onClick={async () => {
                  const r = await novedadExpediente(novedadDe.id, {
                    detalle: novedad.detalle.trim(),
                    publica: novedad.publica,
                    nuevoEstado: novedad.nuevoEstado || undefined,
                  });
                  if (r) setNovedadDe(null);
                }}
              >
                Registrar
              </button>
              <button type="button" className="btn-secundario" onClick={() => setNovedadDe(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {definitivo && (
        <Modal
          abierto
          etiqueta="EXPEDIENTE"
          titulo={esCorreccion ? 'Corregir el número' : 'Número definitivo'}
          onCerrar={() => setDefinitivo(null)}
        >
          <div className="formulario formulario-modal">
            <div className="bloque-info">
              <strong>{definitivo.local?.nombreLocal ?? `Local ${definitivo.localId}`}</strong>
              <span>
                {esCorreccion ? 'Número actual' : 'Provisorio'} {definitivo.numeroExpediente}
              </span>
            </div>

            {ratificando ? (
              /* >>> LA RATIFICACIÓN <<< El número se muestra tal como se va a
                 guardar. Asignarle a un comercio el expediente de otro es el
                 error más caro que puede cometerse acá. */
              <>
                <Aviso tipo="alerta" titulo="Revisá antes de guardar">
                  El expediente de <strong>{definitivo.local?.nombreLocal ?? `local ${definitivo.localId}`}</strong> queda con el
                  número <strong style={{ fontSize: '1.2rem' }}>{numero.trim()}</strong>
                  {esCorreccion ? ` (antes ${definitivo.numeroExpediente})` : ''}. ¿Es correcto?
                </Aviso>
                <div className="form-acciones">
                  <button
                    type="button"
                    className="btn-primario"
                    onClick={async () => {
                      if (await numeroDefinitivoExpediente(definitivo.id, numero.trim(), motivoCorreccion.trim())) {
                        setDefinitivo(null);
                      } else {
                        setRatificando(false);
                      }
                    }}
                  >
                    Sí, guardar {numero.trim()}
                  </button>
                  <button type="button" className="btn-secundario" onClick={() => setRatificando(false)}>
                    No, volver
                  </button>
                </div>
              </>
            ) : (
              <>
                <Campo
                  id="exp-definitivo"
                  etiqueta="N° de la mesa de entradas"
                  valor={numero}
                  onChange={setNumero}
                  ayuda={`Formato número/año, por ejemplo 175079/${new Date().getFullYear()}.`}
                />
                {esCorreccion && (
                  <CampoTexto
                    id="exp-motivo-correccion"
                    etiqueta="Motivo de la corrección (obligatorio)"
                    valor={motivoCorreccion}
                    onChange={setMotivoCorreccion}
                    ayuda="Queda asentado en la bitácora, junto con el número anterior."
                  />
                )}
                <div className="form-acciones">
                  <button
                    type="button"
                    className="btn-primario"
                    disabled={!numero.trim() || (esCorreccion && !motivoCorreccion.trim())}
                    onClick={() => setRatificando(true)}
                  >
                    Continuar
                  </button>
                  <button type="button" className="btn-secundario" onClick={() => setDefinitivo(null)}>
                    Cancelar
                  </button>
                </div>
              </>
            )}
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
