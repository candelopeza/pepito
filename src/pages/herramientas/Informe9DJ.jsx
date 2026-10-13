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
import FormLocal from '../../components/FormLocal';
import { api } from '../../datos/api';
import { useDatos } from '../../datos/datosContexto';
import { fmtFecha, hoyISO } from '../../dominio/fechas';

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

/* Para el buscador del vínculo: sin tildes y en mayúsculas, así "PEÑA" y
   "pena" se encuentran igual. */
const normalizarTexto = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();

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
  const [busquedaVinculo, setBusquedaVinculo] = useState('');
  // El backend frenó un vínculo que no se parece en nada: { idLocal, comparacion }.
  const [vinculoDudoso, setVinculoDudoso] = useState(null);
  const [dandoAlta, setDandoAlta] = useState(null); // la fila del modal de alta
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
        const r = await api.informe9djDecidir(carga.id, fila.id, { decision, idLocal });
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

  const cerrarVinculo = useCallback(() => {
    setVinculando(null);
    setNumeroVinculo('');
    setBusquedaVinculo('');
    setVinculoDudoso(null);
  }, []);

  /* Vincular tiene su propio manejo de errores: cuando el backend frena un
     vínculo que no se parece en nada (ni CUIT, ni dirección, ni nombre), la
     respuesta trae los dos lados para mostrarlos, y el agente decide si lo
     confirma igual (forzar). */
  const vincular = useCallback(
    async (fila, idLocal, forzar = false) => {
      setError(null);
      try {
        await api.informe9djDecidir(carga.id, fila.id, { decision: 'VINCULADA', idLocal, forzar });
      } catch (e) {
        if (e.estado === 409 && e.cuerpo?.comparacion) {
          setVinculoDudoso({ idLocal, comparacion: e.cuerpo.comparacion, mensaje: e.message });
          return;
        }
        setError(e.message);
        cerrarVinculo();
        return;
      }
      cerrarVinculo();
      // El vínculo cambia qué locales sostiene la foto: las bajas propuestas
      // pueden haber cambiado, así que se repide el detalle entero.
      setCarga(await api.informe9djCarga(carga.id));
    },
    [carga?.id, cerrarVinculo],
  );

  /* El alta revisada en el formulario del padrón. El local NO se crea acá:
     los datos quedan guardados en la fila y el local nace al aplicar el
     informe (si la carga se descarta, no queda rastro, como pide el pliego). */
  const guardarAlta = useCallback(
    async (fila, datosAlta) => {
      setError(null);
      try {
        const r = await api.informe9djDecidir(carga.id, fila.id, { decision: 'ALTA', datosAlta });
        setCarga((previa) => ({
          ...previa,
          filas: previa.filas.map((f) =>
            f.id === fila.id ? { ...f, decision: r.decision, idLocal: r.idLocal, datosAlta: r.datosAlta } : f,
          ),
        }));
        setDandoAlta(null);
      } catch (e) {
        setError(e.message);
        setDandoAlta(null);
      }
    },
    [carga?.id],
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

      /* La pregunta es si la fila TIENE un local (porque cruzó sola o porque
         el agente la vinculó a mano): con local se confirma o se rechaza; sin
         local se da de alta o se vincula. Antes se miraba solo el cruce y una
         fila vinculada quedaba sin forma de confirmarse. */
      if (fila.idLocal) {
        return (
          <span className="acciones-fila">
            {boton('CONFIRMADA', 'Confirmar', 'btn-primario')}
            {boton('RECHAZADA', 'Rechazar')}
            {boton('PENDIENTE', 'Pendiente')}
            {fila.cruce !== 'ENCONTRADO' && (
              <button type="button" className="btn-secundario btn-chico" onClick={() => setVinculando(fila)}>
                Cambiar vínculo…
              </button>
            )}
          </span>
        );
      }
      /* Con coincidencias parecidas a la vista, lo primero es mirarlas: el
         alta pasa a segundo plano para no crear un duplicado de un local que
         ya existe con el CUIT mal escrito. */
      const hayParecidos = fila.cruce === 'PARECIDO' && fila.candidatos.length > 0;
      return (
        <span className="acciones-fila">
          <button
            type="button"
            className={`${hayParecidos ? 'btn-primario' : 'btn-secundario'} btn-chico`}
            onClick={() => setVinculando(fila)}
          >
            {hayParecidos ? 'Elegir cuál es…' : 'Vincular…'}
          </button>
          <button
            type="button"
            className={`${hayParecidos ? 'btn-secundario' : 'btn-primario'} btn-chico`}
            onClick={() => setDandoAlta(fila)}
          >
            {fila.decision === 'ALTA' ? 'Revisar el alta…' : 'Dar de alta…'}
          </button>
          {boton('PENDIENTE', 'Pendiente')}
          {boton('RECHAZADA', 'Rechazar')}
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
        width: 210,
        renderCell: ({ row }) => {
          if (row.cuitValido) return row.cuit;
          // El motivo va ESCRITO, no escondido en el hover: es lo que el
          // agente tiene que leer antes de decidir qué hacer con la fila.
          const motivo = !row.cuit
            ? 'la fila vino sin CUIT'
            : row.cuit.length !== 11
              ? `tiene ${row.cuit.length} dígitos, deben ser 11`
              : 'el dígito verificador no cierra';
          return (
            <span className="celda-advertencia" title={row.motivoCuit ?? ''}>
              <strong>⚠ {row.cuit || 'SIN CUIT'}</strong>
              <small>{motivo}</small>
            </span>
          );
        },
      },
      { field: 'razonSocial', headerName: 'Razón social', flex: 1, minWidth: 180 },
      { field: 'direccion', headerName: 'Dirección', flex: 1, minWidth: 170 },
      { field: 'numeroContrato', headerName: 'Contrato', width: 110 },
      {
        field: 'vencimiento',
        headerName: 'Vencimiento',
        width: 175,
        renderCell: ({ row }) => {
          if (!row.vencimiento) return <span className="texto-gris">—</span>;
          // Un contrato que YA viene vencido no se puede cargar (lo rechaza el
          // backend): se marca para que el agente lo vea antes de intentarlo.
          if (row.vencimiento < hoyISO()) {
            return (
              <span
                className="celda-advertencia"
                title="Este contrato ya viene vencido: no se puede confirmar, vincular ni dar de alta. Rechazalo o dejalo pendiente y pedí la aclaración a la prestataria."
              >
                <strong>⚠ {fmtFecha(row.vencimiento)}</strong>
                <small>ya venció: no se carga</small>
              </span>
            );
          }
          return fmtFecha(row.vencimiento);
        },
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
          if (row.decision === 'ALTA') {
            return <span title="El local se crea al aplicar el informe">se creará «{row.datosAlta?.nombreLocal ?? row.razonSocial}»</span>;
          }
          if (row.candidatos.length) {
            return (
              <span title="El CUIT no cruzó solo, pero hay locales con la misma dirección o un nombre parecido. Tocá «Elegir cuál es…» para verlos.">
                <Badge color="naranja">{row.candidatos.length} coincidencia(s) parecida(s)</Badge>
              </span>
            );
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
        width: 320,
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
        // La única puerta para deshacer una carga aplicada (los contratos del
        // informe no se editan desde la ficha): pide motivo y queda firmada.
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

  /* El buscador del vínculo: por nombre, razón social, CUIT o dirección. Los
     agentes del área no conocen el número interno de local, así que buscar
     por texto es el camino normal; el número queda como atajo. */
  const textoBusqueda = normalizarTexto(busquedaVinculo).trim();
  const digitosBusqueda = textoBusqueda.replace(/\D/g, '');
  const resultadosBusqueda =
    textoBusqueda.length >= 3
      ? localesConEstado
          .filter(
            (l) =>
              normalizarTexto(l.nombreLocal).includes(textoBusqueda) ||
              normalizarTexto(l.razonSocial).includes(textoBusqueda) ||
              normalizarTexto(l.direccion).includes(textoBusqueda) ||
              (digitosBusqueda.length >= 4 && String(l.cuit ?? '').replace(/\D/g, '').includes(digitosBusqueda)),
          )
          .slice(0, 8)
      : [];

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
        onCerrar={cerrarVinculo}
      >
        {/* El backend frenó el vínculo porque los datos no se parecen en nada:
            se muestran los dos lados y la decisión final es del agente. */}
        {vinculoDudoso ? (
          <>
            <Aviso tipo="alerta" titulo="Los datos no coinciden">
              Ni el CUIT, ni la dirección, ni el nombre se parecen. Compará antes de confirmar:
            </Aviso>
            <table className="tabla-datos">
              <tbody>
                <tr>
                  <th />
                  <th>El informe dice</th>
                  <th>El local elegido es</th>
                </tr>
                <tr>
                  <th>Nombre</th>
                  <td>{vinculoDudoso.comparacion.fila.razonSocial || '—'}</td>
                  <td>
                    {vinculoDudoso.comparacion.local.nombreLocal || '—'}
                    {vinculoDudoso.comparacion.local.razonSocial ? ` (${vinculoDudoso.comparacion.local.razonSocial})` : ''}
                  </td>
                </tr>
                <tr>
                  <th>CUIT</th>
                  <td>{vinculoDudoso.comparacion.fila.cuit || '—'}</td>
                  <td>{vinculoDudoso.comparacion.local.cuit || '—'}</td>
                </tr>
                <tr>
                  <th>Dirección</th>
                  <td>{vinculoDudoso.comparacion.fila.direccion || '—'}</td>
                  <td>{vinculoDudoso.comparacion.local.direccion || '—'}</td>
                </tr>
              </tbody>
            </table>
            <div className="barra-lote">
              <button type="button" className="btn-secundario" onClick={() => setVinculoDudoso(null)}>
                Volver a buscar
              </button>
              <button type="button" className="btn-peligro" onClick={() => vincular(vinculando, vinculoDudoso.idLocal, true)}>
                Son el mismo local: vincular igual
              </button>
            </div>
          </>
        ) : (
          <>
            {vinculando && !vinculando.cuitValido && (
              <Aviso tipo="alerta" titulo="Cuidado: el CUIT de esta fila no cierra">
                {vinculando.motivoCuit ?? 'El CUIT vino mal en el archivo.'} Cotejá contra el archivo original (columna “Como vino en
                el archivo”) antes de vincular: puede ser otro comercio.
              </Aviso>
            )}
            {candidatosDelVinculo.length > 0 && (
              <>
                <p>
                  {vinculando?.cuitValido && candidatosDelVinculo.every((l) => String(l.cuit ?? '').replace(/\D/g, '') === vinculando.cuit)
                    ? 'El CUIT corresponde a varias sucursales. Elegí la que es:'
                    : 'Estos locales del padrón se parecen (misma dirección o nombre parecido, aunque el CUIT no coincida). Compará y elegí:'}
                </p>
                <ul className="lista-candidatos">
                  {candidatosDelVinculo.map((l) => (
                    <li key={l.id}>
                      <button type="button" className="btn-secundario btn-chico" onClick={() => vincular(vinculando, l.id)}>
                        Vincular
                      </button>{' '}
                      <strong>{l.nombreLocal}</strong> — {l.direccion || 'sin dirección'}
                      {l.cuit ? ` · CUIT ${l.cuit}` : ''} (N° {l.id})
                    </li>
                  ))}
                </ul>
              </>
            )}

            <p>{candidatosDelVinculo.length > 0 ? 'O buscá otro local del padrón:' : 'Buscá el local en el padrón:'}</p>
            <label className="campo" htmlFor="busqueda-vinculo">
              <span>Por nombre, razón social, CUIT o dirección</span>
              <input
                id="busqueda-vinculo"
                type="text"
                value={busquedaVinculo}
                onChange={(e) => setBusquedaVinculo(e.target.value)}
                placeholder="ej.: panadería albertus, 30716780100, solano vera…"
                autoComplete="off"
              />
            </label>
            {textoBusqueda.length >= 3 &&
              (resultadosBusqueda.length ? (
                <ul className="lista-candidatos">
                  {resultadosBusqueda.map((l) => (
                    <li key={l.id}>
                      <button type="button" className="btn-secundario btn-chico" onClick={() => vincular(vinculando, l.id)}>
                        Vincular
                      </button>{' '}
                      <strong>{l.nombreLocal}</strong> — {l.direccion || 'sin dirección'}
                      {l.cuit ? ` · CUIT ${l.cuit}` : ''} (N° {l.id})
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="texto-gris">Ningún local del padrón coincide con esa búsqueda.</p>
              ))}

            <p className="texto-chico">¿Sabés el número interno del local? Es un atajo, no hace falta:</p>
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
          </>
        )}
      </Modal>

      {/* El alta revisada: el mismo formulario del padrón, precargado con la
          fila del informe. Los datos quedan en la fila y el local se crea
          recién al APLICAR: si la carga se descarta, no queda rastro. */}
      {dandoAlta && (
        <Modal
          abierto
          etiqueta="ALTA DESDE EL INFORME"
          titulo={`Nuevo local: ${dandoAlta.datosAlta?.nombreLocal ?? dandoAlta.razonSocial ?? dandoAlta.cuit ?? ''}`}
          ancho="ancho"
          onCerrar={() => setDandoAlta(null)}
        >
          {!dandoAlta.cuitValido && (
            <Aviso tipo="alerta" titulo="Cuidado: el CUIT de esta fila no cierra">
              {dandoAlta.motivoCuit ?? 'El CUIT vino mal en el archivo.'} Antes de crear un local nuevo, revisá que no sea uno que ya
              existe con el CUIT bien escrito, y corregí el CUIT en el formulario si lo conseguís.
            </Aviso>
          )}
          <Aviso tipo="info" titulo="Los datos quedan guardados en la fila">
            Revisá y completá lo que falte. El local se crea recién al <strong>aplicar el informe</strong>, con su contrato de la
            prestataria; si la carga se descarta, no queda nada en el padrón.
          </Aviso>
          <FormLocal
            key={dandoAlta.id}
            esNuevo
            local={
              dandoAlta.datosAlta ?? {
                nombreLocal: dandoAlta.razonSocial ?? '',
                razonSocial: dandoAlta.razonSocial ?? '',
                cuit: dandoAlta.cuit ?? '',
                direccion: dandoAlta.direccion ?? '',
                rubro: '',
              }
            }
            onGuardar={(l) => guardarAlta(dandoAlta, l)}
            onCancelar={() => setDandoAlta(null)}
          />
        </Modal>
      )}

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
