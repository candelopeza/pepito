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
   ============================================================================ */

import PageHeader from '../components/ui/PageHeader';
import Aviso, { Vacio } from '../components/ui/Aviso';
import { useDatos } from '../datos/datosContexto';
import { fmtFecha, hoyISO } from '../dominio/fechas';

/* Una tarjeta con un número. Se repite tanto que vale un componente local. */
function Metrica({ valor, etiqueta, color = 'azul', ayuda }) {
  return (
    <div className={`stat-card stat-card-${color}`} title={ayuda}>
      <span className="stat-numero">{valor}</span>
      <span className="stat-label">{etiqueta}</span>
    </div>
  );
}

function Reportes() {
  const { indicadores, secuencias } = useDatos();
  const i = indicadores();

  const mes = new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  return (
    <>
      <PageHeader
        etiqueta="REPORTES"
        titulo="INDICADORES DE GESTIÓN"
        subtitulo={`Al ${fmtFecha(hoyISO())} · período en curso: ${mes}`}
        botonVolver
        acciones={
          <button type="button" className="btn-secundario" onClick={() => window.print()}>
            Imprimir
          </button>
        }
      />

      {/* ================= PADRÓN ================= */}
      <div className="accesos-header">
        <span>Composición del padrón</span>
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
      <div className="accesos-header">
        <span>Relevamientos del período, por clasificación</span>
      </div>
      <div className="grid-stats">
        <Metrica valor={i.relevamientosMes} etiqueta="Relevamientos del mes" />
        <Metrica valor={i.relevamientosGG} etiqueta="Clasificados Gran Generador" color="naranja" />
        <Metrica valor={i.relevamientosGM} etiqueta="Clasificados Generador Menor" color="azul" />
      </div>

      {/* ================= NOTIFICACIONES ================= */}
      <div className="accesos-header">
        <span>Notificaciones emitidas y entregadas, por instancia</span>
      </div>
      <div className="grid-stats">
        <Metrica valor={i.notif1Emitidas} etiqueta="Primeras emitidas" />
        <Metrica
          valor={i.notif1Entregadas}
          etiqueta="Primeras con entrega fehaciente"
          color="verde"
          ayuda="Entregada, sin firma o fijada. La no entregada no cuenta: no hace correr plazo."
        />
        <Metrica valor={i.notif2Emitidas} etiqueta="Segundas emitidas" />
        <Metrica valor={i.notif2Entregadas} etiqueta="Segundas con entrega fehaciente" color="verde" />
        <Metrica
          valor={i.sinImprimir}
          etiqueta="Cédulas sin imprimir"
          color="rojo"
          ayuda="Emitidas pero sin constancia de impresión"
        />
      </div>

      {/* La brecha entre emitidas y entregadas es el dato más útil de acá:
          dice cuánto trabajo administrativo no llegó a producir efecto. */}
      {i.notif1Emitidas > i.notif1Entregadas && (
        <Aviso tipo="info" titulo="Brecha entre emisión y entrega">
          Se emitieron {i.notif1Emitidas} primeras notificaciones y {i.notif1Entregadas} llegaron a tener entrega fehaciente. Las
          que faltan no hacen correr ningún plazo: son actos iniciados que todavía no produjeron efecto jurídico.
        </Aviso>
      )}

      {/* ================= DOCUMENTACIÓN ================= */}
      <div className="accesos-header">
        <span>Documentación recibida, por tipo</span>
      </div>
      <div className="grid-stats">
        <Metrica valor={i.ddjj} etiqueta="Declaraciones juradas" color="verde" />
        <Metrica valor={i.ddjjReciclaje} etiqueta="DDJJ de reciclaje" color="verde" />
        <Metrica valor={i.contratos} etiqueta="Contratos" color="verde" />
        <Metrica
          valor={i.contratos9DJ}
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
        <Metrica valor={i.expedientesPendientes} etiqueta="Expedientes pendientes de generar" color="naranja" />
        <Metrica valor={i.expedientes} etiqueta="Expedientes iniciados" color="rojo" />
        <Metrica valor={i.prorrogasVigentes} etiqueta="Prórrogas vigentes" color="amarillo" />
      </div>

      {/* ================= PRODUCCIÓN POR AGENTE ================= */}
      <div className="accesos-header">
        <span>Producción por agente</span>
      </div>
      {i.porAgente.length === 0 ? (
        <Vacio titulo="Sin producción registrada" />
      ) : (
        <table className="tabla-datos">
          <thead>
            <tr>
              <th>Agente</th>
              <th>Relevamientos</th>
              <th>Entregas registradas</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {i.porAgente.map((a) => (
              <tr key={a.agente}>
                <td>{a.agente}</td>
                <td>{a.relevamientos}</td>
                <td>{a.entregas}</td>
                <td>
                  <strong>{a.relevamientos + a.entregas}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ================= NUMERACIONES ================= */}
      <div className="accesos-header">
        <span>Numeraciones administrativas</span>
      </div>
      <Aviso tipo="info" titulo="Secuencias controladas, sin reutilización">
        Los números de cédula y de expediente son numeraciones con significado legal (sección 5.4): queda constancia de qué número
        se emitió, cuándo y para qué local, y ningún número se reutiliza. Al importar del sistema anterior tienen que continuar
        desde el último valor emitido, sin repetir ni saltear.
        <br />
        Última cédula emitida: <strong>CED-{String(secuencias.cedula).padStart(6, '0')}</strong> · último expediente:{' '}
        <strong>N° {secuencias.expediente}</strong>
      </Aviso>
    </>
  );
}

export default Reportes;
