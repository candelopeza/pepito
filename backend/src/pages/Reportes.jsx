/* ============================================================================
   pages/Reportes.jsx  —  INDICADORES DE GESTIÓN  (URL: /#/reportes)
   ----------------------------------------------------------------------------
   Sección 9.5 del pliego. Las métricas que priorizó el área.

   >>> ESTE CONJUNTO NO ES UN LISTADO CERRADO <<<
   Es el priorizado por relevancia operativa. El diseño tiene que permitir
   sumar métricas nuevas sin rehacer la capa de reportería, y por eso todos los
   números salen de una sola función —indicadores() en datos/vistas.js— y esta
   pantalla solo los dibuja. Agregar una métrica es agregar un campo ahí y una
   tarjeta acá; no se toca nada más.

   [NO PORTAR] Los reportes del sistema viejo son una capa de presentación
   construida sobre los datos, sin efecto sobre las reglas. No deben portarse
   como código: se rediseñan con las herramientas de la plataforma nueva. Esto
   es exactamente eso.

   LA PRODUCCIÓN POR AGENTE está al final. Es el reporte que hoy se manda por
   correo todos los días a las 7 (Anexo A.4), consolidando las 24 horas
   previas. Acá se puede consultar por período en cualquier momento.

   >>> EL PERÍODO LO ELIGE EL USUARIO (2026-10-02) <<<
   Mes en curso (por defecto), ayer (el reporte diario), hoy, mes anterior,
   todo el historial u otras fechas. Cambia lo que PASÓ en el período
   (indicadoresDelPeriodo); lo que es una foto de hoy (composición del padrón,
   cédulas sin imprimir, expedientes por generar, prórrogas vigentes) no
   depende del período y lo dice su título.
   ============================================================================ */

import { useState } from 'react';
import PageHeader from '../components/ui/PageHeader';
import Grilla from '../components/ui/Grilla';
import { Vacio } from '../components/ui/Aviso';
import Campo from '../components/ui/Campo';
import { useDatos } from '../datos/datosContexto';
import { PERIODOS_REPORTE, rangoDePeriodo } from '../datos/vistas';
import { fmtFecha, hoyISO } from '../dominio/fechas';
import { textoFrecuencia } from '../dominio/actuaciones';

/* Una tarjeta con un número. Se repite tanto que vale un componente local. */
function Metrica({ valor, etiqueta, color = 'azul', ayuda }) {
  return (
    <div className={`stat-card stat-card-${color}`} title={ayuda}>
      <span className="stat-numero">{valor}</span>
      <span className="stat-label">{etiqueta}</span>
    </div>
  );
}

/* Un gráfico de barras horizontales, sin librería: una fila por categoría con
   la etiqueta, la barra y el valor escrito al lado. Una sola serie, un solo
   color (el azul del sistema): el largo de la barra es el dato, el número al
   lado lo confirma, así no hay que adivinar nada por el color. `title` en
   cada fila hace de tooltip al pasar el mouse. */
function Barras({ filas, etiqueta, valor, detalle, vacio }) {
  const maximo = Math.max(0, ...filas.map(valor));
  if (!filas.length || maximo === 0) return <Vacio titulo={vacio} />;
  return (
    <div className="grafico-barras" role="img" aria-label={filas.map((f) => `${etiqueta(f)}: ${valor(f)}`).join(' · ')}>
      {filas.map((f) => (
        <div key={etiqueta(f)} className="grafico-fila" title={detalle ? detalle(f) : `${etiqueta(f)}: ${valor(f)}`}>
          <span className="grafico-etiqueta">{etiqueta(f)}</span>
          <span className="grafico-pista">
            <span className="grafico-barra" style={{ width: `${(valor(f) / maximo) * 100}%` }} />
          </span>
          <span className="grafico-valor">{valor(f)}</span>
        </div>
      ))}
    </div>
  );
}

/* Retiros semanales por rubro: la tabla que acompaña al gráfico. */
const COLUMNAS_RUBROS = [
  { field: 'rubro', headerName: 'Rubro', flex: 1, minWidth: 200 },
  { field: 'locales', headerName: 'Locales con contrato', width: 170, type: 'number' },
  { field: 'conFrecuencia', headerName: 'Con frecuencia cargada', width: 190, type: 'number' },
  { field: 'retirosSemanales', headerName: 'Retiros por semana', width: 160, type: 'number' },
  {
    field: 'promedio',
    headerName: 'Promedio por local',
    width: 160,
    type: 'number',
    renderCell: ({ row }) => (row.promedio === null ? '—' : `${row.promedio} / semana`),
  },
];

/* El rendimiento por agente. Las filas NO tienen `id` (la clave es el nombre
   del agente), así que la grilla lo recibe por `idFila`. */
const COLUMNAS_AGENTES = [
  { field: 'agente', headerName: 'Agente', flex: 1, minWidth: 200 },
  { field: 'relevamientos', headerName: 'Relevamientos', width: 160 },
  { field: 'entregas', headerName: 'Entregas registradas', width: 200 },
  {
    field: 'total',
    headerName: 'Total',
    width: 120,
    valueGetter: (_v, row) => row.relevamientos + row.entregas,
    renderCell: ({ row }) => <strong>{row.relevamientos + row.entregas}</strong>,
  },
];

function Reportes() {
  const { indicadores, indicadoresDelPeriodo } = useDatos();
  const i = indicadores();

  const hoy = hoyISO();
  const [periodo, setPeriodo] = useState('mes');
  const [otro, setOtro] = useState({ desde: `${hoy.slice(0, 7)}-01`, hasta: hoy });
  const rango = periodo === 'otro' ? otro : rangoDePeriodo(periodo, hoy);
  const p = indicadoresDelPeriodo(rango.desde, rango.hasta);

  const etiquetaPeriodo =
    periodo === 'todo'
      ? 'todo el historial'
      : rango.desde === rango.hasta
        ? `el ${fmtFecha(rango.desde)}`
        : `del ${fmtFecha(rango.desde)} al ${fmtFecha(rango.hasta)}`;

  return (
    <>
      <PageHeader
        etiqueta="REPORTES"
        titulo="INDICADORES DE GESTIÓN"
        subtitulo={`Al ${fmtFecha(hoy)} · período: ${etiquetaPeriodo}`}
        botonVolver
        acciones={
          <button type="button" className="btn-secundario" onClick={() => window.print()}>
            Imprimir
          </button>
        }
      />

      {/* ================= PERÍODO ================= */}
      <div className="selector-orden reporte-periodo" role="radiogroup" aria-label="Período del reporte">
        {PERIODOS_REPORTE.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={periodo === o.id}
            className={`selector-orden-opcion${periodo === o.id ? ' activa' : ''}`}
            onClick={() => setPeriodo(o.id)}
          >
            {o.etiqueta}
          </button>
        ))}
      </div>
      {periodo === 'otro' && (
        <div className="formulario reporte-fechas">
          <Campo
            id="rep-desde"
            etiqueta="Desde"
            tipo="date"
            valor={otro.desde}
            max={otro.hasta}
            onChange={(v) => setOtro((r) => ({ ...r, desde: v || r.desde }))}
          />
          <Campo
            id="rep-hasta"
            etiqueta="Hasta"
            tipo="date"
            valor={otro.hasta}
            min={otro.desde}
            onChange={(v) => setOtro((r) => ({ ...r, hasta: v || r.hasta }))}
          />
        </div>
      )}

      {/* ================= PADRÓN ================= */}
      <div className="accesos-header">
        <span>Composición del padrón (hoy)</span>
      </div>
      <div className="grid-stats">
        <Metrica valor={i.totalLocales} etiqueta="Locales en el padrón" />
        <Metrica valor={i.conDocumentacionVigente} etiqueta="Con documentación vigente" color="verde" />
        <Metrica valor={i.enCircuito} etiqueta="En circuito de intimación" color="naranja" />
        <Metrica valor={i.exentos} etiqueta="Exentos confirmados" color="verde" ayuda="Único estado terminal del sistema" />
        <Metrica
          valor={i.datosIncompletos}
          etiqueta="Con datos registrales incompletos"
          color="rojo"
          ayuda="No pueden avanzar a segunda notificación"
        />
        <Metrica valor={i.bloqueados} etiqueta="Con bloqueo manual" color="amarillo" />
        <Metrica valor={i.sinGeo} etiqueta="Sin ubicación geocodificada" color="amarillo" />
      </div>

      {/* ================= RELEVAMIENTOS ================= */}
      <span>  </span>
      <div className="accesos-header">
        <span>Relevamientos</span>
      </div>
      <div className="grid-stats">
        <Metrica valor={p.relevamientos} etiqueta="Relevamientos realizados" />
        <Metrica valor={p.relevamientosGG} etiqueta="Clasificados Gran Generador" color="naranja" />
        <Metrica valor={p.relevamientosGM} etiqueta="Clasificados Generador Menor" color="azul" />
      </div>

      {/* ================= NOTIFICACIONES ================= */}
      <div className="accesos-header">
        <span>Notificaciones</span>
      </div>
      <div className="grid-stats">
        <Metrica valor={p.notif1Emitidas} etiqueta="Primeras emitidas" />
        <Metrica
          valor={p.notif1Entregadas}
          etiqueta="Primeras con entrega fehaciente"
          color="verde"
          ayuda="Entregada, sin firma o fijada. La no entregada no cuenta: no hace correr plazo."
        />
        <Metrica valor={p.notif2Emitidas} etiqueta="Segundas emitidas" />
        <Metrica valor={p.notif2Entregadas} etiqueta="Segundas con entrega fehaciente" color="verde" />
        {/* null = la base no guarda la constancia de impresión (sql/04): no se sabe. */}
        {i.sinImprimir !== null && (
          <Metrica
            valor={i.sinImprimir}
            etiqueta="Cédulas sin imprimir (hoy)"
            color="rojo"
            ayuda="Emitidas pero sin constancia de impresión"
          />
        )}
      </div>
      {/* ================= DOCUMENTACIÓN ================= */}
      <div className="accesos-header">
        <span>Documentación</span>
      </div>
      <div className="grid-stats">
        <Metrica valor={p.ddjj} etiqueta="Declaraciones juradas" color="verde" />
        <Metrica valor={p.ddjjReciclaje} etiqueta="DDJJ de reciclaje" color="verde" />
        <Metrica valor={p.contratos} etiqueta="Contratos" color="verde" />
        <Metrica
          valor={p.contratos9DJ}
          etiqueta="De ellos, informados por 9 de Julio"
          color="azul"
          ayuda="Distinto valor probatorio: su vigencia solo se modifica por esa vía"
        />
      </div>

      {/* ================= CIRCUITO SANCIONATORIO ================= */}
      <div className="accesos-header">
        <span>Circuito sancionatorio</span>
      </div>
      <div className="grid-stats">
        <Metrica valor={i.expedientesPendientes} etiqueta="Expedientes pendientes de generar (hoy)" color="naranja" />
        <Metrica valor={p.expedientes} etiqueta="Expedientes iniciados en el período" color="rojo" />
        <Metrica valor={p.prorrogas} etiqueta="Prórrogas otorgadas en el período" color="amarillo" />
        <Metrica valor={i.prorrogasVigentes} etiqueta="Prórrogas vigentes (hoy)" color="amarillo" />
      </div>

      {/* ================= VOLUMEN DE GENERACIÓN ================= */}
      {/* Pedido de coordinación (4/11/2026): dimensionar a grandes rasgos el
          volumen de residuos. Sale de la frecuencia de recolección de los
          contratos vigentes (datos/vistas.js, volumenDeGeneracion). */}
      <div className="accesos-header">
        <span>Volumen de generación (hoy, según los contratos vigentes)</span>
      </div>
      <p className="texto-chico reporte-nota">
        La medida es la cantidad de retiros por semana: un local cuya prestataria pasa 3 veces por semana suma 3. Sale de la
        frecuencia de recolección que coordinación carga en Herramientas → Informe 9 de Julio. No se conoce cuánto se retira en
        cada pasada, así que es una aproximación; mientras falten frecuencias por cargar, el total queda corto.
      </p>
      <div className="grid-stats">
        <Metrica valor={i.volumen.conContrato} etiqueta="Locales con contrato vigente" color="verde" />
        <Metrica
          valor={i.volumen.conFrecuencia}
          etiqueta="Con frecuencia cargada"
          color={i.volumen.sinFrecuencia ? 'amarillo' : 'verde'}
          ayuda={i.volumen.sinFrecuencia ? `Faltan ${i.volumen.sinFrecuencia}: se cargan en Herramientas → Informe 9 de Julio` : 'Todas cargadas'}
        />
        <Metrica valor={i.volumen.retirosSemanales} etiqueta="Retiros por semana" ayuda="Suma de las frecuencias cargadas" />
        <Metrica valor={i.volumen.retirosMensuales} etiqueta="Retiros por mes (estimado)" ayuda="Retiros por semana × 52 / 12" />
        <Metrica
          valor={i.volumen.promedio === null ? '—' : i.volumen.promedio}
          etiqueta="Pasadas semanales por local (promedio)"
          ayuda="Sobre los locales con frecuencia cargada"
        />
      </div>
      <div className="grafico-par">
        <div className="grafico-bloque">
          <h3 className="grafico-titulo">Locales por frecuencia de recolección</h3>
          <Barras
            filas={i.volumen.porFrecuencia}
            etiqueta={(f) => textoFrecuencia(f.frecuencia)}
            valor={(f) => f.locales}
            detalle={(f) => `${f.locales} local(es) con ${textoFrecuencia(f.frecuencia).toLowerCase()}`}
            vacio="Todavía no hay frecuencias cargadas"
          />
        </div>
        <div className="grafico-bloque">
          <h3 className="grafico-titulo">Retiros por semana según rubro</h3>
          <Barras
            filas={i.volumen.porRubro.filter((r) => r.retirosSemanales > 0).slice(0, 12)}
            etiqueta={(r) => r.rubro}
            valor={(r) => r.retirosSemanales}
            detalle={(r) => `${r.rubro}: ${r.retirosSemanales} retiros por semana en ${r.conFrecuencia} de ${r.locales} local(es) con contrato`}
            vacio="Todavía no hay frecuencias cargadas"
          />
        </div>
      </div>
      {i.volumen.porRubro.length > 0 && (
        <Grilla
          filas={i.volumen.porRubro}
          columnas={COLUMNAS_RUBROS}
          idFila={(fila) => fila.rubro}
          nombreArchivo="volumen-por-rubro"
          vacio="Ningún local tiene contrato vigente."
          alto="auto"
        />
      )}

      {/* ================= PRODUCCIÓN POR AGENTE ================= */}
      <div className="accesos-header">
        <span>Producción por agente en el período</span>
      </div>
      {p.porAgente.length === 0 ? (
        <Vacio titulo="Sin producción registrada" />
      ) : (
        <Grilla
          filas={p.porAgente}
          columnas={COLUMNAS_AGENTES}
          idFila={(fila) => fila.agente}
          nombreArchivo="rendimiento-por-agente"
          vacio="Todavía no hay actividad registrada por agente."
          alto="auto"
        />
      )}
    </>
  );
}

export default Reportes;
