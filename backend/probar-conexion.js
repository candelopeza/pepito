/* ============================================================================
   backend/probar-conexion.js  —  DIAGNÓSTICO DE LA CONEXIÓN A LA BASE
   ----------------------------------------------------------------------------
   No forma parte de la API: es una herramienta para correr a mano cuando algo
   no conecta. Se ejecuta con:

     cd backend
     npm run probar

   Hace tres cosas, en orden, y se detiene en la primera que falle:
     1. Se conecta al servidor con los datos del .env.
     2. Comprueba que exista la base indicada en DB_NOMBRE.
     3. Lista las tablas y las compara con las que el backend espera encontrar.

   NUNCA modifica nada: son todas consultas de lectura.
   ============================================================================ */

import mysql from 'mysql2/promise';

// Las tablas que ya tenía la base, cargadas por el área.
const TABLAS_ESPERADAS = [
  'documentacion', 'estado', 'local', 'objeto', 'rubro',
  'tipo_documentacion', 'tipo_tramite', 'tipo_usuario', 'tramite', 'usuario',
];

// La única tabla que agrega el sistema, con sql/03-tabla-feriado.sql. Se lista
// aparte porque su ausencia tiene una solución concreta (correr ese script) y
// no es lo mismo que falte una tabla del área.
const TABLAS_DEL_SISTEMA = ['feriado'];

const config = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PUERTO) || 3306,
  user: process.env.DB_USUARIO || 'root',
  password: process.env.DB_CLAVE || '',
  connectTimeout: 8000,
};

console.log('Conectando a %s@%s:%s ...', config.user, config.host, config.port);

let conexion;
try {
  conexion = await mysql.createConnection(config);
  console.log('  [OK] El servidor respondió y aceptó el usuario.\n');
} catch (e) {
  console.error('  [FALLA] No se pudo conectar:', e.code);
  console.error('  ' + e.message + '\n');
  // Los tres errores que aparecen siempre, con su causa concreta.
  if (e.code === 'ER_ACCESS_DENIED_ERROR') console.error('  -> Revisá DB_USUARIO y DB_CLAVE en el .env.');
  if (e.code === 'ECONNREFUSED') console.error('  -> Revisá DB_HOST y DB_PUERTO, o si el servidor está encendido.');
  if (e.code === 'ETIMEDOUT') console.error('  -> No hay ruta al servidor: ¿estás en la red de la Municipalidad o con la VPN?');
  process.exit(1);
}

// --- La base existe? ---------------------------------------------------------
const nombreBase = process.env.DB_NOMBRE || 'grandes_generadores';
const [bases] = await conexion.query('SHOW DATABASES');
const listaBases = bases.map((fila) => Object.values(fila)[0]);

if (!listaBases.includes(nombreBase)) {
  console.error('[FALLA] No existe una base llamada "%s" en este servidor.', nombreBase);
  console.error('Las bases que ve este usuario son:');
  for (const b of listaBases) console.error('  -', b);
  console.error('\n-> Corregí DB_NOMBRE en el .env con el nombre exacto (respetando mayúsculas).');
  await conexion.end();
  process.exit(1);
}
console.log('Base "%s": [OK] existe.\n', nombreBase);

// --- Qué tablas tiene, y cuántas filas hay en cada una ------------------------
await conexion.changeUser({ database: nombreBase });
const [tablas] = await conexion.query('SHOW TABLES');
const listaTablas = tablas.map((fila) => Object.values(fila)[0]);

console.log('Tablas que espera el backend:');
const faltantes = [];
for (const tabla of TABLAS_ESPERADAS) {
  if (listaTablas.includes(tabla)) {
    const [[{ total }]] = await conexion.query(`SELECT COUNT(*) AS total FROM \`${tabla}\``);
    console.log('  [OK]    %s (%d filas)', tabla.padEnd(15), total);
  } else {
    faltantes.push(tabla);
    console.log('  [FALTA] %s', tabla);
  }
}

// Tablas que están en la base pero el backend no conoce: no son un error, pero
// conviene verlas por si hay una diferencia de nombre (ej. "local" vs "locales").
const extra = listaTablas.filter((t) => !TABLAS_ESPERADAS.includes(t) && !TABLAS_DEL_SISTEMA.includes(t));
if (extra.length) {
  console.log('\nTablas que hay en la base y el backend no usa:');
  for (const t of extra) console.log('  -', t);
}

// --- Las tablas que agrega el sistema ----------------------------------------
console.log('\nTabla que agrega el sistema (sql/03-tabla-feriado.sql):');
const faltanDelSistema = [];
for (const tabla of TABLAS_DEL_SISTEMA) {
  if (listaTablas.includes(tabla)) {
    const [[{ total }]] = await conexion.query(`SELECT COUNT(*) AS total FROM \`${tabla}\``);
    console.log('  [OK]    %s (%d filas)', tabla.padEnd(15), total);
  } else {
    faltanDelSistema.push(tabla);
    console.log('  [FALTA] %s', tabla);
  }
}

if (faltantes.length) {
  console.log(`\nRESULTADO: faltan ${faltantes.length} tabla(s) del área. Las rutas que las usen van a fallar.`);
} else if (faltanDelSistema.length) {
  console.log('\nRESULTADO: la base del área está completa, pero falta la tabla de feriados.');
  console.log('-> Abrir HeidiSQL y correr backend/sql/03-tabla-feriado.sql (Archivo > Cargar archivo SQL > F9).');
  console.log('   Ese script solo crea esa tabla: no toca ninguna de las que ya tenés.');
  console.log('   Sin ella, todo lo que calcule un vencimiento va a fallar.');
} else {
  console.log('\nRESULTADO: todo en orden. Ya podés arrancar el backend con "npm run dev".');
}

await conexion.end();
