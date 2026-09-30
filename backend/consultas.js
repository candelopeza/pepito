/* ============================================================================
   backend/consultas.js  —  LAS LECTURAS QUE USA MÁS DE UNA RUTA
   ----------------------------------------------------------------------------
   Acá viven las consultas compuestas (las que hacen JOIN con los catálogos) y
   las escrituras que tienen que ser atómicas. Las rutas las llaman y se
   dedican a traducir HTTP; el SQL está en un solo lugar.

   DOS COSAS QUE SE REPITEN EN TODAS LAS CONSULTAS Y NO SON OPCIONALES:

   1. `habilita = 1`. Esta base usa BAJA LÓGICA: nada se borra, se marca. Una
      consulta que se olvida el filtro muestra locales dados de baja como si
      estuvieran activos.

   2. El JOIN con `estado` y `tipo_tramite`. Las rutas devuelven el nombre del
      estado además del id, porque el front muestra texto y no números.

   LA ÚNICA TABLA QUE ESTE SISTEMA AGREGÓ A LA BASE ES `feriado`. Todo lo demás
   sale de las diez tablas del área o se resuelve en el backend.
   ============================================================================ */

import { consultar } from './conexion-bd.js';
import { PARAMETROS, PLANTILLA_CEDULA } from './parametros-sistema.js';
import { aActuacionFront, aLocalFront, estadoDeLocal, ID_TTRAMITE, SERIE_CEDULA } from './mapeo.js';

/* ---------------------------------------------------------------------------
   LOCALES
   --------------------------------------------------------------------------- */

/* El SELECT del padrón. El rubro viene resuelto a texto con un LEFT JOIN
   (LEFT y no INNER: un local sin rubro cargado tiene que aparecer igual). */
const SQL_LOCAL = `
  SELECT l.*, r.nombre_rubro
    FROM local l
    LEFT JOIN rubro r ON r.id_rubro = l.id_rubro AND r.habilita = 1
   WHERE l.habilita = 1`;

export async function locales() {
  const filas = await consultar(`${SQL_LOCAL} ORDER BY l.id_local`);
  return filas.map(aLocalFront);
}

export async function localPorId(idLocal) {
  const [fila] = await consultar(`${SQL_LOCAL} AND l.id_local = ?`, [idLocal]);
  return fila ? aLocalFront(fila) : null;
}

/* Busca un local aunque esté dado de baja. Lo necesita la fusión de duplicados,
   que trabaja justamente sobre fichas desactivadas. */
export async function localPorIdIncluyendoBajas(idLocal) {
  const [fila] = await consultar(
    `SELECT l.*, r.nombre_rubro FROM local l
       LEFT JOIN rubro r ON r.id_rubro = l.id_rubro
      WHERE l.id_local = ?`,
    [idLocal],
  );
  return fila ? aLocalFront(fila) : null;
}

/* ---------------------------------------------------------------------------
   TRÁMITES  (= actuaciones del front)
   --------------------------------------------------------------------------- */

/* Trae el nombre del estado y el del tipo, y el usuario que lo registró.
   `usuario` no tiene columna de nombre: guarda id_persona, que es el
   identificador de la persona en el padrón municipal. Hasta que exista
   CiDiTuc, eso es lo que se muestra. */
const SQL_TRAMITE = `
  SELECT t.*, e.nombre_estado, tt.nombre_ttramite, u.id_persona AS nombre_usuario
    FROM tramite t
    LEFT JOIN estado e        ON e.id_estado = t.id_estado
    LEFT JOIN tipo_tramite tt ON tt.id_ttramite = t.id_ttramite
    LEFT JOIN usuario u       ON u.id_usuario = t.id_usuario
   WHERE t.habilita = 1`;

/* Los datos del documento cuelgan de la tabla `documentacion`, que está aparte
   del trámite. Se traen todos juntos y se indexan por id_tramite: así el
   traductor los encuentra sin hacer una consulta por trámite. */
async function documentosPorTramite(idLocal = null) {
  const sql = idLocal
    ? `SELECT d.* FROM documentacion d
         JOIN tramite t ON t.id_tramite = d.id_tramite
        WHERE t.id_local = ? AND t.habilita = 1`
    : 'SELECT d.* FROM documentacion d';
  const filas = await consultar(sql, idLocal ? [idLocal] : []);
  return new Map(filas.map((d) => [d.idTramite, d]));
}

/* El orden cronológico importa: estadoDeLocal() se queda con el ÚLTIMO trámite
   del circuito, así que si el orden está mal, el estado sale mal. Se ordena
   por fecha y, ante empate, por id (que es secuencial). */
const ORDEN_CRONOLOGICO = 'ORDER BY t.fecha_inicio, t.id_tramite';

export async function tramitesDeLocal(idLocal) {
  const [filas, docs] = await Promise.all([
    consultar(`${SQL_TRAMITE} AND t.id_local = ? ${ORDEN_CRONOLOGICO}`, [idLocal]),
    documentosPorTramite(idLocal),
  ]);
  return filas.map((f) => aActuacionFront(f, docs));
}

/* Todos los trámites del sistema, agrupados por local. Se usa para el listado
   del padrón: una sola consulta de 2.441 filas en vez de 2.220 consultas. */
export async function tramitesPorLocal() {
  const [filas, docs] = await Promise.all([
    consultar(`${SQL_TRAMITE} ${ORDEN_CRONOLOGICO}`),
    documentosPorTramite(),
  ]);
  const mapa = new Map();
  for (const fila of filas) {
    const actuacion = aActuacionFront(fila, docs);
    if (!mapa.has(actuacion.localId)) mapa.set(actuacion.localId, []);
    mapa.get(actuacion.localId).push(actuacion);
  }
  return mapa;
}

/* Trámites de un tipo puntual, de todos los locales. Lo usan las bandejas de
   notificaciones y de documentación. */
export async function tramitesPorTipo(idsTipo) {
  const marcadores = idsTipo.map(() => '?').join(',');
  const [filas, docs] = await Promise.all([
    consultar(`${SQL_TRAMITE} AND t.id_ttramite IN (${marcadores}) ORDER BY t.fecha_inicio DESC, t.id_tramite DESC`, idsTipo),
    documentosPorTramite(),
  ]);
  return filas.map((f) => aActuacionFront(f, docs));
}

export async function tramitePorId(idTramite) {
  const [fila] = await consultar(`${SQL_TRAMITE} AND t.id_tramite = ?`, [idTramite]);
  if (!fila) return null;
  const docs = await documentosPorTramite(fila.idLocal);
  return aActuacionFront(fila, docs);
}

/* ---------------------------------------------------------------------------
   EL PADRÓN CON ESTADO  —  lo que consume la pantalla principal
   --------------------------------------------------------------------------- */
export async function localesConEstado() {
  const [lista, porLocal] = await Promise.all([locales(), tramitesPorLocal()]);
  return lista.map((local) => ({
    ...local,
    estado: estadoDeLocal(local, porLocal.get(local.id) ?? []),
  }));
}

/* ---------------------------------------------------------------------------
   PARÁMETROS Y FERIADOS
   ---------------------------------------------------------------------------
   Los necesita cualquier cálculo de plazo. Están en dos lugares distintos a
   propósito:

     parámetros  en el código (backend/parametros-sistema.js), porque cambian
                 muy de vez en cuando y siempre con intervención técnica
     feriados    en la base, porque los carga el área y no se pueden prever:
                 un asueto municipal puede salir con dos días de aviso
   --------------------------------------------------------------------------- */

/* Se mantiene como función async aunque hoy no consulte nada: el día que los
   parámetros pasen a una tabla, cambia solo el cuerpo de esta función y
   ninguna de las rutas que la llaman se entera. */
export async function parametros() {
  return { ...PARAMETROS, plantillaCedula: PLANTILLA_CEDULA };
}

/* El dominio espera [{ fecha, motivo, alcance }] (ver src/dominio/fechas.js). */
export async function feriados() {
  const filas = await consultar('SELECT * FROM feriado WHERE habilita = 1 ORDER BY fecha_feriado');
  return filas.map((f) => ({
    id: f.idFeriado,
    fecha: String(f.fechaFeriado).slice(0, 10),
    motivo: f.nombreFeriado,
    alcance: f.alcance,
  }));
}

/* ---------------------------------------------------------------------------
   NUMERACIÓN DE CÉDULAS  —  sin tabla de secuencias
   ---------------------------------------------------------------------------
   El número sale de MAX(correlativo) + 1 sobre los trámites ya cargados.

   EL PROBLEMA QUE HAY QUE EVITAR: si dos agentes emiten una cédula en el mismo
   instante, los dos leen el mismo máximo y las dos cédulas salen con el mismo
   número. El número de cédula es justamente el dato con el que un contribuyente
   impugna una notificación, así que no puede repetirse.

   CÓMO SE RESUELVE ACÁ: el backend es UN SOLO proceso Node, así que alcanza con
   encolar las emisiones en memoria. `turno` es una promesa que se va encadenando:
   cada emisión espera a que termine la anterior antes de leer el máximo. No hay
   dos lecturas simultáneas y por lo tanto no hay números repetidos.

   >>> LA CONDICIÓN QUE HAY QUE RESPETAR <<<
   Esto vale mientras corra UNA sola instancia del backend. Si algún día se
   levantan dos procesos (por ejemplo detrás de un balanceador, o con PM2 en
   modo cluster), cada uno tendría su propia cola y la garantía desaparece. En
   ese escenario hace falta una tabla `secuencia` con SELECT ... FOR UPDATE.
   --------------------------------------------------------------------------- */
let turno = Promise.resolve();

export function enFila(trabajo) {
  const resultado = turno.then(trabajo, trabajo);
  // La cola no se puede cortar porque una emisión falle: se encadena el
  // resultado ya "domado" para que el siguiente en la fila arranque igual.
  turno = resultado.then(
    () => undefined,
    () => undefined,
  );
  return resultado;
}

/* Lee el último correlativo usado y devuelve el siguiente.
   Las cédulas se numeran '0001-675': SUBSTRING_INDEX(..., '-', -1) se queda
   con lo que hay después del último guion, que es el correlativo. */
export async function siguienteNumeroCedula(cx) {
  const [filas] = await cx.execute(
    `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(numero_referencia, '-', -1) AS UNSIGNED)), 0) AS ultimo
       FROM tramite
      WHERE id_ttramite IN (?, ?) AND numero_referencia LIKE ?`,
    [ID_TTRAMITE.PRIMERA_NOTIFICACION, ID_TTRAMITE.SEGUNDA_NOTIFICACION, `${SERIE_CEDULA}-%`],
  );
  return Number(filas[0].ultimo) + 1;
}

/* ---------------------------------------------------------------------------
   INSERTAR UN TRÁMITE
   ---------------------------------------------------------------------------
   Todas las acciones del circuito (emitir cédula, otorgar prórroga, registrar
   expediente) terminan insertando una fila en `tramite`. La forma es siempre
   la misma, así que está escrita una sola vez.

   `nro_ciclo` cuenta las vueltas del local por el circuito: cuando coordinación
   reingresa un local desde un expediente, la intimación arranca de cero y el
   ciclo sube. Sin eso no se distingue la primera notificación de esta vuelta
   de la del año pasado.
   --------------------------------------------------------------------------- */
export async function insertarTramite(cx, datos) {
  const sql = `
    INSERT INTO tramite
      (id_local, id_estado, id_usuario_asignado, id_ttramite, id_usuario, nro_ciclo,
       plazo_dias, direccion_relevada, domicilio_notificacion,
       longitud_relevamiento, latitud_relevamiento, numero_referencia,
       fecha_inicio, fecha_cierre, fecha_entrega, fecha_vencimiento, observaciones, habilita)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`;
  const [resultado] = await cx.execute(sql, [
    datos.idLocal,
    datos.idEstado,
    datos.idUsuarioAsignado ?? null,
    datos.idTtramite,
    datos.idUsuario ?? null,
    datos.nroCiclo ?? 1,
    datos.plazoDias ?? null,
    datos.direccionRelevada ?? null,
    datos.domicilioNotificacion ?? null,
    datos.longitudRelevamiento ?? null,
    datos.latitudRelevamiento ?? null,
    datos.numeroReferencia ?? null,
    datos.fechaInicio ?? null,
    datos.fechaCierre ?? null,
    datos.fechaEntrega ?? null,
    datos.fechaVencimiento ?? null,
    recortarObservacion(datos.observaciones ?? ''),
  ]);
  return resultado.insertId;
}

/* `tramite.observaciones` y `local.observacion` son varchar(150). Un texto más
   largo haría fallar la inserción entera (o la truncaría en silencio, según la
   configuración del servidor), así que se recorta acá, una sola vez. */
export function recortarObservacion(texto, limite = 150) {
  const valor = String(texto ?? '');
  return valor.length <= limite ? valor : `${valor.slice(0, limite - 1)}…`;
}

/* El ciclo actual de un local: el mayor nro_ciclo de sus trámites, o 1 si no
   tiene ninguno todavía. */
export async function cicloActual(idLocal) {
  const [fila] = await consultar(
    'SELECT COALESCE(MAX(nro_ciclo), 1) AS ciclo FROM tramite WHERE id_local = ? AND habilita = 1',
    [idLocal],
  );
  return Number(fila?.ciclo) || 1;
}

/* ¿Cuántas prórrogas lleva el local en este ciclo? Lo necesita el tope de
   parametros-sistema.js (maxProrrogasPorLocal). */
export async function prorrogasDelCiclo(idLocal, ciclo) {
  const [fila] = await consultar(
    'SELECT COUNT(*) AS total FROM tramite WHERE id_local = ? AND id_ttramite = ? AND nro_ciclo = ? AND habilita = 1',
    [idLocal, ID_TTRAMITE.PRORROGA, ciclo],
  );
  return Number(fila?.total) || 0;
}
