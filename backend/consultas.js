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

   LA ÚNICA TABLA OBLIGATORIA QUE ESTE SISTEMA AGREGÓ A LA BASE ES `feriado`.
   Las demás (auditoria, parametro, archivo, permisos) son OPCIONALES: se usan
   si el script correspondiente de sql/ se corrió (ver backend/capacidades.js).
   ============================================================================ */

import { consultar, consultarEn } from './conexion-bd.js';
import { PARAMETROS, PLANTILLA_CEDULA } from './parametros-sistema.js';
import { aActuacionFront, aLocalFront, estadoDeLocal, ID_TTRAMITE, SERIE_CEDULA } from './mapeo.js';
import { tiene } from './capacidades.js';
import { archivosPorTramite } from './archivos.js';

/* >>> EL PARÁMETRO `cx` QUE APARECE EN VARIAS FUNCIONES <<<
   Es opcional. Sin él, la consulta va al pool como siempre. Con él, corre
   dentro de la transacción abierta, y ve lo que esa transacción escribió y
   todavía no confirmó. backend/actos.js lo usa para medir el estado del local
   antes y después de cada acto, dentro de la misma transacción. */

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

export async function locales(cx = null) {
  const filas = await consultarEn(cx, `${SQL_LOCAL} ORDER BY l.id_local`);
  return agregarDatosDeBloqueo(filas.map(aLocalFront), cx);
}

export async function localPorId(idLocal, cx = null) {
  const [fila] = await consultarEn(cx, `${SQL_LOCAL} AND l.id_local = ?`, [idLocal]);
  if (!fila) return null;
  const [local] = await agregarDatosDeBloqueo([aLocalFront(fila)], cx);
  return local;
}

/* EL ESTADO CONGELADO DE LOS LOCALES BLOQUEADOS.

   Un local bloqueado tiene que quedarse en el estado que tenía al bloquearlo
   (sección 3.4). Ese estado no está en ninguna columna del local: lo anota la
   auditoría en el momento del bloqueo, así que se lee de ahí. De paso se trae
   CUÁNDO se bloqueó, que la ficha muestra y la tabla `local` no guarda.

   Sin la tabla `auditoria` no hay de dónde sacarlo y los locales quedan como
   antes: con el estado de local.id_estado. Son pocos locales (los bloqueados),
   así que son dos consultas chicas. */
async function agregarDatosDeBloqueo(lista, cx = null) {
  const bloqueados = lista.filter((l) => l.bloqueado).map((l) => l.id);
  if (!bloqueados.length || !tiene('auditoria')) return lista;

  const marcas = bloqueados.map(() => '?').join(',');
  const [ultimos, bloqueos] = await Promise.all([
    consultarEn(
      cx,
      `SELECT a.id_local, a.estado_nuevo
         FROM auditoria a
         JOIN (SELECT id_local, MAX(id_auditoria) AS ultimo
                 FROM auditoria WHERE id_local IN (${marcas}) GROUP BY id_local) u
           ON u.ultimo = a.id_auditoria`,
      bloqueados,
    ),
    consultarEn(
      cx,
      `SELECT id_local, MAX(momento) AS momento
         FROM auditoria
        WHERE accion = 'bloquear' AND id_local IN (${marcas})
        GROUP BY id_local`,
      bloqueados,
    ),
  ]);

  const congelado = new Map(ultimos.map((f) => [f.idLocal, f.estadoNuevo]));
  const desde = new Map(bloqueos.map((f) => [f.idLocal, f.momento ? String(f.momento).replace(' ', 'T') : null]));
  return lista.map((l) =>
    l.bloqueado ? { ...l, estadoCongelado: congelado.get(l.id) ?? null, bloqueadoEn: desde.get(l.id) ?? null } : l,
  );
}

/* El rubro de un formulario puede llegar de dos formas: el id del catálogo
   (rubroId: 4) o el nombre ('GASTRONOMIA'). Las dos valen. Si no se encuentra,
   se usa SIN INFORMAR (id 1) en vez de fallar: el padrón no se frena porque
   falte una fila de catálogo. El local queda en datos incompletos y la
   oficina lo completa. */
export async function idDeRubro({ rubroId, rubro } = {}, cx = null) {
  const id = Number(rubroId);
  if (Number.isInteger(id) && id > 0) {
    const [fila] = await consultarEn(cx, 'SELECT id_rubro FROM rubro WHERE id_rubro = ? AND habilita = 1', [id]);
    if (fila) return fila.idRubro;
  }
  if (rubro) {
    const [fila] = await consultarEn(cx, 'SELECT id_rubro FROM rubro WHERE nombre_rubro = ? AND habilita = 1', [
      String(rubro).trim().toUpperCase(),
    ]);
    if (fila) return fila.idRubro;
  }
  return 1;
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
async function documentosPorTramite(idLocal = null, cx = null) {
  const sql = idLocal
    ? `SELECT d.* FROM documentacion d
         JOIN tramite t ON t.id_tramite = d.id_tramite
        WHERE t.id_local = ? AND t.habilita = 1`
    : 'SELECT d.* FROM documentacion d';
  const filas = await consultarEn(cx, sql, idLocal ? [idLocal] : []);
  return new Map(filas.map((d) => [d.idTramite, d]));
}

/* El orden cronológico importa: estadoDeLocal() se queda con el ÚLTIMO trámite
   del circuito, así que si el orden está mal, el estado sale mal. Se ordena
   por fecha y, ante empate, por id (que es secuencial). */
const ORDEN_CRONOLOGICO = 'ORDER BY t.fecha_inicio, t.id_tramite';

/* Los archivos guardados (tabla opcional `archivo`, ver backend/archivos.js)
   se cuelgan de su actuación: en una notificación, la foto de la entrega como
   `evidencia`; en una DDJJ o un contrato, el documento respaldatorio como
   `archivo`. Siempre el último, con su id para pedirlo. Sin la tabla quedan
   en null como antes. */
const TIPOS_CON_ARCHIVO = ['NOTIFICACION', 'DDJJ', 'DDJJ_RECICLAJE', 'CONTRATO'];

async function conEvidencias(actuaciones, cx = null, todas = false) {
  if (!tiene('archivos')) return actuaciones;
  const ids = actuaciones.filter((a) => TIPOS_CON_ARCHIVO.includes(a.tipo)).map((a) => a.id);
  if (!ids.length) return actuaciones;
  const porTramite = await archivosPorTramite(todas ? null : ids, cx);
  return actuaciones.map((a) => {
    const lista = porTramite.get(a.id);
    if (!lista?.length) return a;
    const ultimo = lista[lista.length - 1];
    return a.tipo === 'NOTIFICACION' ? { ...a, evidencia: ultimo, evidencias: lista } : { ...a, archivo: ultimo };
  });
}

export async function tramitesDeLocal(idLocal, cx = null) {
  /* Van una detrás de la otra a propósito: dentro de una transacción comparten
     la misma conexión, que igual las ejecuta de a una. */
  const filas = await consultarEn(cx, `${SQL_TRAMITE} AND t.id_local = ? ${ORDEN_CRONOLOGICO}`, [idLocal]);
  const docs = await documentosPorTramite(idLocal, cx);
  return conEvidencias(filas.map((f) => aActuacionFront(f, docs)), cx);
}

/* Todo lo que hace falta para decidir un acto sobre un local: el local, sus
   trámites y el estado que resulta de los dos. Lo usan backend/actos.js y las
   rutas que necesitan el estado antes de responder. `local` es null si no
   existe o está dado de baja. */
export async function situacionDeLocal(idLocal, cx = null) {
  const local = await localPorId(idLocal, cx);
  if (!local) return { local: null, actuaciones: [], estado: null };
  const actuaciones = await tramitesDeLocal(idLocal, cx);
  return { local, actuaciones, estado: estadoDeLocal(local, actuaciones) };
}

/* Todos los trámites del sistema, agrupados por local. Se usa para el listado
   del padrón: una sola consulta de 2.441 filas en vez de 2.220 consultas. */
export async function tramitesPorLocal() {
  const [filas, docs] = await Promise.all([
    consultar(`${SQL_TRAMITE} ${ORDEN_CRONOLOGICO}`),
    documentosPorTramite(),
  ]);
  const mapa = new Map();
  for (const actuacion of await conEvidencias(filas.map((f) => aActuacionFront(f, docs)), null, true)) {
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
  return conEvidencias(filas.map((f) => aActuacionFront(f, docs)), null, true);
}

export async function tramitePorId(idTramite, cx = null) {
  const [fila] = await consultarEn(cx, `${SQL_TRAMITE} AND t.id_tramite = ?`, [idTramite]);
  if (!fila) return null;
  const docs = await documentosPorTramite(fila.idLocal, cx);
  const [actuacion] = await conEvidencias([aActuacionFront(fila, docs)], cx);
  return actuacion;
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

/* Los valores de backend/parametros-sistema.js, pisados por lo que la
   Dirección haya guardado desde la pantalla de Parámetros.

   Lo guardado vive en la tabla opcional `parametro` (sql/06-tabla-parametros.sql),
   una fila por clave con el valor en JSON. Si la tabla no existe, o una clave
   no está guardada, vale lo del archivo: el sistema arranca con los valores de
   siempre y la tabla solo guarda lo que se cambió.

   Ninguna ruta se enteró del cambio: todas llegan a los parámetros por acá. */
export const CLAVES_PARAMETRO = [...Object.keys(PARAMETROS), 'plantillaCedula', 'etiquetasEstado'];

export async function parametros(cx = null) {
  // etiquetasEstado: los nombres de estado que cambió el área (sección 3.1).
  const base = { ...PARAMETROS, plantillaCedula: PLANTILLA_CEDULA, etiquetasEstado: {} };
  if (!tiene('parametros')) return base;

  const filas = await consultarEn(cx, 'SELECT clave, valor FROM parametro');
  for (const { clave, valor } of filas) {
    if (!CLAVES_PARAMETRO.includes(clave)) continue;
    try {
      base[clave] = JSON.parse(valor);
    } catch {
      // Un valor que no es JSON válido (alguien lo editó a mano en HeidiSQL y
      // le faltaron las comillas) no puede voltear todos los cálculos de plazo:
      // se ignora y vale el del archivo.
    }
  }
  return base;
}

/* El dominio espera [{ fecha, motivo, alcance }] (ver src/dominio/fechas.js). */
export async function feriados(cx = null) {
  const filas = await consultarEn(cx, 'SELECT * FROM feriado WHERE habilita = 1 ORDER BY fecha_feriado');
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
export async function cicloActual(idLocal, cx = null) {
  const [fila] = await consultarEn(
    cx,
    'SELECT COALESCE(MAX(nro_ciclo), 1) AS ciclo FROM tramite WHERE id_local = ? AND habilita = 1',
    [idLocal],
  );
  return Number(fila?.ciclo) || 1;
}

/* ¿Cuántas prórrogas lleva el local en este ciclo? Lo necesita el tope de
   parametros-sistema.js (maxProrrogasPorLocal). */
export async function prorrogasDelCiclo(idLocal, ciclo, cx = null) {
  const [fila] = await consultarEn(
    cx,
    'SELECT COUNT(*) AS total FROM tramite WHERE id_local = ? AND id_ttramite = ? AND nro_ciclo = ? AND habilita = 1',
    [idLocal, ID_TTRAMITE.PRORROGA, ciclo],
  );
  return Number(fila?.total) || 0;
}
