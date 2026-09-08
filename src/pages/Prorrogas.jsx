/* ============================================================================
   pages/Prorrogas.jsx  —  PRÓRROGAS  (URL: /#/prorrogas)
   ----------------------------------------------------------------------------
   Etapa 5 del circuito. Agotadas las dos notificaciones, y ANTES de que se
   genere el expediente, el titular puede pedir una prórroga.

   TRES REGLAS QUE SE VEN EN ESTA PANTALLA

   1. NO SE PUEDE OTORGAR EN CUALQUIER MOMENTO. Solo con las dos notificaciones
      agotadas y antes de que exista expediente. Por eso el bloque "se les puede
      otorgar" no lista todo el padrón: lista los locales cuyo estado lo habilita
      (la regla está en dominio/reglas.js, no acá).

   2. LOS DÍAS SE CARGAN A MANO Y NO TIENEN VALOR POR DEFECTO. Es el único plazo
      del sistema que no es fijo: los de notificación son 5 y 3 días hábiles y
      los define la Dirección.

   3. MIENTRAS ESTÁ VIGENTE, EL LOCAL NO APARECE EN LA BANDEJA DE EXPEDIENTES.
      Al vencer sin presentación, pasa a generación de expediente al día
      siguiente del vencimiento.

   PENDIENTE con el área legal (Anexo B.2): si hay un tope de días y una
   cantidad máxima de prórrogas por local. Está resuelto con dos parámetros de
   Configuración, hoy en 30 días y 1 prórroga.
   ============================================================================ */

import { Link } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import Badge, { BadgeEstado } from '../components/ui/Badge';
import Aviso, { Vacio } from '../components/ui/Aviso';
import AccionesLocal from '../components/AccionesLocal';
import { useDatos } from '../datos/datosContexto';
import { diasEntre, fmtFecha, hoyISO } from '../dominio/fechas';
import { estaVigente } from '../dominio/vigencias';

function Prorrogas() {
  const { actuaciones, localesConEstado, localPorId, parametros } = useDatos();

  const otorgadas = actuaciones
    .filter((a) => a.tipo === 'PRORROGA')
    .map((a) => ({ ...a, local: localPorId(a.localId), vigente: estaVigente(a.fechaVencimiento) }))
    .reverse();

  const vigentes = otorgadas.filter((p) => p.vigente);

  // Los que la regla habilita. No se calcula acá: se pregunta por el estado.
  const habilitados = localesConEstado.filter((l) =>
    ['NOTIF2_ENTREGADA', 'NOTIF2_SIN_FIRMA', 'NOTIF2_FIJADA', 'GENERAR_EXPEDIENTE'].includes(l.estado),
  );

  return (
    <>
      <PageHeader
        etiqueta="PRÓRROGAS"
        titulo="PRÓRROGAS OTORGADAS"
        subtitulo={`${vigentes.length} vigente(s) de ${otorgadas.length} otorgada(s) en total`}
        botonVolver
      />

      <Aviso tipo="info" titulo="Es el único plazo que se carga a mano">
        Los plazos de notificación son fijos (5 y 3 días hábiles) y los define la Dirección. La cantidad de días de una prórroga la
        decide coordinación en cada caso, y no tiene valor por defecto.
        {parametros.topeProrrogaDias
          ? ` Tope configurado: ${parametros.topeProrrogaDias} días, máximo ${parametros.maxProrrogasPorLocal} por local (pendiente de definición con el área legal).`
          : ' Sin tope configurado.'}
      </Aviso>

      <Aviso tipo="alerta" titulo="Si vence sin presentación, el local pasa solo a generación de expediente">
        No hay que hacer nada para que pase ni se puede olvidar: al vencer, el local aparece en la bandeja{' '}
        <Link to="/tablero">Expedientes para generar</Link> del tablero. Si presentó documentación durante la prórroga, sale del
        circuito y no llega ahí.
      </Aviso>

      {/* ================= VIGENTES ================= */}
      <div className="accesos-header">
        <span>Prórrogas vigentes</span>
      </div>

      {vigentes.length === 0 ? (
        <Vacio titulo="Ninguna prórroga en curso">No hay locales con el circuito sancionatorio suspendido.</Vacio>
      ) : (
        <table className="tabla-datos">
          <thead>
            <tr>
              <th>Local</th>
              <th>Otorgada</th>
              <th>Días</th>
              <th>Vence</th>
              <th>Restan</th>
              <th>Motivo</th>
              <th>Otorgó</th>
            </tr>
          </thead>
          <tbody>
            {vigentes.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/locales/${p.localId}`} className="link-local">
                    {p.local?.nombreLocal ?? `Local ${p.localId}`}
                  </Link>
                  <small className="celda-sub">
                    <BadgeEstado codigo={p.local?.estado} />
                  </small>
                </td>
                <td>{fmtFecha(p.fecha)}</td>
                <td>{p.diasOtorgados}</td>
                <td>{fmtFecha(p.fechaVencimiento)}</td>
                <td>
                  {/* Cuando esto llegue a 0, el local cae solo en la bandeja de
                      expedientes: no hay que hacer nada para que pase. */}
                  <strong>{diasEntre(hoyISO(), p.fechaVencimiento)} día(s)</strong>
                </td>
                <td className="celda-motivo">{p.motivo}</td>
                <td>{p.usuario}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ================= A QUIÉNES SE LES PUEDE OTORGAR ================= */}
      <div className="accesos-header">
        <span>Locales que pueden recibir una prórroga</span>
      </div>

      {habilitados.length === 0 ? (
        <Vacio titulo="Ningún local está en condiciones">
          La prórroga solo se puede otorgar con las dos notificaciones agotadas y antes de que exista expediente.
        </Vacio>
      ) : (
        <table className="tabla-datos tabla-bandeja">
          <thead>
            <tr>
              <th>Local</th>
              <th>Dirección</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {habilitados.map((l) => (
              <tr key={l.id}>
                <td>
                  <Link to={`/locales/${l.id}`} className="link-local">
                    {l.nombreLocal}
                  </Link>
                </td>
                <td>{l.direccion}</td>
                <td>
                  <BadgeEstado codigo={l.estado} />
                </td>
                <td>
                  <AccionesLocal local={l} compacto />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ================= HISTÓRICO ================= */}
      {otorgadas.length > vigentes.length && (
        <>
          <div className="accesos-header">
            <span>Prórrogas vencidas</span>
          </div>
          <table className="tabla-datos">
            <thead>
              <tr>
                <th>Local</th>
                <th>Otorgada</th>
                <th>Días</th>
                <th>Venció</th>
                <th>Resultado</th>
                <th>Situación actual del local</th>
              </tr>
            </thead>
            <tbody>
              {otorgadas
                .filter((p) => !p.vigente)
                .map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/locales/${p.localId}`} className="link-local">
                        {p.local?.nombreLocal ?? `Local ${p.localId}`}
                      </Link>
                    </td>
                    <td>{fmtFecha(p.fecha)}</td>
                    <td>{p.diasOtorgados}</td>
                    <td>{fmtFecha(p.fechaVencimiento)}</td>
                    <td>
                      {/* Si el local terminó con documentación vigente,
                          presentó durante la prórroga y salió del circuito. */}
                      {p.local?.estadoGrupo === 'documental' ? (
                        <Badge color="verde">Presentó durante la prórroga</Badge>
                      ) : (
                        <Badge color="naranja">Venció sin presentación</Badge>
                      )}
                    </td>
                    <td>
                      {/* La consecuencia, a la vista: el que venció sin
                          presentar ya figura para generar expediente. */}
                      <BadgeEstado codigo={p.local?.estado} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

export default Prorrogas;
