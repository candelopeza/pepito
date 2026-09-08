/* ============================================================================
   pages/Tablero.jsx  —  TABLERO DE CONTROL  (URL: /#/tablero)
   ----------------------------------------------------------------------------
   Sección 6.1 del pliego. Es la pantalla de trabajo diario: cada bandeja
   agrupa los locales que requieren UNA acción determinada, y la acción se
   ejecuta sin salir de la vista.

   LA IDEA DE FONDO: el trabajo se organiza por bandeja, no buscando en el
   padrón. Alguien que entra a la mañana tiene que ver "hay 4 cédulas para
   emitir" y emitirlas ahí mismo.

   >>> LAS BANDEJAS NO ESTÁN DEFINIDAS ACÁ <<<
   Salen de DEFINICION_BANDEJAS en datos/vistas.js, donde cada bandeja declara
   qué estados agrupa y qué roles la ven. Los botones de cada fila salen de
   AccionesLocal, que a su vez los saca de la tabla ACCIONES del dominio.
   Resultado: no existe forma de que el tablero ofrezca una acción que la ficha
   del local no ofrezca, ni al revés.

   >>> EL ORDEN DE LAS BANDEJAS LO ELIGE EL USUARIO <<<
   POR PRIORIDAD (por defecto): primero lo que frena el circuito, después lo
   que hay que emitir, al final lo informativo. El número de cada bandeja está
   en su `prioridad` (datos/vistas.js): si el área quiere otro orden se cambian
   esos números, no esta pantalla.
   POR CANTIDAD: primero la bandeja con más locales esperando, para atacar el
   montón grande. Las vacías caen solas al final.
   La elección queda guardada en el navegador: nadie tiene que volver a
   elegirla cada mañana.

   ADEMÁS DE LAS BANDEJAS HAY DOS AVISOS QUE NO SON BANDEJAS:
     - plazos por vencer: el local sigue en su estado, no hay nada que hacer
       todavía, pero conviene verlo antes de que venza.
     - documentación por vencer: cuando caduque, el local reingresa solo al
       circuito. Es la oportunidad de avisarle al titular antes de intimarlo.
   ============================================================================ */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import Badge, { BadgeEstado } from '../components/ui/Badge';
import Aviso, { Vacio } from '../components/ui/Aviso';
import AccionesLocal from '../components/AccionesLocal';
import { useRol } from '../auth/rolContexto';
import { useDatos } from '../datos/datosContexto';
import { ORDENES_BANDEJA } from '../datos/vistas';
import { fmtFecha } from '../dominio/fechas';

/* La preferencia de orden vive en el navegador, igual que el resto de la
   maqueta (ver CLAVE_ALMACEN en datos/DatosProvider.jsx). Si el navegador
   bloquea el almacenamiento, se cae al orden por prioridad y no pasa nada. */
const CLAVE_ORDEN = 'gg-tablero-orden';

function ordenGuardado() {
  try {
    const guardado = localStorage.getItem(CLAVE_ORDEN);
    return ORDENES_BANDEJA.some((o) => o.id === guardado) ? guardado : 'prioridad';
  } catch {
    return 'prioridad';
  }
}

function Bandeja({ bandeja }) {
  // Arranca abierta si tiene algo: si está vacía no vale la pena el espacio.
  const [abierta, setAbierta] = useState(bandeja.locales.length > 0);

  return (
    <section className="bandeja">
      <button type="button" className="bandeja-cabecera" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta}>
        <span className={`bandeja-contador bandeja-contador-${bandeja.color}`}>{bandeja.locales.length}</span>
        <span className="bandeja-titulo">
          <strong>{bandeja.titulo}</strong>
          <small>{bandeja.descripcion}</small>
        </span>
        <span className="bandeja-flecha">{abierta ? '▲' : '▼'}</span>
      </button>

      {abierta && (
        <div className="bandeja-cuerpo">
          {bandeja.locales.length === 0 ? (
            <p className="bandeja-vacia">Nada pendiente en esta bandeja.</p>
          ) : (
            <table className="tabla-datos tabla-bandeja">
              <thead>
                <tr>
                  <th>Local</th>
                  <th>Dirección</th>
                  <th>Estado</th>
                  <th>Plazo</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {bandeja.locales.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {/* Todo local es clickeable hacia su ficha: es donde está
                          el historial completo y el contexto de la decisión. */}
                      <Link to={`/locales/${l.id}`} className="link-local">
                        {l.nombreLocal}
                      </Link>
                      <small className="celda-sub">{l.razonSocial || 'sin razón social'}</small>
                    </td>
                    <td>{l.direccion}</td>
                    <td>
                      <BadgeEstado codigo={l.estado} />
                    </td>
                    <td>
                      {l.plazo ? (
                        <span className={l.plazo.vencido ? 'texto-vencido' : ''}>
                          {fmtFecha(l.plazo.vencimiento)}
                          <small className="celda-sub">
                            {l.plazo.vencido ? 'vencido' : `en ${l.diasRestantes} día(s)`}
                          </small>
                        </span>
                      ) : (
                        <span className="texto-gris">sin plazo en curso</span>
                      )}
                    </td>
                    <td>
                      <AccionesLocal local={l} compacto />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}

function Tablero() {
  const { rol } = useRol();
  const { bandejasPara, porVencer, documentosPorVencer, presentacionesPendientes, localesConEstado } = useDatos();

  const [orden, setOrden] = useState(ordenGuardado);

  const bandejas = bandejasPara(rol, orden);
  const vencen = porVencer(3);
  const docsVencen = documentosPorVencer(30);
  const pendientesValidar = presentacionesPendientes();
  const sinImprimir = localesConEstado.filter((l) => l.estado.endsWith('_GENERADA'));

  const total = bandejas.reduce((n, b) => n + b.locales.length, 0);
  const ordenActual = ORDENES_BANDEJA.find((o) => o.id === orden) ?? ORDENES_BANDEJA[0];

  function cambiarOrden(nuevo) {
    setOrden(nuevo);
    try {
      localStorage.setItem(CLAVE_ORDEN, nuevo);
    } catch {
      /* Sin almacenamiento el orden vale solo para esta visita. */
    }
  }

  return (
    <>
      <PageHeader
        etiqueta="TABLERO"
        titulo="BANDEJAS DE TRABAJO"
        subtitulo={
          total === 0
            ? 'No hay nada pendiente en tus bandejas.'
            : `${total} local(es) esperando una acción tuya.`
        }
        botonVolver
      />

      {/* ---------- Cómo leer los colores ----------
          VA ARRIBA A PROPÓSITO. Estaba al final de la página y no servía de
          nada: para entender un badge había que bajar hasta el último renglón
          y volver. Es la referencia para leer TODO lo que viene abajo (los
          avisos y las bandejas), así que va antes que eso.

          El sistema tiene 24 estados: sin esta ayuda nadie recuerda qué
          significa cada color. Lleva el título adentro del recuadro y no un
          separador propio, para que ocupe un solo renglón y no empuje las
          bandejas fuera de la primera pantalla. */}
      <div className="leyenda">
        <span className="leyenda-titulo">Cómo leer los colores</span>
        <span>
          <Badge color="naranja">Naranja</Badge> hay que hacer algo
        </span>
        <span>
          <Badge color="azul">Azul</Badge> acto iniciado, el plazo no corre
        </span>
        <span>
          <Badge color="verde">Verde</Badge> cumple o quedó fuera del circuito
        </span>
        <span>
          <Badge color="amarillo">Amarillo</Badge> en espera (revisión o prórroga)
        </span>
        <span>
          <Badge color="rojo">Rojo</Badge> detenido o sancionatorio
        </span>
      </div>

      {/* ---------- Avisos que no son bandejas ---------- */}
      {pendientesValidar.length > 0 && (
        <Aviso tipo="alerta" titulo={`${pendientesValidar.length} presentación(es) del portal esperando validación`}>
          Mientras no se aprueben NO suspenden ningún plazo. <Link to="/validaciones">Ir a validar</Link>.
        </Aviso>
      )}

      {vencen.length > 0 && (
        <Aviso tipo="info" titulo={`${vencen.length} plazo(s) vencen en 3 días o menos`}>
          {vencen
            .slice(0, 4)
            .map((l) => `${l.nombreLocal} (${fmtFecha(l.plazo.vencimiento)})`)
            .join(' · ')}
          {vencen.length > 4 && ` y ${vencen.length - 4} más`}
        </Aviso>
      )}

      {docsVencen.length > 0 && (
        <Aviso tipo="info" titulo={`${docsVencen.length} documento(s) vencen en los próximos 30 días`}>
          Cuando venzan, esos locales reingresan solos a primera notificación pendiente. Es el momento de avisarle al titular.
        </Aviso>
      )}

      {sinImprimir.some((l) => l.estado.endsWith('_GENERADA')) && (
        <Aviso tipo="info" titulo="Hay cédulas emitidas sin entregar">
          Recordá que una cédula generada y no entregada no hace correr ningún plazo: el circuito no avanza hasta la entrega
          efectiva. <Link to="/notificaciones">Ver la cola</Link>.
        </Aviso>
      )}

      {/* ---------- Las bandejas ---------- */}
      <div className="accesos-header accesos-header-accion">
        <span>Situaciones que requieren intervención</span>
        {/* El selector solo tiene sentido si hay más de una bandeja que ordenar. */}
        {bandejas.length > 1 && (
          <div className="selector-orden">
            <label htmlFor="tablero-orden">Ordenar</label>
            <select id="tablero-orden" value={orden} onChange={(e) => cambiarOrden(e.target.value)}>
              {ORDENES_BANDEJA.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.etiqueta}
                </option>
              ))}
            </select>
            <span className="selector-orden-ayuda">{ordenActual.ayuda}</span>
          </div>
        )}
      </div>

      {bandejas.length === 0 ? (
        <Vacio titulo="Tu rol no tiene bandejas asignadas">
          El tablero organiza el trabajo administrativo. Si sos relevador o notificador, tu pantalla es la de campo.
        </Vacio>
      ) : (
        bandejas.map((b) => <Bandeja key={b.id} bandeja={b} />)
      )}
    </>
  );
}

export default Tablero;
