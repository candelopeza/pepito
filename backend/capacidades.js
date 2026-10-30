/* ============================================================================
   backend/capacidades.js  —  QUÉ PARTES OPCIONALES DE LA BASE ESTÁN INSTALADAS
   ----------------------------------------------------------------------------
   La base del área no se toca sin permiso. Todo lo que este sistema necesita
   y la base no trae va en scripts OPCIONALES de la carpeta sql/, que alguien
   corre a mano desde HeidiSQL cuando el área lo aprueba.

   Este archivo es el que se entera de cuáles se corrieron. Pregunta a
   information_schema qué tablas y columnas existen, y el resto del backend
   consulta estas banderas antes de usarlas:

     auditoria   tabla `auditoria`            sql/05-tabla-auditoria.sql
     parametros  tabla `parametro`            sql/06-tabla-parametros.sql
     accesos     tablas `permisos_modulos` y
                 `tipos_usuario`              sql/07-tablas-accesos.sql
     impresion   columnas tramite.impresa_*   sql/04-columnas-opcionales.sql
     archivos    tabla `archivo`              sql/08-tabla-archivo.sql
     titularCuil columna local.titular_cuil   sql/12-titular-cuil.sql

   >>> POR QUÉ ASÍ Y NO "QUE FALLE SI FALTA" <<<
   Si el backend diera por hecho que la tabla existe, una base sin el script
   rompería pantallas enteras con un error de SQL. Así, la función queda
   apagada, la pantalla lo dice en una línea y el resto sigue andando. Cuando
   se corre el script, se prende sola: se vuelve a revisar cada 5 minutos, sin
   reiniciar el servidor.
   ============================================================================ */

import { consultar } from './conexion-bd.js';

const VACIO = {
  auditoria: false,
  parametros: false,
  accesos: false,
  impresion: false,
  archivos: false,
  titularCuil: false,
  revisadoEn: null,
  error: null,
};

let actual = { ...VACIO };

/* Lee el esquema y actualiza las banderas. Nunca tira: si la base no responde,
   deja todo apagado y guarda el motivo para mostrarlo en /salud. */
export async function revisarCapacidades() {
  try {
    const filas = await consultar(
      `SELECT table_name AS tabla, column_name AS columna
         FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND (table_name IN ('auditoria', 'parametro', 'permisos_modulos', 'tipos_usuario', 'archivo')
               OR (table_name = 'tramite' AND column_name IN ('impresa_por', 'impresa_en'))
               OR (table_name = 'local' AND column_name = 'titular_cuil'))`,
    );
    const hay = (tabla, columna) =>
      filas.some((f) => String(f.tabla).toLowerCase() === tabla && (!columna || String(f.columna).toLowerCase() === columna));

    actual = {
      auditoria: hay('auditoria'),
      parametros: hay('parametro'),
      accesos: hay('permisos_modulos') && hay('tipos_usuario'),
      impresion: hay('tramite', 'impresa_por') && hay('tramite', 'impresa_en'),
      archivos: hay('archivo'),
      titularCuil: hay('local', 'titular_cuil'),
      revisadoEn: new Date().toISOString(),
      error: null,
    };
  } catch (e) {
    actual = { ...VACIO, revisadoEn: new Date().toISOString(), error: e.message, codigoError: e.code ?? null };
  }
  return capacidades();
}

/* Copia de las banderas. Se devuelve copia para que nadie las modifique desde
   afuera por accidente. */
export function capacidades() {
  return { ...actual };
}

/* Atajo para las rutas: tiene('auditoria') */
export function tiene(nombre) {
  return Boolean(actual[nombre]);
}

/* Revisión periódica. `unref` para que el temporizador no impida cerrar el
   proceso (por ejemplo al correr un script de prueba que importa este módulo). */
export function vigilarCapacidades(cadaMs = 5 * 60 * 1000) {
  const t = setInterval(() => {
    revisarCapacidades();
  }, cadaMs);
  t.unref?.();
  return t;
}
