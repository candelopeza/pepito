/* ============================================================================
   pages/Home.jsx  —  PANTALLA DE INICIO  (URL: /#/)
   ----------------------------------------------------------------------------
   El Inicio responde DOS preguntas, y nada más que dos:

       1. ¿QUÉ PUEDO INICIAR?        -> ACCIONES RÁPIDAS
       2. ¿QUÉ REQUIERE MI ATENCIÓN? -> PENDIENTES DE TRABAJO
                                        (y abajo, como contexto, INDICADORES)

   >>> LO QUE ESTA PANTALLA YA NO HACE <<<
   Antes dibujaba una tarjeta por cada módulo del rol (el viejo campo
   `enInicio` de config/modulos.js). Eran las mismas opciones que el menú
   lateral, en la misma pantalla, con otra forma: diez tarjetas que decían
   "Padrón de locales", "Relevamientos", "Documentación"... El Inicio era un
   índice del menú, no un lugar de trabajo. Se quitó.

   REPARTO DE RESPONSABILIDADES, para no volver a mezclarlas:
       INICIO        empezar algo / ver qué está esperando   (esta pantalla)
       MENÚ LATERAL  la navegación general                   (Sidebar.jsx)
       PANTALLAS     la operación y la consulta detallada
       TABLERO       la misma bandeja, pero con los locales adentro y sus
                     botones de acción (pages/Tablero.jsx)

   >>> LA DIFERENCIA CON EL TABLERO, QUE ES LA DUDA OBVIA <<<
   Las dos pantallas leen las MISMAS bandejas (DEFINICION_BANDEJAS en
   datos/vistas.js), así que nunca pueden contradecirse. Cambia la profundidad:
   acá se ve el número y se entra; en el Tablero se ve la lista de locales y se
   resuelve ahí mismo. Por eso el Inicio es una pasada de ojo y el Tablero es
   la pantalla donde uno se queda. El link al Tablero está en la cabecera de la
   sección de pendientes.

   >>> NADA DE ESTO ESTÁ ESCRITO ACÁ <<<
   Las acciones salen de ACCIONES_RAPIDAS (config/modulos.js), los pendientes
   de las bandejas y los números de indicadores() (datos/vistas.js). Esta
   pantalla solo los dibuja. Para agregar una acción rápida o cambiar quién ve
   qué, este archivo no se toca.

   CADA ROL VE LO SUYO sin ningún `if` de rol acá adentro: el filtrado ocurre
   en el origen (`accionesRapidasPara(rol)`, `bandejasPara(rol)`), que es la
   misma tabla de permisos que gobierna el menú y el bloqueo por URL.
   ============================================================================ */

import { Link, Navigate } from 'react-router-dom';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import AvisoInstalar from '../components/AvisoInstalar';
import Aviso, { Vacio } from '../components/ui/Aviso';
import { useRol } from '../auth/rolContexto';
import { useDatos } from '../datos/datosContexto';
import { accionesRapidasPara, puedeVerRuta, rolHabilitado } from '../config/modulos';

/* Días dentro de los cuales un plazo ya se considera "encima". Es el mismo
   umbral que usa el aviso del Tablero, para que las dos pantallas no discutan
   sobre qué es urgente. */
const DIAS_URGENTE = 3;

/* A dónde manda una tarjeta de pendientes, para ESTE rol.

   Una bandeja puede declarar `rutaPorRol` cuando el mismo pendiente se trabaja
   en pantallas distintas según quién sea: las cédulas para entregar las ve el
   administrativo en la pantalla de emisión y el notificador en la de campo.

   El `puedeVerRuta` del final no es paranoia: si una bandeja apuntara a un
   módulo que el rol no tiene, el link moriría en RutaProtegida y la tarjeta
   sería una trampa. Devolviendo undefined, <Card> se dibuja sin link (muestra
   el número, no navega), que es mucho mejor que un botón que rebota. */
function destinoDeBandeja(bandeja, rol, permisos) {
  const ruta = bandeja.rutaPorRol?.[rol] ?? bandeja.ruta;
  if (!ruta) return undefined;
  // El permiso se mira contra la ruta pelada: `?estado=...` no es parte del
  // path que declara config/modulos.js.
  return puedeVerRuta(rol, ruta.split('?')[0], permisos) ? ruta : undefined;
}

/* El renglón al pie de una tarjeta de pendientes. No agrega información nueva:
   mira los plazos de los locales que YA están en la bandeja y avisa si alguno
   está vencido o a punto. Es lo que hace que "Prórrogas vigentes: 4" se
   convierta en "4, y 2 vencen esta semana", que es lo que uno necesita saber
   para decidir si entra ahora o después.

   Devuelve null si no hay nada urgente: una tarjeta sin pie es una tarjeta
   tranquila, y eso también es información. */
function pieDePlazos(locales) {
  const vencidos = locales.filter((l) => l.plazo?.vencido).length;
  const proximos = locales.filter(
    (l) => l.plazo && !l.plazo.vencido && l.diasRestantes !== null && l.diasRestantes <= DIAS_URGENTE,
  ).length;

  if (vencidos === 0 && proximos === 0) return null;

  const partes = [];
  if (vencidos > 0) partes.push(`${vencidos} con el plazo vencido`);
  if (proximos > 0) partes.push(`${proximos} vence(n) en ${DIAS_URGENTE} día(s) o menos`);
  return partes.join(' · ');
}

function Home() {
  const { rol, datosRol, usuario } = useRol();

  const { bandejasPara, presentacionesPendientes, indicadores, permisos, usuarios } = useDatos();

  // Quién soy en la tabla de usuarios, igual que en Entregas: las cédulas se
  // asignan por id. Con un agente elegido en "Firmar como" es él; si no, se
  // busca por nombre.
  const yo = usuario.id ? usuarios.find((u) => u.id === usuario.id) : usuarios.find((u) => u.nombre === usuario.nombre);

  // Un tipo de usuario apagado desde Accesos entra y no ve nada. Se le avisa
  // en vez de mostrarle un Inicio vacío sin explicación.
  const habilitado = rolHabilitado(rol, permisos);

  // ===== A. QUÉ PUEDE INICIAR ESTE ROL =====
  const acciones = habilitado ? accionesRapidasPara(rol, permisos) : [];

  // ===== B. QUÉ ESTÁ ESPERANDO =====
  /* Por prioridad, que es el orden de urgencia administrativa definido en
     datos/vistas.js: primero lo que frena el circuito, después lo que hay que
     emitir, al final lo informativo. Las bandejas vacías se descartan: el
     Inicio tiene que mostrar lo que hay para hacer, no el catálogo completo de
     situaciones posibles (para eso está el Tablero, que las lista todas
     siempre en el mismo lugar). */
  // Solo lo que ESTE usuario puede resolver: al administrativo no se le cuentan
  // las exenciones que confirma coordinación, y al notificador solo sus cédulas.
  /* Y solo las bandejas cuya pantalla este rol todavía puede abrir: si el
     administrador le apagó Notificaciones desde Accesos, la tarjeta "Cola de
     emisión" desaparece con el módulo, igual que el ítem del menú. Antes
     quedaba la tarjeta con el número y sin link, que confundía. */
  const bandejasDelRol = habilitado
    ? bandejasPara(rol, 'prioridad', { soloTrabajo: true, idUsuario: yo?.id ?? null }).filter((b) =>
        destinoDeBandeja(b, rol, permisos),
      )
    : [];
  const bandejas = bandejasDelRol.filter((b) => b.locales.length > 0);

  /* La validación de presentaciones NO es una bandeja: no agrupa locales por
     estado, agrupa ACTUACIONES que entraron por el portal y esperan que un
     agente las apruebe. Va como una tarjeta más porque para el usuario es un
     pendiente igual que los otros, pero el dato sale de otro lado.

     Importa que esté a la vista: mientras una presentación está sin validar el
     plazo del local SIGUE CORRIENDO (sección 6.3 del pliego). */
  // Validar vive dentro de Documentación (la pestaña Validaciones se fusionó
  // ahí): el permiso que manda es el de ese módulo. Con '/validaciones', que
  // ya no es módulo, la tarjeta se veía aunque Documentación estuviera apagada.
  const puedeValidar = puedeVerRuta(rol, '/documentacion', permisos);
  const aValidar = puedeValidar ? presentacionesPendientes() : [];

  const totalPendientes = bandejas.reduce((n, b) => n + b.locales.length, 0) + aValidar.length;

  /* HAY UNA DIFERENCIA ENTRE "no tengo nada pendiente" Y "esto no va conmigo",
     y la pantalla tiene que decir cosas distintas en cada caso.

     El relevador y el titular no tienen NINGUNA bandeja asignada (las bandejas
     son trabajo de oficina): mostrarles un cartel de "no hay nada pendiente"
     sugiere que en algún momento va a aparecer algo ahí, y no es cierto. A esos
     perfiles no se les dibuja la sección.

     En cambio un administrativo con las bandejas en cero SÍ tiene que ver el
     cartel: "hoy no hay nada" es información que estaba esperando. */
  // El relevador ve la sección solo cuando le asignaron cédulas: entregar no
  // es su tarea de todos los días.
  const leCorrespondenPendientes =
    (bandejasDelRol.length > 0 && (rol !== 'relevador' || bandejas.length > 0)) || puedeValidar;

  // ===== C. LOS NÚMEROS DEL MES =====
  /* Los indicadores son del conjunto del organismo, no del usuario: los ve
     quien tiene acceso al tablero (oficina y dirección). Un relevador o un
     notificador no los necesita para su tarea, y al titular no le corresponden.
     Se decide con la misma tabla de permisos que todo lo demás. */
  const verIndicadores = puedeVerRuta(rol, '/tablero', permisos);
  const ind = verIndicadores ? indicadores() : null;

  /* El titular entra directo a su portal: es lo único que tiene para hacer,
     y el Inicio de oficina no le dice nada (sección 6.3). Quien entre sin ser
     personal del área (el público, vía CiDiTuc) cae acá con rol titular y va
     directo a lo suyo. Va después de todos los hooks: React exige que se
     llamen en el mismo orden en cada render.

     SOLO SI PUEDE ENTRAR AL PORTAL. Si el administrador deshabilitó el tipo de
     usuario titular (Accesos), el portal lo devuelve al Inicio con
     RutaProtegida; si el Inicio lo mandara al portal igual, la app quedaba
     rebotando entre las dos sin fin y el navegador se colgaba (pasó al mezclar
     las dos ramas el 22/10: había una segunda redirección sin esta condición).
     Deshabilitado, se queda acá y ve el aviso de tipo de usuario deshabilitado. */
  if (rol === 'titular' && habilitado && puedeVerRuta(rol, '/portal', permisos)) {
    return <Navigate to="/portal" replace />;
  }

  const fechaFormateada = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <>
      <PageHeader
        etiqueta="INICIO"
        titulo="SISTEMA DE GRANDES GENERADORES"
        subtitulo={
          /* Tres mensajes distintos para tres situaciones distintas. El tercero
             es para el relevador y el titular, que no tienen bandejas: decirles
             "no tenés nada esperando" sería contarles algo que no aplica. */
          !leCorrespondenPendientes
            ? datosRol.descripcion
            : rol === 'direccion'
              ? /* Dirección tiene lectura total y no ejecuta actos del circuito
                   (sección 7.2): las bandejas le muestran la situación del área,
                   no trabajo suyo. */
                `Situación del área: ${totalPendientes} caso(s) en las bandejas de trabajo.`
              : totalPendientes === 0
                ? 'No tenés nada esperando. Podés iniciar algo nuevo desde las acciones de abajo.'
                : `Tenés ${totalPendientes} caso(s) esperando una acción tuya.`
        }
      />

      {/* Solo en el teléfono y si la app todavía no está instalada. */}
      <AvisoInstalar />

      {!habilitado && (
        <Aviso tipo="alerta" titulo="Este tipo de usuario está deshabilitado">
          Lo apagó el administrador desde Accesos → Tipos de usuario. Hasta que lo vuelva a habilitar no hay módulos disponibles.
          {rol === 'administrador' && ' Como administrador conservás Tipos de usuario en el menú para poder revertirlo.'}
        </Aviso>
      )}

      {/* ---------- Quién sos y cuándo ----------
          Se mantiene tal cual estaba: es la referencia de con qué perfil se
          entró, y de eso depende todo lo que se ve más abajo. */}
      <div className="info-bar">
        <div className="admin-badge">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#1976d2">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
          <span>
            {usuario.nombre} · {datosRol.etiqueta}
          </span>
        </div>
        <span className="fecha">{fechaFormateada}</span>
      </div>

      {/* ======================================================================
          1. ACCIONES RÁPIDAS
          Van arriba porque es lo único que no depende de que haya datos: el
          sistema siempre se puede usar para empezar algo, incluso el primer
          día, con el padrón vacío.
          ====================================================================== */}
      {acciones.length > 0 && (
        <>
          <div className="accesos-header">
            <span>Acciones rápidas</span>
          </div>

          {/* Otra grilla y otra tarjeta que los pendientes, a propósito: estas
              no tienen número (no cuentan nada, arrancan algo) y llevan el "+"
              adelante. Ver App.css sección 7.b. */}
          <div className="grid-acciones">
            {acciones.map((a) => {
              const contenido = (
                <>
                  {/* Una página de afuera (ARCA) lleva su nombre en un cuadrado en vez del "+". */}
                  {a.logo ? (
                    <span className="card-accion-logo" aria-hidden="true">
                      {a.logo}
                    </span>
                  ) : (
                    <span className="card-accion-signo" aria-hidden="true">
                      +
                    </span>
                  )}
                  <span className="card-accion-texto">
                    <strong>{a.titulo}</strong>
                    <small>{a.descripcion}</small>
                  </span>
                </>
              );
              return a.externa ? (
                <a key={a.id} href={a.externa} target="_blank" rel="noreferrer" className="card-accion">
                  {contenido}
                </a>
              ) : (
                <Link key={a.id} to={a.ruta} className="card-accion">
                  {contenido}
                </Link>
              );
            })}
          </div>
        </>
      )}

      {/* ======================================================================
          2. PENDIENTES DE TRABAJO  —  la parte importante de la pantalla
          ====================================================================== */}
      {leCorrespondenPendientes && (
        <>
        <div className="accesos-header accesos-header-accion">
          <span>Pendientes de trabajo</span>
          {/* El Tablero es la versión profunda de esto mismo. El link va acá y no
              como una tarjeta más para que no parezca otro pendiente. */}
          {puedeVerRuta(rol, '/tablero', permisos) && (
            <Link to="/tablero" className="accesos-header-link">
              Abrir el tablero de trabajo →
            </Link>
          )}
        </div>

        {/* Las cédulas se asignan por persona: sin saber quién es, el
            notificador no tiene "suyas" para mostrar. */}

        {bandejas.length === 0 && aValidar.length === 0 ? (
          ['notificador', 'relevador'].includes(rol) ? (
            // El agente de campo solo tiene pendientes si le asignan cédulas.
            <Vacio titulo="No tenés cédulas para entregar"></Vacio>
          ) : (
            <Vacio titulo="No hay nada pendiente">
            </Vacio>
          )
        ) : (
          <div className="grid-accesos">
            {bandejas.map((b) => (
              <Card
                key={b.id}
                titulo={b.titulo}
                descripcion={b.descripcion}
                valor={b.locales.length}
                color={b.color}
                to={destinoDeBandeja(b, rol, permisos)}
                pie={pieDePlazos(b.locales)}
              />
            ))}

            {/* Va al final de la grilla y no en su propia sección: para el
                usuario es un pendiente más. */}
            {aValidar.length > 0 && (
              <Card
                titulo="Documentación para validar"
                descripcion="Presentaciones del portal que esperan aprobación de la oficina."
                valor={aValidar.length}
                color="amarillo"
                to="/documentacion"
                pie="Mientras no se aprueben, el plazo del local sigue corriendo."
              />
            )}
          </div>
        )}
        </>
      )}

      {/* ======================================================================
          3. INDICADORES DEL MES  —  información, no tareas
          Van al final justamente por eso: nadie tiene que hacer nada con un
          indicador. Si estuvieran arriba, empujarían los pendientes fuera de la
          primera pantalla.
          ====================================================================== */}
      {ind && (
        <>
          <div className="accesos-header">
            <span>Indicadores del mes</span>
          </div>

          <div className="grid-stats">
            <div className="stat-card stat-card-azul">
              <span className="stat-numero">{ind.relevamientosMes}</span>
              <span className="stat-label">Relevamientos del mes</span>
            </div>
            <div className="stat-card stat-card-azul">
              <span className="stat-numero">{ind.actuacionesMes}</span>
              <span className="stat-label">Actuaciones del mes</span>
            </div>
            <div className="stat-card stat-card-naranja">
              <span className="stat-numero">{ind.notificacionesMes}</span>
              <span className="stat-label">Notificaciones del mes</span>
            </div>
            <div className="stat-card stat-card-verde">
              <span className="stat-numero">{ind.exentos}</span>
              <span className="stat-label">Locales exentos</span>
            </div>
            <div className="stat-card stat-card-rojo">
              <span className="stat-numero">{ind.expedientes}</span>
              <span className="stat-label">Expedientes (total)</span>
            </div>
            <div className="stat-card stat-card-amarillo">
              <span className="stat-numero">{ind.datosIncompletos}</span>
              <span className="stat-label">Locales con datos incompletos</span>
            </div>
          </div>

          {/* Los indicadores completos, con corte por período y producción por
              agente, están en Reportes. Esta franja es el titular. */}
          {puedeVerRuta(rol, '/reportes', permisos) && (
            <p className="inicio-pie-indicadores">
              El detalle completo, con producción por agente, está en <Link to="/reportes">Reportes e indicadores</Link>.
            </p>
          )}
        </>
      )}
    </>
  );
}

export default Home;
