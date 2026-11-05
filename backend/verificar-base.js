/* ============================================================================
   backend/verificar-base.js  —  REVISIÓN DE LA BASE (SOLO LECTURA)
   ----------------------------------------------------------------------------
   Se corre desde la carpeta backend con:

       npm run verificar
       npm run verificar -- --desde=2026-08-01     (actos desde esa fecha)
       npm run verificar -- --archivo             (además guarda un .txt)

   Usa la misma conexión que el backend (backend/.env). Revisa lo que la guía
   pide para dar por buena la importación (capítulo 10, "Integridad de la
   importación"): cantidades, huérfanos, numeraciones, estados, debido proceso,
   datos del padrón, evidencias, y la lista de lo que se hizo desde la
   aplicación (para separar las pruebas de los datos reales).

   >>> NO MODIFICA NADA <<<
   Cada conexión se abre en modo SOLO LECTURA (SET SESSION TRANSACTION READ
   ONLY): si alguna consulta intentara escribir, MariaDB la rechazaría. Al
   empezar lo comprueba con una escritura que no toca ninguna fila; si la base
   la aceptara, el script se detiene sin seguir.
   ============================================================================ */

import './entorno.js';
import { writeFileSync } from 'node:fs';
import { pool, consultar } from './conexion-bd.js';
import { capacidades, revisarCapacidades } from './capacidades.js';
import { localesConEstado } from './consultas.js';
import { ID_ESTADO, ID_TTRAMITE } from './mapeo.js';
import { validarCuit } from './lector-informe-9dj.js';
import { ESTADOS, etiquetaEstado } from '../src/dominio/estados.js';
import { buscarDuplicados } from '../src/dominio/duplicados.js';

// Toda conexión nueva del pool, en solo lectura, antes de su primera consulta.
pool.on('connection', (conexion) => conexion.query('SET SESSION TRANSACTION READ ONLY'));

const argumento = (nombre) => process.argv.find((a) => a.startsWith(`--${nombre}`));
const DESDE = argumento('desde')?.split('=')[1] ?? null;
const GUARDAR = Boolean(argumento('archivo'));

const salida = [];
const decir = (texto = '') => {
  salida.push(texto);
  console.log(texto);
};
const titulo = (texto) => decir(`\n${texto}\n${'-'.repeat(texto.length)}`);
const miles = (n) => Number(n).toLocaleString('es-AR');
function dato(etiqueta, valor, problema = null) {
  const marca = problema === null ? '' : problema ? '   [REVISAR]' : '   [ok]';
  decir(`  ${`${etiqueta} `.padEnd(46, '.')} ${valor}${marca}`);
}
function lista(filas, formato, maximo = 15) {
  filas.slice(0, maximo).forEach((f) => decir(`      ${formato(f)}`));
  if (filas.length > maximo) decir(`      ... y ${filas.length - maximo} más${GUARDAR ? '' : ' (con --archivo salen todos)'}`);
}
const entero = (n) => Number(n ?? 0);

const NOTIFICACIONES = [ID_TTRAMITE.PRIMERA_NOTIFICACION, ID_TTRAMITE.SEGUNDA_NOTIFICACION];
const ENTREGA_EFECTIVA = [ID_ESTADO.NOTIF_ENTREGADA, ID_ESTADO.NOTIF_SIN_FIRMA, ID_ESTADO.NOTIF_FIJADA];

async function comprobarSoloLectura() {
  try {
    await consultar('UPDATE local SET id_local = id_local WHERE 1 = 0');
  } catch (e) {
    if (/READ ONLY/i.test(e.message) || e.code === 'ER_CANT_EXECUTE_IN_READ_ONLY_TRANSACTION') return true;
    throw e;
  }
  return false;
}

async function existeTabla(nombre) {
  const [f] = await consultar(
    'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
    [nombre],
  );
  return entero(f.n) > 0;
}

async function main() {
  if (!(await comprobarSoloLectura())) {
    console.error('La base aceptó una escritura de prueba: el modo solo lectura no funciona. No sigo.');
    process.exitCode = 2;
    return;
  }
  await revisarCapacidades();
  const cap = capacidades();
  const [{ base }] = await consultar('SELECT DATABASE() AS base');

  decir(`VERIFICACIÓN DE LA BASE ${base} (${process.env.DB_HOST ?? '127.0.0.1'}) · ${new Date().toLocaleString('es-AR')}`);
  decir('Solo lectura: no se modificó nada.');

  /* ---------------------------------------------------------------- 0 */
  titulo('0. SCRIPTS OPCIONALES CORRIDOS');
  const informe9dj = await existeTabla('informe_9dj');
  dato('sql/04 constancia de impresión', cap.impresion ? 'sí' : 'NO', !cap.impresion);
  dato('sql/05 historial de estados (auditoria)', cap.auditoria ? 'sí' : 'NO', !cap.auditoria);
  dato('sql/06 parámetros editables', cap.parametros ? 'sí' : 'NO', !cap.parametros);
  dato('sql/07 accesos', cap.accesos ? 'sí' : 'NO', !cap.accesos);
  dato('sql/08 fotos y documentos (archivo)', cap.archivos ? 'sí' : 'NO', !cap.archivos);
  dato('sql/09 informe 9 de Julio', informe9dj ? 'sí' : 'NO', !informe9dj);
  const bitacoraExpedientes = await existeTabla('expediente_novedad');
  dato('sql/10 bitácora de expedientes', bitacoraExpedientes ? 'sí' : 'NO', !bitacoraExpedientes);
  dato('sql/12 CUIL del titular habilitado', cap.titularCuil ? 'sí' : 'NO', !cap.titularCuil);

  /* ---------------------------------------------------------------- 1 */
  titulo('1. CANTIDADES (para comparar con el Excel de AppSheet)');
  const [loc] = await consultar(
    'SELECT SUM(habilita = 1) AS activos, SUM(habilita <> 1) AS bajas FROM local',
  );
  dato('Locales activos', miles(loc.activos));
  dato('Locales dados de baja', miles(loc.bajas ?? 0));
  const porTipo = await consultar(
    `SELECT tt.id_ttramite, tt.nombre_ttramite, COUNT(t.id_tramite) AS n
       FROM tipo_tramite tt LEFT JOIN tramite t ON t.id_ttramite = tt.id_ttramite AND t.habilita = 1
      GROUP BY tt.id_ttramite, tt.nombre_ttramite ORDER BY tt.id_ttramite`,
  );
  porTipo.forEach((f) => dato(`Trámites: ${f.nombreTtramite}`, miles(f.n)));
  const porDoc = await consultar(
    `SELECT td.nombre_tdocumentacion, COUNT(d.id_documentacion) AS n
       FROM tipo_documentacion td LEFT JOIN documentacion d ON d.id_tdocumentacion = td.id_tdocumentacion AND d.habilita = 1
      GROUP BY td.id_tdocumentacion, td.nombre_tdocumentacion ORDER BY td.id_tdocumentacion`,
  );
  porDoc.forEach((f) => dato(`Documentos: ${f.nombreTdocumentacion}`, miles(f.n)));
  const [usu] = await consultar('SELECT SUM(habilita = 1) AS n FROM usuario');
  dato('Usuarios activos', miles(usu.n ?? 0));

  /* ---------------------------------------------------------------- 2 */
  titulo('2. HUÉRFANOS (registros que apuntan a algo que no existe)');
  const huerfanos = [
    ['Trámites de un local que no existe', 'SELECT COUNT(*) AS n FROM tramite t LEFT JOIN local l ON l.id_local = t.id_local WHERE t.habilita = 1 AND l.id_local IS NULL'],
    ['Trámites activos de un local dado de baja', 'SELECT COUNT(*) AS n FROM tramite t JOIN local l ON l.id_local = t.id_local WHERE t.habilita = 1 AND l.habilita <> 1'],
    ['Documentos sin su trámite', 'SELECT COUNT(*) AS n FROM documentacion d LEFT JOIN tramite t ON t.id_tramite = d.id_tramite WHERE d.habilita = 1 AND t.id_tramite IS NULL'],
    ['Trámites con un estado que no existe', 'SELECT COUNT(*) AS n FROM tramite t LEFT JOIN estado e ON e.id_estado = t.id_estado WHERE t.habilita = 1 AND t.id_estado IS NOT NULL AND e.id_estado IS NULL'],
    ['Trámites de un tipo que no existe', 'SELECT COUNT(*) AS n FROM tramite t LEFT JOIN tipo_tramite tt ON tt.id_ttramite = t.id_ttramite WHERE t.habilita = 1 AND tt.id_ttramite IS NULL'],
    ['Trámites cargados por un usuario inexistente', 'SELECT COUNT(*) AS n FROM tramite t LEFT JOIN usuario u ON u.id_usuario = t.id_usuario WHERE t.habilita = 1 AND t.id_usuario IS NOT NULL AND u.id_usuario IS NULL'],
    ['Cédulas asignadas a un notificador inexistente', 'SELECT COUNT(*) AS n FROM tramite t LEFT JOIN usuario u ON u.id_usuario = t.id_usuario_asignado WHERE t.habilita = 1 AND t.id_usuario_asignado IS NOT NULL AND u.id_usuario IS NULL'],
    ['Locales con un rubro que no existe', 'SELECT COUNT(*) AS n FROM local l LEFT JOIN rubro r ON r.id_rubro = l.id_rubro WHERE l.habilita = 1 AND l.id_rubro IS NOT NULL AND r.id_rubro IS NULL'],
  ];
  for (const [etiqueta, sql] of huerfanos) {
    const [f] = await consultar(sql);
    dato(etiqueta, miles(f.n), entero(f.n) > 0);
  }

  /* ---------------------------------------------------------------- 3 */
  titulo('3. NUMERACIÓN');
  const cedulas = await consultar(
    `SELECT id_tramite, id_local, numero_referencia AS numero FROM tramite
      WHERE habilita = 1 AND id_ttramite IN (?, ?) AND numero_referencia IS NOT NULL AND numero_referencia <> ''`,
    NOTIFICACIONES,
  );
  const porSerie = new Map();
  const malFormadas = [];
  const usados = new Map();
  for (const c of cedulas) {
    const m = String(c.numero).trim().match(/^(\d+)-(\d+)$/);
    if (!m) {
      malFormadas.push(c);
      continue;
    }
    const clave = `${m[1]}-${Number(m[2])}`;
    usados.set(clave, [...(usados.get(clave) ?? []), c]);
    if (!porSerie.has(m[1])) porSerie.set(m[1], new Set());
    porSerie.get(m[1]).add(Number(m[2]));
  }
  const repetidas = [...usados.entries()].filter(([, l]) => l.length > 1);
  dato('Cédulas emitidas', miles(cedulas.length));
  dato('Números de cédula repetidos', repetidas.length, repetidas.length > 0);
  lista(repetidas, ([n, l]) => `${n}: trámites ${l.map((c) => `${c.idTramite} (local ${c.idLocal})`).join(', ')}`);
  dato('Números con formato distinto de 0001-123', malFormadas.length, malFormadas.length > 0);
  lista(malFormadas, (c) => `"${c.numero}" (trámite ${c.idTramite}, local ${c.idLocal})`);
  for (const [serie, numeros] of [...porSerie.entries()].sort()) {
    const max = Math.max(...numeros);
    const min = Math.min(...numeros);
    const saltos = [];
    for (let n = min; n <= max; n += 1) if (!numeros.has(n)) saltos.push(n);
    dato(`Serie ${serie}: del ${min} al ${max} (sigue el ${serie}-${max + 1})`, `${saltos.length} salto(s)`, saltos.length > 0);
    if (saltos.length) decir(`      faltan: ${saltos.slice(0, 30).map((n) => `${serie}-${n}`).join(', ')}${saltos.length > 30 ? ' ...' : ''}`);
  }

  const expedientes = await consultar(
    `SELECT id_tramite, id_local, TRIM(numero_referencia) AS numero FROM tramite
      WHERE habilita = 1 AND id_ttramite = ?`,
    [ID_TTRAMITE.EXPEDIENTE_MULTA],
  );
  const sinNumero = expedientes.filter((e) => !e.numero);
  const provisorios = expedientes.filter((e) => String(e.numero ?? '').toUpperCase().startsWith('PROV-'));
  const expPorNumero = new Map();
  expedientes.filter((e) => e.numero).forEach((e) => expPorNumero.set(e.numero, [...(expPorNumero.get(e.numero) ?? []), e]));
  const expRepetidos = [...expPorNumero.entries()].filter(([, l]) => l.length > 1);
  dato('Expedientes de multa', miles(expedientes.length));
  dato('Expedientes sin número', sinNumero.length, sinNumero.length > 0);
  dato('Expedientes provisorios (PROV-) sin reemplazar', provisorios.length, provisorios.length > 0);
  dato('Números de expediente repetidos', expRepetidos.length, expRepetidos.length > 0);
  lista(expRepetidos, ([n, l]) => `${n}: locales ${l.map((e) => e.idLocal).join(', ')}`);

  const ddjjRepetidas = await consultar(
    `SELECT d.numero, COUNT(DISTINCT t.id_local) AS locales, GROUP_CONCAT(DISTINCT t.id_local) AS ids
       FROM documentacion d JOIN tramite t ON t.id_tramite = d.id_tramite
      WHERE d.habilita = 1 AND t.habilita = 1 AND d.id_tdocumentacion IN (2, 4) AND d.numero IS NOT NULL AND d.numero <> ''
      GROUP BY d.id_tdocumentacion, d.numero HAVING COUNT(*) > 1`,
  );
  dato('Números de DDJJ repetidos', ddjjRepetidas.length, ddjjRepetidas.length > 0);
  lista(ddjjRepetidas, (f) => `N° ${f.numero}: locales ${f.ids}`);

  /* ---------------------------------------------------------------- 4 */
  titulo('4. ESTADOS (como los calcula el sistema)');
  const padron = await localesConEstado();
  const porEstado = new Map();
  padron.forEach((l) => porEstado.set(l.estado, (porEstado.get(l.estado) ?? 0) + 1));
  [...porEstado.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([codigo, n]) => dato(ESTADOS[codigo] ? etiquetaEstado(codigo) : `CÓDIGO DESCONOCIDO: ${codigo}`, miles(n), ESTADOS[codigo] ? null : true));

  /* ---------------------------------------------------------------- 5 */
  titulo('5. DEBIDO PROCESO (expediente sin dos entregas efectivas: error B-1)');
  const enExpediente = padron.filter((l) => ['GENERAR_EXPEDIENTE', 'EXPEDIENTE'].includes(l.estado));
  const efectivas = await consultar(
    `SELECT t.id_local, t.id_ttramite, COUNT(*) AS n
       FROM tramite t
       JOIN (SELECT id_local, MAX(COALESCE(nro_ciclo, 1)) AS ciclo FROM tramite WHERE habilita = 1 GROUP BY id_local) c
         ON c.id_local = t.id_local AND COALESCE(t.nro_ciclo, 1) = c.ciclo
      WHERE t.habilita = 1 AND t.id_ttramite IN (?, ?) AND t.id_estado IN (?, ?, ?)
      GROUP BY t.id_local, t.id_ttramite`,
    [...NOTIFICACIONES, ...ENTREGA_EFECTIVA],
  );
  const conEntrega = new Map();
  efectivas.forEach((f) => conEntrega.set(f.idLocal, new Set([...(conEntrega.get(f.idLocal) ?? []), f.idTtramite])));
  const sinDebidoProceso = enExpediente.filter((l) => (conEntrega.get(l.id)?.size ?? 0) < 2);
  dato('Locales en "Generar expediente" o "Expediente"', miles(enExpediente.length));
  dato('De ellos, sin las dos entregas efectivas', sinDebidoProceso.length, sinDebidoProceso.length > 0);
  lista(sinDebidoProceso, (l) => `local ${l.id} · ${l.nombreLocal} · ${etiquetaEstado(l.estado)}`);

  /* ---------------------------------------------------------------- 6 */
  titulo('6. DATOS DEL PADRÓN (locales activos)');
  const sinCuit = padron.filter((l) => !String(l.cuit ?? '').replace(/\D/g, ''));
  const cuitInvalido = padron.filter((l) => String(l.cuit ?? '').replace(/\D/g, '') && !validarCuit(l.cuit).valido);
  const sinRazon = padron.filter((l) => !String(l.razonSocial ?? '').trim());
  const sinRubro = padron.filter((l) => !l.rubro || /SIN INFORMAR/i.test(l.rubro));
  const sinUbicacion = padron.filter((l) => typeof l.latitud !== 'number' || typeof l.longitud !== 'number');
  dato('Sin CUIT', miles(sinCuit.length), sinCuit.length > 0);
  dato('CUIT con dígito verificador inválido', miles(cuitInvalido.length), cuitInvalido.length > 0);
  lista(cuitInvalido, (l) => `local ${l.id} · ${l.nombreLocal} · CUIT ${l.cuit}`, 10);
  dato('Sin razón social', miles(sinRazon.length), sinRazon.length > 0);
  dato('Sin rubro (o SIN INFORMAR)', miles(sinRubro.length), sinRubro.length > 0);
  dato('Sin ubicación en el mapa', miles(sinUbicacion.length), sinUbicacion.length > 0);
  const duplicados = buscarDuplicados(padron);
  dato('Posibles duplicados (nombre, calle y altura)', miles(duplicados.length), duplicados.length > 0);
  lista(duplicados, (p) => `${p.principal.id} y ${p.duplicado.id} · ${p.principal.nombreLocal} · ${p.principal.direccion}`, 10);

  /* ---------------------------------------------------------------- 7 */
  titulo('7. EVIDENCIAS (foto de las cédulas no entregadas)');
  const [noEnt] = await consultar(
    'SELECT COUNT(*) AS n FROM tramite WHERE habilita = 1 AND id_ttramite IN (?, ?) AND id_estado = ?',
    [...NOTIFICACIONES, ID_ESTADO.NOTIF_NO_ENTREGADA],
  );
  dato('Cédulas no entregadas', miles(noEnt.n));
  if (cap.archivos) {
    const [conFoto] = await consultar(
      `SELECT COUNT(DISTINCT t.id_tramite) AS n FROM tramite t JOIN archivo a ON a.id_tramite = t.id_tramite
        WHERE t.habilita = 1 AND t.id_ttramite IN (?, ?) AND t.id_estado = ?`,
      [...NOTIFICACIONES, ID_ESTADO.NOTIF_NO_ENTREGADA],
    );
    const sinFoto = entero(noEnt.n) - entero(conFoto.n);
    dato('De ellas, sin foto guardada', miles(sinFoto), sinFoto > 0);
    if (sinFoto > 0) decir('      (las fotos de AppSheet no se migraron a la tabla archivo: ver Anexo B-4 de la guía)');
  } else {
    dato('Fotos guardadas', 'no se puede saber: falta sql/08', true);
  }

  /* ---------------------------------------------------------------- 8 */
  titulo(`8. LO QUE SE HIZO DESDE LA APLICACIÓN${DESDE ? ` (desde el ${DESDE})` : ''}`);
  if (!cap.auditoria) {
    dato('Historial', 'no se puede saber: falta sql/05', true);
  } else {
    const actos = await consultar(
      `SELECT a.momento, a.actor, a.accion, a.id_local, l.nombre_local, a.estado_anterior, a.estado_nuevo, a.motivo
         FROM auditoria a LEFT JOIN local l ON l.id_local = a.id_local
        WHERE a.actor <> 'Sistema' ${DESDE ? 'AND a.momento >= ?' : ''}
        ORDER BY a.momento, a.id_auditoria`,
      DESDE ? [DESDE] : [],
    );
    const [auto] = await consultar(
      `SELECT COUNT(*) AS n FROM auditoria WHERE actor = 'Sistema' ${DESDE ? 'AND momento >= ?' : ''}`,
      DESDE ? [DESDE] : [],
    );
    dato('Actos hechos por personas', miles(actos.length));
    dato('Cambios anotados por el sistema (vencimientos)', miles(auto.n));
    const porAccion = new Map();
    actos.forEach((a) => porAccion.set(a.accion ?? '(sin acción)', (porAccion.get(a.accion ?? '(sin acción)') ?? 0) + 1));
    [...porAccion.entries()].sort((a, b) => b[1] - a[1]).forEach(([accion, n]) => dato(`   ${accion}`, miles(n)));
    if (actos.length) {
      decir('\n  Detalle (fecha · quién · local · acción · motivo):');
      lista(
        actos,
        (a) =>
          `${String(a.momento).slice(0, 16)} · ${a.actor} · ${a.idLocal} ${a.nombreLocal ?? ''} · ${a.accion ?? ''} · ${String(a.motivo ?? '').slice(0, 90)}`,
        GUARDAR ? Infinity : 40,
      );
    }
  }

  decir('\nFin de la verificación. No se modificó nada en la base.');

  if (GUARDAR) {
    const archivo = `verificacion-base-${new Date().toISOString().slice(0, 10)}.txt`;
    writeFileSync(archivo, salida.join('\n'), 'utf8');
    console.log(`\nGuardado en backend/${archivo}`);
  }
}

main()
  .catch((e) => {
    console.error('\nNo se pudo terminar la verificación:', e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
