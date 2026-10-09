/* ============================================================================
   pages/herramientas/Informe9DJ.jsx  —  (URL: /#/herramientas/informe-9dj)
   ----------------------------------------------------------------------------
   Sección 9.3 del pliego, MODELO DE FOTO. El informe que manda la prestataria
   9 de Julio es una foto de su padrón de contratos: la primera carga produjo
   las altas históricas; cada carga siguiente dice quién sigue, quién se suma
   y quién ya no está.

   >>> EL SISTEMA PROPONE, UNA PERSONA CONFIRMA <<<
   El sistema viejo procesaba el listado solo (correo, OCR, cruce automático) y
   CREABA LOCALES y CAMBIABA ESTADOS sin intervención humana. Un cruce
   equivocado altera el estado legal de un local y nadie se entera. Acá el
   recorrido es: subir el archivo → el sistema lo lee y lo cruza → el agente
   decide FILA POR FILA (cada decisión se guarda en el momento: cerrar la
   pantalla no pierde nada) → confirma la lista de bajas → aplica.

   LAS TRES ZONAS DE LA REVISIÓN
     1. Los que cruzaron con el padrón: confirmar o rechazar.
     2. Los que no se encontraron: dar de alta, vincular a mano o dejar
        pendiente. El CUIT que no cierra su dígito verificador llega marcado.
     3. Las bajas que propone la foto: los que tienen contrato y no figuran.
        NINGUNA baja sale sin que el agente la tilde con nombre y dirección a
        la vista.

   La carga aplicada se puede ANULAR desde el historial, con motivo y usuario:
   es la única puerta para deshacerla, porque los contratos de origen
   INFORME_9DJ no se editan desde la ficha del local (sección 4.6).
   ============================================================================ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Grilla from '../../components/ui/Grilla';
import Badge from '../../components/ui/Badge';
import Aviso, { Vacio } from '../../components/ui/Aviso';
import Modal from '../../components/ui/Modal';
import Confirmar from '../../components/ui/Confirmar';
import { api } from '../../datos/api';
import { useDatos } from '../../datos/datosContexto';
import { fmtFecha } from '../../dominio/fechas';

/* Cómo se muestra cada decisión. El color repite el lenguaje del resto del
   sistema: verde confirma, rojo rechaza, gris espera. */
const DECISION = {
  SIN_REVISAR: { etiqueta: 'Sin revisar', color: 'gris' },
  CONFIRMADA: { etiqueta: 'Confirmada', color: 'verde' },
  RECHAZADA: { etiqueta: 'Rechazada', color: 'rojo' },
  VINCULADA: { etiqueta: 'Vinculada', color: 'verde' },
  ALTA: { etiqueta: 'Alta nueva', color: 'azul' },
  PENDIENTE: { etiqueta: 'Pendiente', color: 'amarillo' },
};

const ESTADO_CARGA = {
  EN_REVISION: { etiqueta: 'En revisión', color: 'amarillo' },
  APLICADO: { etiqueta: 'Aplicado', color: 'verde' },
  DESCARTADO: { etiqueta: 'Descartado', color: 'gris' },
  ANULADO: { etiqueta: 'Anulado', color: 'rojo' },
};

/* El archivo del input a base64, leyéndolo como data URL: es binario-seguro
   (una planilla .xlsx o un PDF no sobreviven a pasar por texto). */
function archivoABase64(archivo) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result).split(',')[1] ?? '');
    lector.onerror = () => rechazar(new Error('No se pudo leer el archivo.'));
    lector.readAsDataURL(archivo);
  });
}

function Informe9DJ() {
  const { localesConEstado, recargar } = useDatos();

  const [historial, setHistorial] = useState(null);
  const [carga, setCarga] = useState(null); // el detalle de la carga EN_REVISION
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);
  const [resultado, setResultado] = useState(null);

  const [periodo, setPeriodo] = useState('');
  const [bajasElegidas, setBajasElegidas] = useState(() => new Set());
  const [confirmoIncompleto, setConfirmoIncompleto] = useState(false);
  const [confirmarAplicar, setConfirmarAplicar] = useState(false);
  const [confirmarDescartar, setConfirmarDescartar] = useState(false);
  const [vinculando, setVinculando] = useState(null); // la fila del modal de vínculo
  const [numeroVinculo, setNumeroVinculo] = useState('');
  const [anulando, setAnulando] = useState(null); // la carga del modal de anulación
  const [motivoAnulacion, setMotivoAnulacion] = useState('');

  const porId = useMemo(() => new Map(localesConEstado.map((l) => [l.id, l])), [localesConEstado]);

  /* Al entrar: el historial, y si quedó una revisión abierta se retoma donde
     estaba (criterio 7: cerrar y volver a abrir conserva lo decidido). */
  const cargarTodo = useCallback(async () => {
    try {
      const cargas = await api.informe9djCargas();
      setHistorial(cargas);
      const abierta = cargas.find((c) => c.estado === 'EN_REVISION');
      setCarga(abierta ? await api.informe9djCarga(abierta.id) : null);
      setBajasElegidas(new Set());
      setConfirmoIncompleto(false);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

  /* ---------- subir el archivo ---------- */
  const subir = useCallback(
    async (archivo) => {
      if (!archivo) return;
      setOcupado(true);
      setError(null);
      setResultado(null);
      try {
        const detalle = await api.informe9djSubir({
          nombreArchivo: archivo.name,
          contenidoBase64: await archivoABase64(archivo),
          periodo: periodo || undefined,
        });
        setCarga(detalle);
        setHistorial(await api.informe9djCargas());
      } catch (e) {
        setError(e.message);
      } finally {
        setOcupado(false);
      }
    },
    [periodo],
  );

  /* ---------- decidir una fila ----------
     Cada decisión viaja al momento: es el guardado de avance. La fila se
     actualiza en memoria para no recargar 250 filas por cada clic. */
  const decidir = useCallback(
    async (fila, decision, idLocal) => {
      setError(null);
      try {
        const r = await api.informe9djDecidir(carga.id, fila.id, decision, idLocal);
        setCarga((previa) => ({
          ...previa,
          filas: previa.filas.map((f) => (f.id === fila.id ? { ...f, decision: r.decision, idLocal: r.idLocal } : f)),
        }));
      } catch (e) {
        setError(e.message);
      }
    },
    [carga?.id],
  );

  const vincular = useCallback(
    async (fila, idLocal) => {
      await decidir(fila, 'VINCULADA', idLocal);
      setVinculando(null);
      setNumeroVinculo('');
      // El vínculo cambia qué locales sostiene la foto: las bajas propuestas
      // pueden haber cambiado, así que se repide el detalle.
      setCarga(await api.informe9djCarga(carga.id));
    },
    [decidir, carga?.id],
  );

  /* ---------- aplicar / descartar / anular ---------- */
  const aplicar = useCallback(async () => {
    setConfirmarAplicar(false);
    setOcupado(true);
    setError(null);
    try {
      const r = await api.informe9djAplicar(carga.id, {
        bajas: [...bajasElegidas],
        confirmarIncompleto: confirmoIncompleto,
      });
      setResultado(r.resumen);
      await recargar(); // el padrón cambió: estados, locales nuevos
      await cargarTodo();
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  }, [carga?.id, bajasElegidas, confirmoIncompleto, recargar, cargarTodo]);

  const descartar = useCallback(async () => {
    setConfirmarDescartar(false);
    setOcupado(true);
    setError(null);
    try {
      await api.informe9djDescartar(carga.id);
      await cargarTodo();
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  }, [carga?.id, cargarTodo]);

  const anular = useCallback(async () => {
    setOcupado(true);
    setError(null);
    try {
      await api.informe9djAnular(anulando.id, motivoAnulacion);
      setAnulando(null);
      setMotivoAnulacion('');
      await recargar();
      await cargarTodo();
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  }, [anulando, motivoAnulacion, recargar, cargarTodo]);

  /* ---------- las columnas ---------- */

  const botonesDecision = useCallback(
    (fila) => {
      const boton = (decision, texto, clase = 'btn-secundario') =>
        fila.decision === decision ? null : (
          <button key={decision} type="button" className={`${clase} btn-chico`} onClick={() => decidir(fila, decision)}>
            {texto}
          </button>
        );

      if (fila.cruce === 'ENCONTRADO') {
        return (
          <span className="acciones-fila">
            {boton('CONFIRMADA', 'Confirmar', 'btn-primario')}
            {boton('RECHAZADA', 'Rechazar')}
            {boton('PENDIENTE', 'Pendiente')}
          </span>
        );
      }
      return (
        <span className="acciones-fila">
          {boton('ALTA', 'Dar de alta', 'btn-primario')}
          {fila.decision !== 'VINCULADA' && (
            <button type="button" className="btn-secundario btn-chico" onClick={() => setVinculando(fila)}>
              Vincular…
            </button>
          )}
          {boton('PENDIENTE', 'Pendiente')}
        </span>
      );
    },
    [decidir],
  );

  const columnasFilas = useMemo(
    () => [
      { field: 'numeroDeFila', headerName: 'Fila', width: 70 },
      {
        field: 'cuit',
        headerName: 'CUIT',
        width: 150,
        renderCell: ({ row }) =>
          row.cuitValido ? (
            row.cuit
          ) : (
            <span title={row.motivoCuit ?? ''}>
              <Badge color="rojo">{row.cuit || 'sin CUIT'} ⚠</Badge>
            </span>
          ),
      },
      { field: 'razonSocial', headerName: 'Razón social', flex: 1, minWidth: 180 },
      { field: 'direccion', headerName: 'Dirección', flex: 1, minWidth: 170 },
      { field: 'numeroContrato', headerName: 'Contrato', width: 110 },
      {
        field: 'vencimiento',
        headerName: 'Vencimiento',
        width: 110,
        renderCell: ({ row }) => (row.vencimiento ? fmtFecha(row.vencimiento) : <span className="texto-gris">—</span>),
      },
      {
        field: 'idLocal',
        headerName: 'Local del padrón',
        width: 190,
        renderCell: ({ row }) => {
          if (row.idLocal) {
            const local = porId.get(row.idLocal);
            return (
              <Link to={`/locales/${row.idLocal}`} className="link-local">
                {local?.nombreLocal ?? `N° ${row.idLocal}`}
              </Link>
            );
          }
          if (row.candidatos.length) {
            return <Badge color="naranja">{row.candidatos.length} sucursales posibles</Badge>;
          }
          return <span className="texto-gris">no está en el padrón</span>;
        },
      },
      {
        field: 'decision',
        headerName: 'Decisión',
        width: 120,
        renderCell: ({ row }) => {
          const d = DECISION[row.decision] ?? DECISION.SIN_REVISAR;
          return <Badge color={d.color}>{d.etiqueta}</Badge>;
        },
      },
      {
        field: 'acciones',
        headerName: 'Revisar',
        width: 250,
        sortable: false,
        filterable: false,
        renderCell: ({ row }) => botonesDecision(row),
      },
      {
        field: 'crudo',
        headerName: 'Como vino en el archivo',
        flex: 1.2,
        minWidth: 200,
        renderCell: ({ row }) => (
          <span className="texto-gris" title={row.crudo}>
            {row.crudo}
          </span>
        ),
      },
    ],
    [porId, botonesDecision],
  );

  const columnasBajas = useMemo(
    () => [
      {
        field: 'baja',
        headerName: 'Dar de baja',
        width: 100,
        sortable: false,
        filterable: false,
        renderCell: ({ row }) => (
          <input
            type="checkbox"
            checked={bajasElegidas.has(row.id)}
            onChange={() =>
              setBajasElegidas((previas) => {
                const siguientes = new Set(previas);
                if (siguientes.has(row.id)) siguientes.delete(row.id);
                else siguientes.add(row.id);
                return siguientes;
              })
            }
            aria-label={`Confirmar la baja del contrato de ${row.nombreLocal}`}
          />
        ),
      },
      {
        field: 'nombreLocal',
        headerName: 'Local',
        flex: 1,
        minWidth: 200,
        renderCell: ({ row }) => (
          <Link to={`/locales/${row.id}`} className="link-local">
            {row.nombreLocal}
          </Link>
        ),
      },
      { field: 'direccion', headerName: 'Dirección', flex: 1, minWidth: 180 },
      { field: 'cuit', headerName: 'CUIT', width: 140 },
      { field: 'numeroContrato', headerName: 'Contrato', width: 110 },
      {
        field: 'vencimiento',
        headerName: 'Vencimiento informado',
        width: 160,
        renderCell: ({ row }) => (row.vencimiento ? fmtFecha(row.vencimiento) : <span className="texto-gris">sin fecha</span>),
      },
    ],
    [bajasElegidas],
  );

  const columnasHistorial = useMemo(
    () => [
      { field: 'id', headerName: 'N°', width: 70 },
      { field: 'nombreArchivo', headerName: 'Archivo', flex: 1, minWidth: 180 },
      { field: 'periodo', headerName: 'Período', width: 130 },
      { field: 'filas', headerName: 'Filas', width: 80 },
      {
        field: 'estado',
        headerName: 'Estado',
        width: 120,
        renderCell: ({ row }) => {
          const e = ESTADO_CARGA[row.estado] ?? ESTADO_CARGA.EN_REVISION;
          return <Badge color={e.color}>{e.etiqueta}</Badge>;
        },
      },
      { field: 'usuarioCarga', headerName: 'Cargó', width: 150 },
      {
        field: 'fechaCarga',
        headerName: 'Fecha',
        width: 110,
        renderCell: ({ row }) => fmtFecha(String(row.fechaCarga ?? '').slice(0, 10)),
      },
      {
        field: 'motivoAnulacion',
        headerName: 'Motivo de anulación',
        flex: 1,
        minWidth: 160,
        renderCell: ({ row }) => row.motivoAnulacion ?? '',
      },
      {
        field: 'anular',
        headerName: 'Acciones',
        width: 110,
        sortable: false,
        filterable: false,
        renderCell: ({ row }) =>
          row.estado === 'APLICADO' ? (
            <button type="button" className="btn-peligro btn-chico" onClick={() => setAnulando(row)}>
              Anular…
            </button>
          ) : null,
      },
    ],
    [],
  );

  /* ---------- lo que se deriva de la carga abierta ---------- */
  const filas = carga?.filas ?? [];
  const sinRevisar = filas.filter((f) => f.decision === 'SIN_REVISAR').length;
  const cuentas = carga?.cuentas ?? {};
  const candidatosDelVinculo = (vinculando?.candidatos ?? []).map((id) => porId.get(id)).filter(Boolean);

  return (
    <>
      <PageHeader
        etiqueta="HERRAMIENTAS"
        titulo="INFORME 9 DE JULIO"
        botonVolver
      />

      {error && (
        <Aviso tipo="alerta" titulo="No se pudo completar">
          {error}
        </Aviso>
      )}

      {resultado && (
        <Aviso tipo="ok" titulo="Informe aplicado">
          {resultado.confirmados + resultado.completados} contrato(s) confirmado(s) · {resultado.creados} contrato(s) nuevo(s) ·{' '}
          {resultado.altas} alta(s) de local · {resultado.retirados} baja(s) · {resultado.pendientes} pendiente(s) para la próxima.
        </Aviso>
      )}

      {/* ================= SIN CARGA ABIERTA: subir el archivo ================= */}
      {!carga && (
        <>
          <Aviso tipo="info" titulo="Cómo funciona">
            Subí el archivo que mandó la prestataria (planilla Excel o CSV; también PDF con capa de texto). El sistema lo lee, verifica
            cada CUIT por su dígito y lo cruza contra el padrón. <strong>Nada cambia hasta que revises y apliques.</strong> Si el
            archivo es una foto o un escaneo, pedí el informe en planilla.
          </Aviso>

          <div className="barra-lote">
            <label className="campo" htmlFor="periodo-9dj">
              <span>Período que cubre (opcional)</span>
              <input
                id="periodo-9dj"
                type="text"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                placeholder="ej.: octubre 2026"
                maxLength={30}
              />
            </label>
            <label className="btn-primario" style={{ cursor: 'pointer' }}>
              {ocupado ? 'Leyendo…' : 'Subir el informe'}
              <input
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,.pdf"
                style={{ display: 'none' }}
                disabled={ocupado}
                onChange={(e) => {
                  subir(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </>
      )}

      {/* ================= CON CARGA ABIERTA: la revisión ================= */}
      {carga && (
        <>


          {carga.advertencia && (
            <Aviso tipo="alerta" titulo="El archivo vino en PDF">
              {carga.advertencia} La columna “Como vino en el archivo” muestra cada línea original.
            </Aviso>
          )}

          {carga.incompleto && (
            <Aviso tipo="alerta" titulo="Este informe puede estar incompleto">
              Trae {filas.length} fila(s) y el anterior traía {carga.informeAnterior?.filas}. Puede faltar una hoja o haber quedado un
              filtro puesto en la planilla. Si igual es correcto, marcalo antes de aplicar:{' '}
              <label>
                <input type="checkbox" checked={confirmoIncompleto} onChange={(e) => setConfirmoIncompleto(e.target.checked)} />{' '}
                revisé el informe y está completo
              </label>
            </Aviso>
          )}

          <div className="accesos-header">
            <span>Las filas del informe</span>
          </div>
          <Grilla
            filas={filas}
            columnas={columnasFilas}
            nombreArchivo="informe-9dj-filas"
            vacio="El informe no tiene filas."
            alto="auto"
            filasPorPagina={25}
          />

          <div className="accesos-header">
            <span>Bajas que propone la foto ({carga.bajasPropuestas.length})</span>
          </div>
          {carga.bajasPropuestas.length === 0 ? (
            <Vacio titulo="Ningún local pierde su contrato">Todos los que tenían contrato de la prestataria figuran en este informe.</Vacio>
          ) : (
            <>
              <Aviso tipo="alerta" titulo="Estos locales tienen contrato y NO figuran en este informe">
                Si el informe está completo, la prestataria ya no los tiene en su padrón. <strong>Ninguno se da de baja solo</strong>:
                tildá los que correspondan y el resto conserva el contrato hasta el próximo informe. Al perderlo, el local vuelve al
                circuito de notificación.
              </Aviso>
              <Grilla
                filas={carga.bajasPropuestas}
                columnas={columnasBajas}
                nombreArchivo="informe-9dj-bajas-propuestas"
                vacio="No hay bajas propuestas."
                alto="auto"
                filasPorPagina={25}
              />
            </>
          )}

          <div className="barra-lote">
            <button
              type="button"
              className="btn-primario"
              disabled={ocupado || sinRevisar > 0 || (carga.incompleto && !confirmoIncompleto)}
              onClick={() => setConfirmarAplicar(true)}
              title={sinRevisar > 0 ? `Faltan ${sinRevisar} fila(s) por revisar` : ''}
            >
              Aplicar el informe{bajasElegidas.size > 0 ? ` (${bajasElegidas.size} baja(s))` : ''}
            </button>
            <button type="button" className="btn-secundario" disabled={ocupado} onClick={() => setConfirmarDescartar(true)}>
              Descartar esta carga
            </button>
            {sinRevisar > 0 && (
              <span className="texto-chico">
                Para aplicar hay que revisar todo: {sinRevisar} fila(s) esperan una decisión (puede ser “Pendiente”).
              </span>
            )}
          </div>
        </>
      )}

      {/* ================= HISTORIAL ================= */}
      <div className="accesos-header">
        <span>Historial de informes</span>
      </div>
      {historial === null ? (
        <Vacio titulo="Cargando…">Buscando los informes anteriores.</Vacio>
      ) : historial.length === 0 ? (
        <Vacio titulo="Todavía no se cargó ningún informe">El primero que se aplique queda acá como constancia.</Vacio>
      ) : (
        <Grilla
          filas={historial}
          columnas={columnasHistorial}
          nombreArchivo="informe-9dj-historial"
          vacio="No hay informes cargados."
          alto="auto"
        />
      )}

      {/* ================= MODALES ================= */}

      <Confirmar
        abierto={confirmarAplicar}
        titulo="Aplicar el informe"
        onConfirmar={aplicar}
        onCancelar={() => setConfirmarAplicar(false)}
        textoConfirmar="Aplicar"
      >
        <p>
          {cuentas.CONFIRMADA ?? 0} confirmada(s) · {cuentas.VINCULADA ?? 0} vinculada(s) · {cuentas.ALTA ?? 0} alta(s) ·{' '}
          {cuentas.PENDIENTE ?? 0} pendiente(s) · {cuentas.RECHAZADA ?? 0} rechazada(s).
        </p>
        {bajasElegidas.size > 0 ? (
          <>
            <p>
              <strong>Pierden el contrato ({bajasElegidas.size}):</strong>
            </p>
            <ul>
              {(carga?.bajasPropuestas ?? [])
                .filter((b) => bajasElegidas.has(b.id))
                .map((b) => (
                  <li key={b.id}>
                    {b.nombreLocal} — {b.direccion || 'sin dirección'}
                  </li>
                ))}
            </ul>
          </>
        ) : (
          <p>No se confirmó ninguna baja: todos los locales con contrato lo conservan.</p>
        )}
      </Confirmar>

      <Confirmar
        abierto={confirmarDescartar}
        titulo="Descartar esta carga"
        onConfirmar={descartar}
        onCancelar={() => setConfirmarDescartar(false)}
        textoConfirmar="Descartar"
        peligro
      >
        <p>
          La carga se cierra sin producir ningún cambio en el padrón y queda en el historial como descartada. Las decisiones tomadas
          sobre sus filas se pierden.
        </p>
      </Confirmar>

      {/* Vincular una fila no encontrada a un local existente */}
      <Modal
        abierto={Boolean(vinculando)}
        etiqueta="VINCULAR"
        titulo={`¿Qué local es "${vinculando?.razonSocial || vinculando?.cuit || ''}"?`}
        onCerrar={() => {
          setVinculando(null);
          setNumeroVinculo('');
        }}
      >
        {candidatosDelVinculo.length > 0 && (
          <>
            <p>El CUIT corresponde a varias sucursales. Elegí la que es:</p>
            <ul className="lista-candidatos">
              {candidatosDelVinculo.map((l) => (
                <li key={l.id}>
                  <button type="button" className="btn-secundario btn-chico" onClick={() => vincular(vinculando, l.id)}>
                    Vincular
                  </button>{' '}
                  <strong>{l.nombreLocal}</strong> — {l.direccion} (N° {l.id})
                </li>
              ))}
            </ul>
          </>
        )}
        <p>{candidatosDelVinculo.length > 0 ? 'O indicá otro local por su número:' : 'Indicá el número del local del padrón:'}</p>
        <div className="barra-lote">
          <input
            type="number"
            value={numeroVinculo}
            onChange={(e) => setNumeroVinculo(e.target.value)}
            placeholder="N° de local"
            aria-label="Número del local a vincular"
          />
          <button
            type="button"
            className="btn-primario btn-chico"
            disabled={!numeroVinculo}
            onClick={() => vincular(vinculando, Number(numeroVinculo))}
          >
            Vincular
          </button>
        </div>
      </Modal>

      {/* Anular una carga aplicada */}
      <Modal
        abierto={Boolean(anulando)}
        etiqueta="ANULAR"
        titulo={`Anular la carga N° ${anulando?.id ?? ''}`}
        onCerrar={() => {
          setAnulando(null);
          setMotivoAnulacion('');
        }}
      >
        <p>
          Se deshace TODO lo que esta carga produjo: los contratos que creó se dan de baja, los locales que creó también, y los que
          dio de baja recuperan su contrato. El motivo queda registrado con tu usuario.
        </p>
        <label className="campo" htmlFor="motivo-anulacion">
          <span>Motivo de la anulación (obligatorio)</span>
          <textarea
            id="motivo-anulacion"
            rows={3}
            value={motivoAnulacion}
            onChange={(e) => setMotivoAnulacion(e.target.value)}
            maxLength={255}
          />
        </label>
        <div className="barra-lote">
          <button type="button" className="btn-peligro" disabled={!motivoAnulacion.trim() || ocupado} onClick={anular}>
            Anular la carga
          </button>
        </div>
      </Modal>
    </>
  );
}

export default Informe9DJ;
