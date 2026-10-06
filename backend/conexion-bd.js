/* ============================================================================
   backend/conexion-bd.js  —  LA CONEXIÓN A MARIADB
   ----------------------------------------------------------------------------
   Único lugar del backend que sabe cómo se llega a la base. Todas las rutas
   importan `consultar()` de acá y no abren conexiones por su cuenta.

   Usa un POOL: un puñado de conexiones abiertas que se reparten entre los
   pedidos. Abrir una conexión por cada request es lento y MariaDB tiene un
   límite de conexiones simultáneas.

   Los datos de acceso salen del archivo .env (ver .env.ejemplo). La base y las
   tablas se crean a mano desde HeidiSQL con los scripts de la carpeta sql/.
   ============================================================================ */

import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PUERTO) || 3306,
  user: process.env.DB_USUARIO || 'root',
  password: process.env.DB_CLAVE || '',
  database: process.env.DB_NOMBRE || 'grandes_generadores',
  connectionLimit: 10,
  // Las fechas vuelven como texto 'YYYY-MM-DD' en vez de objetos Date con
  // zona horaria. El dominio (src/dominio/fechas.js) trabaja con ese formato.
  dateStrings: true,
  // Permite pasar varias sentencias en una sola llamada. Se usa poco; queda
  // en false a propósito para que un parámetro mal escapado no encadene SQL.
  multipleStatements: false,
});

/* ---------------------------------------------------------------------------
   CUANDO NO SE LLEGA A LA BASE
   ---------------------------------------------------------------------------
   Si la computadora no está en la red de la municipalidad, si MariaDB está
   apagado o si la clave del .env es otra, TODOS los pedidos fallan igual.
   Antes eso salía como una traza larga repetida por cada pedido y, en la
   pantalla, como "Error interno del servidor". problemaDeConexion() traduce
   el código del error a una frase que dice qué revisar; servidor.js la manda
   a la pantalla (503) y la escribe UNA vez en la consola. Devuelve null si el
   error no es de conexión. */
const DONDE = `${process.env.DB_HOST || '127.0.0.1'}:${Number(process.env.DB_PUERTO) || 3306}`;
const PROBLEMAS_DE_CONEXION = {
  ETIMEDOUT: `No se llega a la base de datos (${DONDE}): no responde. ¿Esta computadora está conectada a la red de la municipalidad (o a la VPN)?`,
  EHOSTUNREACH: `No se llega a la base de datos (${DONDE}): no hay camino de red. ¿Esta computadora está conectada a la red de la municipalidad (o a la VPN)?`,
  ENETUNREACH: `No se llega a la base de datos (${DONDE}): no hay camino de red. ¿Esta computadora está conectada a la red de la municipalidad (o a la VPN)?`,
  ENOTFOUND: `No se encuentra el servidor de la base (${DONDE}). Revisá DB_HOST en backend/.env.`,
  ECONNREFUSED: `El servidor de la base (${DONDE}) rechazó la conexión: MariaDB está apagado o escucha en otro puerto (DB_PUERTO).`,
  PROTOCOL_CONNECTION_LOST: `Se cortó la conexión con la base de datos (${DONDE}). Reintentá en unos segundos.`,
  ER_ACCESS_DENIED_ERROR: 'La base rechazó el usuario o la clave: revisá DB_USUARIO y DB_CLAVE en backend/.env.',
  ER_BAD_DB_ERROR: 'La base de datos indicada no existe en el servidor: revisá DB_NOMBRE en backend/.env.',
};

export function problemaDeConexion(error) {
  return PROBLEMAS_DE_CONEXION[error?.code] ?? null;
}

/* Ejecuta una consulta con parámetros y devuelve las filas con las columnas en
   camelCase, que es como las espera el dominio y el front.

   Ejemplo:
     const filas = await consultar('SELECT * FROM locales WHERE id = ?', [id]);
*/
export async function consultar(sql, parametros = []) {
  const [filas] = await pool.execute(sql, parametros);
  return Array.isArray(filas) ? filas.map(aCamel) : filas;
}

/* Igual que consultar() pero sobre una conexión puntual, la de una transacción
   abierta con enTransaccion(). Hace falta para leer lo que la transacción
   acaba de escribir y todavía no confirmó: por ejemplo, el estado del local
   DESPUÉS de un acto, para anotarlo en la auditoría (ver backend/actos.js).
   Si no se pasa conexión, se comporta exactamente como consultar(). */
export async function consultarEn(cx, sql, parametros = []) {
  if (!cx) return consultar(sql, parametros);
  const [filas] = await cx.execute(sql, parametros);
  return Array.isArray(filas) ? filas.map(aCamel) : filas;
}

/* Igual que consultar() pero para INSERT/UPDATE/DELETE: devuelve el resultado
   crudo (insertId, affectedRows). */
export async function ejecutar(sql, parametros = []) {
  const [resultado] = await pool.execute(sql, parametros);
  return resultado;
}

/* Corre varias sentencias en una transacción: o entran todas o ninguna.
   La función recibe una conexión con .execute() y trabaja con ella.

   Ejemplo:
     await enTransaccion(async (cx) => {
       await cx.execute('INSERT INTO actuaciones ...', [...]);
       await cx.execute('UPDATE secuencias ...', [...]);
     });
*/
export async function enTransaccion(trabajo) {
  const cx = await pool.getConnection();
  try {
    await cx.beginTransaction();
    const resultado = await trabajo(cx);
    await cx.commit();
    return resultado;
  } catch (e) {
    await cx.rollback();
    throw e;
  } finally {
    cx.release();
  }
}

/* --- ayudantes -------------------------------------------------------------- */

/* nombre_local -> nombreLocal. Las columnas de MariaDB van en snake_case (es
   la convención de la base) y el código JS en camelCase. Esta función es el
   único puente entre las dos. */
export function aCamel(fila) {
  if (!fila || typeof fila !== 'object') return fila;
  const salida = {};
  for (const [clave, valor] of Object.entries(fila)) {
    const nueva = clave.replace(/_([a-z0-9])/g, (_, letra) => letra.toUpperCase());
    salida[nueva] = valor;
  }
  return salida;
}

/* nombreLocal -> nombre_local. Para armar INSERT/UPDATE desde un objeto JS. */
export function aSnake(texto) {
  return texto.replace(/[A-Z]/g, (letra) => `_${letra.toLowerCase()}`);
}
