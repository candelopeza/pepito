/* ============================================================================
   pruebas/humo-api.mjs  —  LAS VISTAS DEL FRONT CONTRA LOS DATOS REALES
   ----------------------------------------------------------------------------
   Se ejecuta con el backend corriendo:

     npm run dev        (en backend/)
     npm run humo       (en la raíz)

   QUÉ HACE: pide los datos a la API, arma el mismo objeto `base` que arma
   src/datos/DatosProvider.jsx, y corre TODAS las funciones de src/datos/vistas.js
   sobre él. Si alguna explota, lo dice acá en vez de que aparezca como una
   pantalla en blanco en el navegador.

   POR QUÉ EXISTE: los datos de prueba de semilla.js estaban completos y
   prolijos. El padrón real no: hay actuaciones sin fecha, campos vacíos y
   estados que la maqueta no contemplaba. Esta prueba es la que encuentra esas
   diferencias sin tener que abrir la aplicación y hacer clic en todo.

   NO ESCRIBE NADA: son todos GET.
   ============================================================================ */

import { bandejas, cedulas, conEstado, documentosPorVencer, indicadores, porVencer, presentacionesPendientes } from '../src/datos/vistas.js';
import { deLocal } from '../src/dominio/actuaciones.js';
import { hoyISO } from '../src/dominio/fechas.js';

const BASE = process.env.VITE_API_URL ?? 'http://localhost:3000';
const CABECERAS = { 'x-usuario-nombre': 'prueba-humo', 'x-usuario-rol': 'coordinacion' };

let fallas = 0;

function ok(etiqueta, detalle = '') {
  console.log(`OK   ${etiqueta}${detalle ? ` · ${detalle}` : ''}`);
}

function falla(etiqueta, error) {
  fallas += 1;
  console.log(`FALLA ${etiqueta}`);
  console.log(`      ${error.message}`);
  if (error.stack) console.log(error.stack.split('\n').slice(1, 3).map((l) => `      ${l.trim()}`).join('\n'));
}

/* Corre una función y cuenta el resultado en vez de cortar la prueba: interesa
   ver TODAS las que fallan, no solo la primera. */
function probar(etiqueta, fn, describir = () => '') {
  try {
    const r = fn();
    ok(etiqueta, describir(r));
    return r;
  } catch (e) {
    falla(etiqueta, e);
    return null;
  }
}

async function traer(ruta) {
  const r = await fetch(`${BASE}${ruta}`, { headers: CABECERAS });
  if (!r.ok) throw new Error(`${ruta} respondió ${r.status}`);
  return r.json();
}

console.log(`=== DATOS DESDE ${BASE} ===\n`);

let base;
try {
  const [locales, actuaciones, relevamientos, usuarios, rubros, feriados, parametros, plantilla, fusiones] =
    await Promise.all([
      traer('/locales'),
      traer('/actuaciones'),
      traer('/relevamientos'),
      traer('/configuracion/usuarios'),
      traer('/configuracion/rubros'),
      traer('/configuracion/feriados'),
      traer('/configuracion/parametros'),
      traer('/configuracion/plantilla'),
      traer('/herramientas/fusiones'),
    ]);

  base = {
    locales,
    actuaciones,
    relevamientos,
    usuarios,
    rubros,
    feriados,
    fusiones,
    auditoria: [],
    parametros,
    plantillaCedula: plantilla?.texto ?? '',
    secuencias: { cedula: 0, expediente: 0 },
  };

  console.log(`locales: ${locales.length} · actuaciones: ${actuaciones.length} · relevamientos: ${relevamientos.length}`);
  console.log(`rubros: ${rubros.length} · usuarios: ${usuarios.length} · feriados: ${feriados.length}\n`);
} catch (e) {
  console.error('No se pudieron traer los datos:', e.message);
  console.error('¿Está corriendo el backend? (cd backend && npm run dev)');
  process.exit(1);
}

/* --- Integridad de lo que llega ------------------------------------------- */
console.log('=== LO QUE LLEGA ===');

const sinFecha = base.actuaciones.filter((a) => !a.fecha).length;
if (sinFecha) {
  console.log(`AVISO actuaciones sin fecha: ${sinFecha} (no cuentan para los indicadores del mes)`);
} else {
  ok('todas las actuaciones tienen fecha');
}

const sinEstado = base.locales.filter((l) => !l.estado).length;
if (sinEstado) {
  fallas += 1;
  console.log(`FALLA ${sinEstado} local(es) llegaron sin estado desde la API`);
} else {
  ok('todos los locales llegan con estado resuelto');
}

const tiposNulos = base.actuaciones.filter((a) => !a.tipo).length;
if (tiposNulos) {
  fallas += 1;
  console.log(`FALLA ${tiposNulos} actuación(es) sin tipo`);
} else {
  ok('todas las actuaciones tienen tipo');
}

/* --- Las vistas ----------------------------------------------------------- */
console.log('\n=== LAS VISTAS DEL FRONT ===');
const hoy = hoyISO();

const locales = probar('conEstado()', () => conEstado(base, hoy), (r) => {
  const cuenta = {};
  for (const l of r) cuenta[l.estado] = (cuenta[l.estado] ?? 0) + 1;
  return `${r.length} locales, ${Object.keys(cuenta).length} estados distintos`;
});

if (locales) {
  for (const rol of ['administrativo', 'coordinacion', 'notificador', 'relevador', 'direccion']) {
    probar(`bandejasPara('${rol}')`, () => bandejas(locales, rol), (r) => `${r.length} bandeja(s)`);
  }
  probar('porVencer(3)', () => porVencer(locales, 3), (r) => `${r.length} local(es)`);
  probar('documentosPorVencer(30)', () => documentosPorVencer(base, locales, 30, hoy), (r) => `${r.length} documento(s)`);
  const ind = probar('indicadores()', () => indicadores(base, locales, hoy), (r) => `${Object.keys(r).length} métricas`);

  /* Las filas que van a una grilla necesitan una clave única. `porAgente` se
     identifica por el nombre del agente, y una fila sin nombre deja la pantalla
     de Reportes en blanco (el Data Grid lanza un error que React no atrapa).
     Se verifica acá porque es el tipo de cosa que solo aparece con datos
     reales: en la maqueta todos los relevamientos tenían usuario. */
  if (ind) {
    const sinClave = (ind.porAgente ?? []).filter((a) => !a.agente);
    if (sinClave.length) {
      fallas += 1;
      console.log(`FALLA ${sinClave.length} fila(s) de porAgente sin nombre: dejarían Reportes en blanco`);
    } else {
      ok('porAgente: todas las filas tienen clave', `${ind.porAgente.length} agente(s)`);
    }
  }
}

probar('cedulas()', () => cedulas(base), (r) => `${r.length} cédula(s)`);
probar('presentacionesPendientes()', () => presentacionesPendientes(base), (r) => `${r.length} pendiente(s)`);

/* --- Lo que el provider calcula por su cuenta ------------------------------ */
console.log('\n=== DERIVADOS DEL STORE ===');
const primero = base.locales[0];
if (primero) {
  probar(`actuacionesDeLocal(${primero.id})`, () => deLocal(base.actuaciones, primero.id), (r) => `${r.length} actuación(es)`);
}
/* El correlativo es lo que va después del guion: '0001-675' -> 675. */
probar('último número de cédula', () =>
  base.actuaciones.reduce((max, a) => {
    if (!a.numeroCedula) return max;
    const n = Number(String(a.numeroCedula).split('-').pop());
    return Number.isFinite(n) && n > max ? n : max;
  }, 0),
  (r) => `${r} (la próxima sería la ${r + 1})`,
);

console.log(`\n${fallas === 0 ? 'SIN FALLAS' : `${fallas} FALLA(S)`}`);
process.exit(fallas === 0 ? 0 : 1);
