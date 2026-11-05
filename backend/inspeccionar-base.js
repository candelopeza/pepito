/* ============================================================================
   backend/inspeccionar-base.js  —  RADIOGRAFÍA DE LA BASE EXISTENTE
   ----------------------------------------------------------------------------
   Herramienta de lectura. Recorre la base indicada en DB_NOMBRE y escribe en
   pantalla, para cada tabla: sus columnas con tipo, las claves primarias y
   foráneas, y cuántas filas tiene.

   Sirve para conocer un esquema que ya existe y no se documentó, que es el paso
   previo a adaptar el backend para que lo consulte.

     cd backend
     npm run inspeccionar

   NO modifica nada: solo SELECT sobre information_schema.
   ============================================================================ */

import './entorno.js';
import mysql from 'mysql2/promise';

const baseDatos = process.env.DB_NOMBRE || 'grandes_generadores';

const conexion = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PUERTO) || 3306,
  user: process.env.DB_USUARIO,
  password: process.env.DB_CLAVE,
  database: baseDatos,
  connectTimeout: 8000,
});

// information_schema es una base virtual que todo MariaDB/MySQL tiene: describe
// la estructura de las demás bases. Se consulta como cualquier tabla.
const [columnas] = await conexion.query(
  `SELECT table_name AS tabla, column_name AS columna, column_type AS tipo,
          is_nullable AS admiteNulo, column_key AS clave, column_default AS pordefecto,
          extra, column_comment AS comentario
     FROM information_schema.columns
    WHERE table_schema = ?
    ORDER BY table_name, ordinal_position`,
  [baseDatos]
);

// Las claves foráneas viven en otra tabla del mismo catálogo.
const [foraneas] = await conexion.query(
  `SELECT table_name AS tabla, column_name AS columna,
          referenced_table_name AS tablaDestino, referenced_column_name AS columnaDestino
     FROM information_schema.key_column_usage
    WHERE table_schema = ? AND referenced_table_name IS NOT NULL`,
  [baseDatos]
);

// Agrupo las columnas por tabla para imprimirlas juntas.
const porTabla = new Map();
for (const c of columnas) {
  if (!porTabla.has(c.tabla)) porTabla.set(c.tabla, []);
  porTabla.get(c.tabla).push(c);
}

console.log('BASE: %s  (%d tablas)\n', baseDatos, porTabla.size);

for (const [tabla, cols] of porTabla) {
  const [[{ total }]] = await conexion.query(`SELECT COUNT(*) AS total FROM \`${tabla}\``);
  console.log('=== %s  (%d filas) ===', tabla, total);
  for (const c of cols) {
    const marcas = [
      c.clave === 'PRI' ? 'PK' : '',
      c.clave === 'UNI' ? 'unica' : '',
      c.admiteNulo === 'NO' ? 'obligatoria' : '',
      c.extra || '',
      c.comentario ? `// ${c.comentario}` : '',
    ].filter(Boolean).join(' ');
    console.log('   %s %s %s', c.columna.padEnd(28), c.tipo.padEnd(34), marcas);
  }
  const fks = foraneas.filter((f) => f.tabla === tabla);
  for (const f of fks) {
    console.log('   FK: %s -> %s.%s', f.columna, f.tablaDestino, f.columnaDestino);
  }
  console.log('');
}

await conexion.end();
