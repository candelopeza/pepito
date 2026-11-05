/* ============================================================================
   backend/importar-diferencial.js  —  TRAER LO NUEVO DEL SISTEMA VIEJO
   ----------------------------------------------------------------------------
   La base se cargó una vez desde las planillas del sistema viejo (Google
   Sheets + AppSheet) y el área siguió cargando ahí. Esta herramienta lee las
   tres hojas exportadas a CSV y agrega SOLO lo que la base no tiene:

     Padrón              locales nuevos (y completa datos vacíos de los que ya están)
     Relevamientos       relevamientos nuevos
     Registro de actuaciones
                         cédulas, DDJJ, contratos, DDJJ de reciclaje y
                         expedientes nuevos

   NUNCA borra ni pisa. Lo que la base ya tiene, lo deja. Lo dudoso lo lista
   para que una persona lo mire antes de aplicar.

   CÓMO SE CRUZA CADA COSA (es lo que dejó la carga original):
     local         local.id_original = ID_Local de la planilla (f4c56235, A25N6, CON9)
     relevamiento  tramite.numero_referencia = ID_Rel
     cédula, documento y expediente
                   el local + el tipo + la fecha y hora en que se cargó en
                   AppSheet (Fecha_N / Hora_N = tramite.fecha_inicio), con dos
                   minutos de tolerancia. Si eso no coincide, por el número
                   (sin ceros a la izquierda; "175486/26" = "175486/2026").
                   Los números solos no sirven de clave: en la planilla se
                   corrigieron después de la carga original. Las que coinciden
                   por fecha pero con otro número van a numeros-distintos.csv.

   USO (desde la carpeta backend, con padron.csv, relevamientos.csv y
   actuaciones.csv copiados en esa misma carpeta):
     npm run importar
         simula: no escribe nada, imprime el resumen y deja los listados en
         backend/revision/importacion-<fecha>/
     npm run importar:ensayo
         hace todas las escrituras y al final las deshace (ROLLBACK): sirve
         para saber que ninguna fila va a fallar antes de aplicar de verdad.
     npm run importar:aplicar
         escribe, todo en una transacción: o entra todo o no entra nada.
   (Con otros nombres de archivo: node --env-file=.env importar-diferencial.js
   --padron=a.csv --relevamientos=b.csv --actuaciones=c.csv [--ensayo|--aplicar].
   El "--" doble de npm no funciona en PowerShell, por eso los tres comandos.)

   Los CSV se bajan de Google Sheets con Archivo → Descargar → Valores
   separados por comas (.csv), una hoja por vez. Separador coma o punto y
   coma, da lo mismo.

   LO QUE NO TRAE, a propósito:
     - fotos de evidencia (están en la nube del sistema viejo);
     - quién lo cargó: los usuarios de aquella carga ya no están en la tabla
       `usuario`. Los nombres quedan en un listado aparte (personas.csv) para
       asignarlos cuando el área cargue a sus agentes;
     - el estado del local: lo calcula el sistema a partir de los trámites.
   ============================================================================ */

import './entorno.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, consultar, enTransaccion } from './conexion-bd.js';
import { ID_ESTADO, ID_TTRAMITE, ID_TDOC } from './mapeo.js';
import { cicloActual, insertarTramite, parametros } from './consultas.js';
import { registrarPasoDelTiempo } from './auditoria.js';
import { vencimientoAnual } from '../src/dominio/vigencias.js';
import { hoyISO } from '../src/dominio/fechas.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------ argumentos */
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);
const APLICAR = args.aplicar === true;
const ENSAYO = args.ensayo === true;
/* Sin argumentos busca padron.csv, relevamientos.csv y actuaciones.csv en esta
   misma carpeta (backend/). */
for (const nombre of ['padron', 'relevamientos', 'actuaciones']) {
  if (!args[nombre] && fs.existsSync(path.join(AQUI, `${nombre}.csv`))) args[nombre] = path.join(AQUI, `${nombre}.csv`);
}
if (!args.padron && !args.relevamientos && !args.actuaciones) {
  console.log('No encontré padron.csv, relevamientos.csv ni actuaciones.csv en la carpeta backend/.');
  console.log('Copialos ahí con esos nombres y volvé a correr: npm run importar');
  process.exit(1);
}
console.log(`Padrón:         ${args.padron ?? '(no)'}
Relevamientos:  ${args.relevamientos ?? '(no)'}
Actuaciones:    ${args.actuaciones ?? '(no)'}`);

/* ------------------------------------------------------------ CSV */
function leerCsv(ruta) {
  let texto = fs.readFileSync(ruta, 'utf8');
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
  const primera = texto.split(/\r?\n/)[0] ?? '';
  const sep = (primera.match(/;/g) ?? []).length > (primera.match(/,/g) ?? []).length ? ';' : ',';
  const filas = [];
  let fila = [];
  let campo = '';
  let enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') enComillas = false;
      else campo += c;
    } else if (c === '"') enComillas = true;
    else if (c === sep) { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.some((v) => v.trim() !== '')) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); if (fila.some((v) => v.trim() !== '')) filas.push(fila); }
  const cabecera = filas.shift().map(normalizarCabecera);
  return filas.map((f) => Object.fromEntries(cabecera.map((h, i) => [h, (f[i] ?? '').trim()])));
}

const sinAcentos = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const normalizarCabecera = (t) => sinAcentos(t).toLowerCase().replace(/[°º]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/* Busca una columna por varios nombres posibles (ya normalizados). */
function col(fila, ...nombres) {
  for (const n of nombres) {
    const clave = normalizarCabecera(n);
    if (clave in fila) return fila[clave];
  }
  for (const n of nombres) {
    const clave = normalizarCabecera(n);
    const k = Object.keys(fila).find((h) => h.includes(clave));
    if (k) return fila[k];
  }
  return '';
}

/* ------------------------------------------------------------ fechas */
/* d/m/aaaa (lo normal en las hojas). Las filas de expedientes históricos
   (exp001…) vienen m/d/aaaa: se pasa `usa` en ese caso. También acepta el
   formato largo de JavaScript que AppSheet dejó en la DDJJ de reciclaje. */
function fechaISO(texto, { usa = false } = {}) {
  const t = String(texto ?? '').trim();
  if (!t) return null;
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let [, a, b, anio] = m;
    a = Number(a); b = Number(b);
    if (anio.length === 2) anio = `20${anio}`;
    // Si una de las dos partes no puede ser mes, no hay duda; si las dos pueden, manda el formato pedido.
    let dia = a, mes = b;
    if (b > 12 && a <= 12) { dia = b; mes = a; }
    else if (a <= 12 && b <= 12 && usa) { dia = b; mes = a; }
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  const d = new Date(t.replace(/\s*\(.*\)$/, ''));
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function horaHHMMSS(texto) {
  const t = String(texto ?? '').trim().toLowerCase();
  const m = t.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/);
  if (!m) return null;
  let h = Number(m[1]);
  const mi = m[2], s = m[3] ?? '00';
  const ampm = (m[4] ?? '').replace(/[.\s]/g, '');
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${mi}:${s}`;
}

const fechaHora = (fecha, hora, opts) => {
  const f = fechaISO(fecha, opts);
  if (!f) return null;
  const h = horaHHMMSS(hora);
  return h ? `${f} ${h}` : `${f} 00:00:00`;
};

/* ------------------------------------------------------------ normalizaciones */
const limpiarCuit = (t) => String(t ?? '').replace(/\D/g, '');
const cuitValido = (c) => c.length === 11;

const numeroCedula = (t) => {
  const primero = String(t ?? '').split('/')[0];
  return primero.replace(/\s+/g, '').trim();
};

/* '000336' -> '336', '00005 - 1er Contrato' -> '5'. '' si no hay dígitos. */
const numeroDocumento = (t) => {
  const m = String(t ?? '').trim().match(/^\D*?(\d+)/);
  if (!m) return '';
  return String(Number(m[1]));
};

/* '175630/26 - Fecha 19/08/2026' -> { numero: '175630/2026', fecha: '2026-08-19' } */
function numeroExpediente(t) {
  const texto = String(t ?? '').trim();
  const m = texto.match(/(\d{5,7})\s*\/\s*(\d{2,4})/);
  if (!m) return null;
  let anio = m[2];
  if (anio.length === 2) anio = `20${anio}`;
  if (anio.length !== 4) anio = anio.slice(0, 4);
  const f = texto.match(/(\d{1,2}\/\d{1,2}\/\d{4})/g);
  const fecha = f ? fechaISO(f[f.length - 1]) : null;
  return { numero: `${m[1]}/${anio}`, fecha };
}

function coordenadas(t) {
  const m = String(t ?? '').match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  if (!lat || !lon) return null;
  if (lat < -28 || lat > -26 || lon < -66 || lon > -64) return null; // fuera de Tucumán: basura
  return { latitud: lat, longitud: lon };
}

const ESTADO_RELEVAMIENTO = {
  'gran generador': ID_ESTADO.GRAN_GENERADOR,
  'generador menor': ID_ESTADO.GENERADOR_MENOR,
  'local inactivo / cerrado': ID_ESTADO.RELEVAMIENTO_INACTIVO,
  'local inactivo cerrado': ID_ESTADO.RELEVAMIENTO_INACTIVO,
};
const ESTADO_ENTREGA = {
  entregada: ID_ESTADO.NOTIF_ENTREGADA,
  'entregada sin firma': ID_ESTADO.NOTIF_SIN_FIRMA,
  fijada: ID_ESTADO.NOTIF_FIJADA,
  'no entregada': ID_ESTADO.NOTIF_NO_ENTREGADA,
};
const ESTADO_LOCAL = {
  'exento pendiente inspeccion': ID_ESTADO.EXENTO_PENDIENTE,
  'completar datos': ID_ESTADO.COMPLETAR_DATOS,
  'relevado exento': ID_ESTADO.RELEVADO_EXENTO,
  'inactivo cerrado': ID_ESTADO.LOCAL_INACTIVO,
};
const clave = (t) => sinAcentos(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/* Largo de las columnas de texto de la base. Lo que se pasa se recorta y se
   avisa en descartados.csv (el dato entra cortado, no se pierde la fila). */
const LARGO = {
  cuit: 14, razon_social: 150, nombre_local: 150, direccion_local: 200, domicilio_fiscal: 200,
  email_local: 100, telefono_local: 30, observacion: 150,
  direccion_relevada: 200, domicilio_notificacion: 200, numero_referencia: 50, numero: 50,
};
function alLargo(columna, valor, hoja, fila) {
  if (valor === null || valor === undefined) return null;
  const t = String(valor).trim();
  const max = LARGO[columna];
  if (!max || t.length <= max) return t;
  descartar(hoja, fila, `${columna} de ${t.length} letras se recorta a ${max}: "${t}"`);
  return t.slice(0, max).trim();
}

/* ------------------------------------------------------------ lo que ya hay */
async function cargarIndices() {
  const rubros = await consultar('SELECT id_rubro, nombre_rubro FROM rubro WHERE habilita = 1');
  const rubroPorNombre = new Map(rubros.map((r) => [clave(r.nombreRubro), r.idRubro]));
  const idRubroOtros = rubroPorNombre.get('otros') ?? 1;

  const locales = await consultar(
    'SELECT id_local, id_original, cuit, razon_social, nombre_local, direccion_local, domicilio_fiscal, email_local, telefono_local, id_rubro, habilita FROM local',
  );
  const localPorOriginal = new Map();
  for (const l of locales) if (l.idOriginal) localPorOriginal.set(String(l.idOriginal).trim(), l);

  const rel = await consultar('SELECT numero_referencia FROM tramite WHERE id_ttramite = ? AND numero_referencia IS NOT NULL', [ID_TTRAMITE.RELEVAMIENTO]);
  const relevamientos = new Set(rel.map((r) => String(r.numeroReferencia).trim()));

  /* Cédulas, documentos y expedientes. La clave firme es el local + el tipo +
     la fecha y hora en que se cargó en AppSheet (Fecha_N / Hora_N), porque
     los números se corrigieron en la planilla después de la carga original.
     El número se usa como segunda llave. */
  const act = await consultar(
    `SELECT t.id_tramite, t.id_local, t.id_ttramite, t.numero_referencia, t.fecha_inicio, d.id_tdocumentacion, d.numero
       FROM tramite t LEFT JOIN documentacion d ON d.id_tramite = t.id_tramite
      WHERE t.id_ttramite IN (?, ?, ?, ?) AND t.habilita = 1`,
    [ID_TTRAMITE.PRIMERA_NOTIFICACION, ID_TTRAMITE.SEGUNDA_NOTIFICACION, ID_TTRAMITE.PRESENTACION_DOCUMENTACION, ID_TTRAMITE.EXPEDIENTE_MULTA],
  );
  const porLocalYTipo = new Map(); // 'idLocal|tipo' -> [{ idTramite, momento, numeros:Set }]
  for (const a of act) {
    // Un documento que la carga original dejó sin tipo cuenta para los tres tipos.
    const tipos = a.idTtramite !== ID_TTRAMITE.PRESENTACION_DOCUMENTACION ? [`t${a.idTtramite}`]
      : a.idTdocumentacion ? [`doc${a.idTdocumentacion}`] : [`doc${ID_TDOC.DDJJ}`, `doc${ID_TDOC.CONTRATO}`, `doc${ID_TDOC.DDJJ_RECICLAJE}`];
    const numeros = new Set();
    for (const n of [a.numero, a.numeroReferencia]) {
      if (a.idTtramite === ID_TTRAMITE.PRESENTACION_DOCUMENTACION) { const x = numeroDocumento(n); if (x) numeros.add(x); }
      else if (a.idTtramite === ID_TTRAMITE.EXPEDIENTE_MULTA) { const x = numeroExpediente(n); if (x) numeros.add(x.numero); }
      else { const x = numeroCedula(n); if (x) numeros.add(x); }
    }
    const entrada = { idTramite: a.idTramite, momento: a.fechaInicio ? new Date(a.fechaInicio).getTime() : null, numeros };
    for (const tipo of tipos) {
      const k = `${a.idLocal}|${tipo}`;
      if (!porLocalYTipo.has(k)) porLocalYTipo.set(k, []);
      porLocalYTipo.get(k).push(entrada);
    }
  }
  return { rubroPorNombre, idRubroOtros, localPorOriginal, relevamientos, porLocalYTipo };
}

/* ¿Esta actuación ya está? Mismo local y tipo, y (misma fecha/hora de carga
   con 2 minutos de tolerancia, o mismo número). Devuelve el trámite o null. */
const TOLERANCIA_MS = 2 * 60 * 1000;
function yaCargada(idx, idLocal, tipo, momentoISO, numero) {
  const lista = idx.porLocalYTipo.get(`${idLocal}|${tipo}`) ?? [];
  const momento = momentoISO ? new Date(momentoISO.replace(' ', 'T')).getTime() : null;
  let porNumero = null;
  for (const t of lista) {
    if (momento && t.momento && Math.abs(t.momento - momento) <= TOLERANCIA_MS) {
      return { ...t, por: 'fecha', numeroDistinto: numero && t.numeros.size && !t.numeros.has(numero) ? [...t.numeros][0] : null };
    }
    if (numero && t.numeros.has(numero)) porNumero = { ...t, por: 'numero', numeroDistinto: null };
  }
  return porNumero;
}

/* ------------------------------------------------------------ el plan */
const plan = {
  altasLocales: [],        // { idOriginal, datos }
  actualizaciones: [],     // { idLocal, idOriginal, campos: {col: valor} }
  diferencias: [],         // { idOriginal, campo, base, planilla }
  relevamientos: [],       // { idOriginal, tramite }
  actuaciones: [],         // { idOriginal, tipo, tramite, documento? }
  descartados: [],         // { hoja, fila, motivo }
  numerosDistintos: [],    // { idOriginal, idLocal, idTramite, tipo, base, planilla }
  personas: new Map(),     // nombre -> { roles, veces }
};
const persona = (nombre, rol) => {
  const n = String(nombre ?? '').trim();
  if (!n || n.includes('@') || n === 'admin' || n === '0') return;
  const p = plan.personas.get(n) ?? { roles: new Set(), veces: 0 };
  p.roles.add(rol);
  p.veces += 1;
  plan.personas.set(n, p);
};
const descartar = (hoja, fila, motivo) => plan.descartados.push({ hoja, fila, motivo });

/* Los locales nuevos del padrón se conocen por id_original antes de tener
   id_local: en simulación se les asigna un id provisorio negativo. */
const localesNuevos = new Map(); // idOriginal -> { idLocal (negativo hasta aplicar), datos }
function buscarLocal(idx, idOriginal) {
  const id = String(idOriginal ?? '').trim();
  if (!id) return null;
  return idx.localPorOriginal.get(id) ?? localesNuevos.get(id) ?? null;
}

/* ------------------------------------------------------------ padrón */
function procesarPadron(filas, idx) {
  let provisorio = -1;
  for (const f of filas) {
    const idOriginal = col(f, 'ID_Local').trim();
    if (!idOriginal) continue;
    const cuit = limpiarCuit(col(f, 'CUIT'));
    const datos = {
      cuit: cuitValido(cuit) ? cuit : null,
      razonSocial: col(f, 'RAZON SOCIAL / SITUACION', 'razon social') || null,
      nombreLocal: col(f, 'NOMBRE LOCAL') || null,
      direccion: col(f, 'DIRECCION') || null,
      domicilioFiscal: col(f, 'Domicilio fiscal') || null,
      email: col(f, 'EMAIL') || null,
      telefono: col(f, 'TELEFONO') || null,
      rubro: col(f, 'RUBRO') || null,
      estado: col(f, 'ESTADO ACTUAL') || null,
      observaciones: col(f, 'OBSERVACIONES') || null,
      coordenadas: coordenadas(col(f, 'COORDENADAS')),
      sucursal: col(f, 'Casa Central/ Sucursal', 'casa central') || null,
    };
    if (cuit && !cuitValido(cuit)) descartar('padron', idOriginal, `CUIT con ${cuit.length} dígitos (${cuit}): se carga sin CUIT`);
    persona(col(f, 'Notificador1'), 'notificador');
    persona(col(f, 'Notificador2'), 'notificador');

    const existente = idx.localPorOriginal.get(idOriginal);
    if (!existente) {
      if (!datos.nombreLocal && !datos.razonSocial) { descartar('padron', idOriginal, 'local nuevo sin nombre ni razón social'); continue; }
      if (!datos.direccion) { descartar('padron', idOriginal, 'local nuevo sin dirección'); continue; }
      const idRubro = idx.rubroPorNombre.get(clave(datos.rubro)) ?? idx.idRubroOtros;
      if (datos.rubro && !idx.rubroPorNombre.has(clave(datos.rubro))) {
        descartar('padron', idOriginal, `rubro "${datos.rubro}" no existe en la tabla rubro: queda como OTROS`);
      }
      const idEstado = ESTADO_LOCAL[clave(datos.estado)] ?? ID_ESTADO.REVISION_DATOS;
      datos.razonSocial = alLargo('razon_social', datos.razonSocial, 'padron', idOriginal);
      datos.nombreLocal = alLargo('nombre_local', datos.nombreLocal, 'padron', idOriginal);
      datos.direccion = alLargo('direccion_local', datos.direccion, 'padron', idOriginal);
      datos.domicilioFiscal = alLargo('domicilio_fiscal', datos.domicilioFiscal, 'padron', idOriginal);
      datos.email = alLargo('email_local', datos.email, 'padron', idOriginal);
      datos.telefono = alLargo('telefono_local', datos.telefono, 'padron', idOriginal);
      datos.observaciones = alLargo('observacion', datos.observaciones, 'padron', idOriginal);
      const nuevo = { idLocal: provisorio--, idOriginal, datos: { ...datos, idRubro, idEstado } };
      localesNuevos.set(idOriginal, nuevo);
      plan.altasLocales.push(nuevo);
      continue;
    }
    // Existe: se completa lo vacío; lo distinto se lista, no se pisa.
    const campos = {};
    const comparar = (campo, columna, valorPlanilla, valorBase) => {
      const p = String(valorPlanilla ?? '').trim();
      const b = String(valorBase ?? '').trim();
      if (!p) return;
      if (!b) campos[columna] = alLargo(columna, p, 'padron', idOriginal);
      else if (clave(p) !== clave(b)) plan.diferencias.push({ idOriginal, idLocal: existente.idLocal, campo, base: b, planilla: p });
    };
    comparar('cuit', 'cuit', datos.cuit, existente.cuit);
    comparar('razon_social', 'razon_social', datos.razonSocial, existente.razonSocial);
    comparar('nombre_local', 'nombre_local', datos.nombreLocal, existente.nombreLocal);
    comparar('direccion', 'direccion_local', datos.direccion, existente.direccionLocal);
    comparar('domicilio_fiscal', 'domicilio_fiscal', datos.domicilioFiscal, existente.domicilioFiscal);
    comparar('email', 'email_local', datos.email, existente.emailLocal);
    comparar('telefono', 'telefono_local', datos.telefono, existente.telefonoLocal);
    const idRubroPlanilla = idx.rubroPorNombre.get(clave(datos.rubro));
    if (idRubroPlanilla && (!existente.idRubro || existente.idRubro === 1)) campos.id_rubro = idRubroPlanilla;
    if (Object.keys(campos).length) plan.actualizaciones.push({ idLocal: existente.idLocal, idOriginal, campos });
  }
}

/* ------------------------------------------------------------ relevamientos */
function procesarRelevamientos(filas, idx) {
  const vistos = new Set();
  for (const f of filas) {
    const idRel = col(f, 'ID_Rel').trim();
    const idOriginal = col(f, 'ID_Local').trim();
    if (!idRel) continue;
    if (idx.relevamientos.has(idRel) || vistos.has(idRel)) continue;
    vistos.add(idRel);
    persona(col(f, 'Usuario'), 'relevador');
    const local = buscarLocal(idx, idOriginal);
    if (!local) { descartar('relevamientos', idRel, `local ${idOriginal} no está en la base ni en el padrón`); continue; }
    const estado = ESTADO_RELEVAMIENTO[clave(col(f, 'Estado Relevamiento'))];
    const direccion = alLargo('direccion_relevada', col(f, 'Direccion relevada') || null, 'relevamientos', idRel);
    if (!estado && !direccion) { descartar('relevamientos', idRel, 'fila vacía (sin dirección ni clasificación)'); continue; }
    if (!estado) { descartar('relevamientos', idRel, `clasificación "${col(f, 'Estado Relevamiento')}" desconocida`); continue; }
    const momento = fechaHora(col(f, 'Fecha Relevamiento'), col(f, 'Hora Relevamiento'));
    if (!momento) { descartar('relevamientos', idRel, `fecha ilegible "${col(f, 'Fecha Relevamiento')}"`); continue; }
    const geo = coordenadas(col(f, 'Coordenadas relevadas'));
    const notas = [col(f, 'Razon social / Situacion', 'razon social'), col(f, 'Usuario') ? `Relevó ${col(f, 'Usuario')}` : '']
      .filter(Boolean).join(' · ');
    plan.relevamientos.push({
      idOriginal,
      local,
      tramite: {
        idEstado: estado,
        idTtramite: ID_TTRAMITE.RELEVAMIENTO,
        numeroReferencia: idRel,
        direccionRelevada: direccion,
        latitudRelevamiento: geo?.latitud ?? null,
        longitudRelevamiento: geo?.longitud ?? null,
        fechaInicio: momento,
        observaciones: notas,
      },
      resumen: `${momento} ${col(f, 'Nombre del Local')} (${col(f, 'Estado Relevamiento')})`,
    });
  }
}

/* ------------------------------------------------------------ actuaciones */
function procesarActuaciones(filas, idx, params) {
  const vistasCedulas = new Set();
  const vistosDocs = new Set();
  const vistosExp = new Set();

  for (const f of filas) {
    const idAct = col(f, 'ID Act').trim();
    const idOriginal = col(f, 'ID_Local').trim();
    const tipo = clave(col(f, 'TIPO DE ACTO'));
    const local = buscarLocal(idx, idOriginal);
    if (!local) { descartar('actuaciones', idAct, `local ${idOriginal} no está en la base ni en el padrón`); continue; }
    const esHistoricoUSA = /^exp\d+$/i.test(idAct) || /^ddjj\d+$/i.test(idAct);

    /* ---- cédulas: una fila puede traer la primera, la segunda o las dos ---- */
    for (const inst of [1, 2]) {
      const numero = numeroCedula(col(f, inst === 1 ? 'N DE 1 NOTIFICACION' : 'N de 2 Notificacion', `n de ${inst} notificacion`));
      if (!numero || !/\d/.test(numero)) continue;
      const crudo = col(f, inst === 1 ? 'N DE 1 NOTIFICACION' : 'N de 2 Notificacion', `n de ${inst} notificacion`);
      if (crudo.includes('/')) descartar('actuaciones', idAct, `cédula con dos números "${crudo}": se toma ${numero}`);
      const fechaEntrega = fechaISO(col(f, `Fecha ${inst} Notificacion`));
      const emision = fechaHora(col(f, `Fecha_${inst}`), col(f, `Hora_${inst}`)) ?? (fechaEntrega ? `${fechaEntrega} 00:00:00` : null);
      if (!emision) { descartar('actuaciones', idAct, `cédula ${numero} sin fecha`); continue; }
      const tipoTramite = inst === 1 ? ID_TTRAMITE.PRIMERA_NOTIFICACION : ID_TTRAMITE.SEGUNDA_NOTIFICACION;
      const previa = yaCargada(idx, local.idLocal, `t${tipoTramite}`, emision, numero);
      if (previa) {
        if (previa.numeroDistinto) plan.numerosDistintos.push({ idOriginal, idLocal: local.idLocal, idTramite: previa.idTramite, tipo: `cédula ${inst}°`, base: previa.numeroDistinto, planilla: numero });
        continue;
      }
      if (vistasCedulas.has(numero)) { descartar('actuaciones', idAct, `cédula ${numero} repetida en la planilla: se toma la primera`); continue; }
      vistasCedulas.add(numero);
      const estadoTexto = col(f, `Estado ${inst} Notificacion`);
      const estado = ESTADO_ENTREGA[clave(estadoTexto)] ?? (estadoTexto ? null : ID_ESTADO.NOTIF_GENERADA);
      if (estado === null) { descartar('actuaciones', idAct, `cédula ${numero}: estado "${estadoTexto}" desconocido`); continue; }
      persona(col(f, `Notificador ${inst}`), 'notificador');
      const plazo = Number(col(f, `Plazo ${inst}`)) || (inst === 1 ? params.plazoNotif1 : params.plazoNotif2);
      const vencimiento = fechaISO(col(f, `Vto Plazo ${inst}`));
      const obs = [col(f, `Observaciones_${inst}`), col(f, `Notificador ${inst}`) ? `Notificó ${col(f, `Notificador ${inst}`)}` : '']
        .filter((t) => t && t !== '0').join(' · ');
      plan.actuaciones.push({
        idOriginal, local, tipo: `cédula ${inst}°`,
        tramite: {
          idEstado: estado,
          idTtramite: tipoTramite,
          numeroReferencia: numero,
          plazoDias: plazo,
          domicilioNotificacion: alLargo('domicilio_notificacion', local.direccionLocal ?? local.datos?.direccion ?? null, 'actuaciones', idAct),
          fechaInicio: emision,
          fechaEntrega: estado === ID_ESTADO.NOTIF_NO_ENTREGADA || estado === ID_ESTADO.NOTIF_GENERADA ? null : fechaEntrega,
          fechaVencimiento: estado === ID_ESTADO.NOTIF_NO_ENTREGADA || estado === ID_ESTADO.NOTIF_GENERADA ? null : vencimiento,
          fechaCierre: null,
          observaciones: obs,
        },
        resumen: `${numero} ${estadoTexto || 'generada'} ${fechaEntrega ?? ''}`,
      });
    }

    /* ---- documentos ---- */
    const documento = (idTdoc, etiqueta, numeroCrudo, fechaEmision, fechaVenc, fechaCarga) => {
      const texto = String(numeroCrudo ?? '').trim();
      if (!texto) return;
      const numero = numeroDocumento(texto);
      if (!numero || numero === '0') { descartar('actuaciones', idAct, `${etiqueta} "${texto}": no es un número (nota o pendiente), no se carga`); return; }
      if (/prorroga|pr[oó]rroga|tramite|pendiente|notificacion/i.test(sinAcentos(texto)) && !/^\d/.test(texto)) {
        descartar('actuaciones', idAct, `${etiqueta} "${texto}": es una nota, no un documento`); return;
      }
      const previa = yaCargada(idx, local.idLocal, `doc${idTdoc}`, fechaCarga, numero);
      if (previa) {
        if (previa.numeroDistinto) plan.numerosDistintos.push({ idOriginal, idLocal: local.idLocal, idTramite: previa.idTramite, tipo: etiqueta, base: previa.numeroDistinto, planilla: numero });
        return;
      }
      const key = `${local.idLocal}|${idTdoc}|${numero}`;
      if (vistosDocs.has(key)) { descartar('actuaciones', idAct, `${etiqueta} ${texto} repetido para el mismo local: se toma el primero`); return; }
      const emision = fechaEmision ? fechaISO(fechaEmision, { usa: esHistoricoUSA && !fechaISO(fechaEmision) }) : null;
      let vencimiento = fechaVenc ? fechaISO(fechaVenc) : null;
      if (idTdoc !== ID_TDOC.CONTRATO) {
        if (!emision) { descartar('actuaciones', idAct, `${etiqueta} ${texto} sin fecha de emisión`); return; }
        vencimiento = vencimientoAnual(emision, params.modoBisiesto);
      } else if (!vencimiento) { descartar('actuaciones', idAct, `contrato ${texto} sin fecha de vencimiento`); return; }
      if (emision && emision > hoyISO()) { descartar('actuaciones', idAct, `${etiqueta} ${texto}: emisión futura (${emision})`); return; }
      vistosDocs.add(key);
      const vigente = vencimiento > hoyISO();
      plan.actuaciones.push({
        idOriginal, local, tipo: etiqueta,
        tramite: {
          idEstado: vigente ? ID_ESTADO.DOC_VIGENTE : ID_ESTADO.DOC_VENCIDA,
          idTtramite: ID_TTRAMITE.PRESENTACION_DOCUMENTACION,
          numeroReferencia: null,
          fechaInicio: fechaCarga ?? `${emision ?? vencimiento} 00:00:00`,
          fechaVencimiento: vencimiento,
          observaciones: texto !== numero && /\D/.test(texto.replace(/^0+/, '')) ? texto : '',
        },
        documento: { idTdocumentacion: idTdoc, numero: alLargo('numero', texto, 'actuaciones', idAct), fechaEmision: emision, fechaVencimiento: vencimiento },
        resumen: `${etiqueta} ${texto} emitida ${emision ?? '-'} vence ${vencimiento}`,
      });
    };

    if (tipo.startsWith('declaracion jurada')) {
      documento(ID_TDOC.DDJJ, 'DDJJ', col(f, 'N DE DDJJ'), col(f, 'Fecha de emision DDJJ'), null, fechaHora(col(f, 'Fecha_3'), col(f, 'Hora_3'), { usa: esHistoricoUSA }));
    } else if (tipo === 'contrato') {
      documento(ID_TDOC.CONTRATO, 'contrato', col(f, 'N Contrato'), null, col(f, 'VTO CONTRATO'), fechaHora(col(f, 'Fecha_5'), col(f, 'Hora_5')));
    } else if (tipo.startsWith('ddjj reciclaje')) {
      documento(ID_TDOC.DDJJ_RECICLAJE, 'DDJJ reciclaje', col(f, 'N DE DDJJ verde'), col(f, 'Fecha de emision DDJJ verde'), null, fechaHora(col(f, 'Fecha_6'), col(f, 'Hora_6')));
    } else if (tipo === 'expediente') {
      const texto = col(f, 'N DE EXPEDIENTE');
      const exp = numeroExpediente(texto);
      if (!exp) { descartar('actuaciones', idAct, `expediente sin número válido: "${texto || '(vacío)'}"`); continue; }
      const key = `${local.idLocal}|${exp.numero}`;
      const carga = fechaHora(col(f, 'Fecha_4'), col(f, 'Hora_4'), { usa: esHistoricoUSA });
      const fecha = exp.fecha ? `${exp.fecha} 00:00:00` : carga;
      if (!fecha) { descartar('actuaciones', idAct, `expediente ${exp.numero} sin fecha`); continue; }
      const T_EXP = `t${ID_TTRAMITE.EXPEDIENTE_MULTA}`;
      const previa = yaCargada(idx, local.idLocal, T_EXP, carga, exp.numero) ?? yaCargada(idx, local.idLocal, T_EXP, fecha, exp.numero);
      if (previa) {
        if (previa.numeroDistinto) plan.numerosDistintos.push({ idOriginal, idLocal: local.idLocal, idTramite: previa.idTramite, tipo: 'expediente', base: previa.numeroDistinto, planilla: exp.numero });
        continue;
      }
      if (vistosExp.has(key)) { descartar('actuaciones', idAct, `expediente ${exp.numero} repetido para el mismo local`); continue; }
      vistosExp.add(key);
      plan.actuaciones.push({
        idOriginal, local, tipo: 'expediente',
        tramite: {
          idEstado: ID_ESTADO.EXPEDIENTE_GENERADO,
          idTtramite: ID_TTRAMITE.EXPEDIENTE_MULTA,
          numeroReferencia: exp.numero,
          fechaInicio: fecha,
          observaciones: '',
        },
        resumen: `expediente ${exp.numero} ${fecha.slice(0, 10)}`,
      });
    } else if (!tipo.includes('notificacion')) {
      descartar('actuaciones', idAct, `tipo de acto "${col(f, 'TIPO DE ACTO')}" desconocido`);
    }
  }
}

/* ------------------------------------------------------------ listados */
function escribirCsv(carpeta, nombre, filas, columnas) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const texto = ['﻿' + columnas.map(esc).join(';'), ...filas.map((f) => columnas.map((c) => esc(f[c])).join(';'))].join('\r\n');
  fs.writeFileSync(path.join(carpeta, nombre), texto, 'utf8');
}

function escribirListados() {
  const carpeta = path.join(AQUI, 'revision', `importacion-${hoyISO()}`);
  fs.mkdirSync(carpeta, { recursive: true });
  escribirCsv(carpeta, 'altas-locales.csv', plan.altasLocales.map((a) => ({ id_original: a.idOriginal, ...a.datos, coordenadas: a.datos.coordenadas ? `${a.datos.coordenadas.latitud}, ${a.datos.coordenadas.longitud}` : '' })),
    ['id_original', 'nombreLocal', 'razonSocial', 'cuit', 'direccion', 'domicilioFiscal', 'rubro', 'estado', 'email', 'telefono', 'coordenadas', 'observaciones']);
  escribirCsv(carpeta, 'actualizaciones-locales.csv', plan.actualizaciones.map((a) => ({ id_local: a.idLocal, id_original: a.idOriginal, campos: Object.entries(a.campos).map(([k, v]) => `${k} = ${v}`).join(' | ') })),
    ['id_local', 'id_original', 'campos']);
  escribirCsv(carpeta, 'diferencias-locales.csv', plan.diferencias.map((d) => ({ id_local: d.idLocal, id_original: d.idOriginal, campo: d.campo, base: d.base, planilla: d.planilla })), ['id_local', 'id_original', 'campo', 'base', 'planilla']);
  escribirCsv(carpeta, 'nuevos-relevamientos.csv', plan.relevamientos.map((r) => ({ id_original: r.idOriginal, id_local: r.local.idLocal, detalle: r.resumen, direccion: r.tramite.direccionRelevada })),
    ['id_original', 'id_local', 'detalle', 'direccion']);
  escribirCsv(carpeta, 'nuevas-actuaciones.csv', plan.actuaciones.map((a) => ({ id_original: a.idOriginal, id_local: a.local.idLocal, tipo: a.tipo, detalle: a.resumen })),
    ['id_original', 'id_local', 'tipo', 'detalle']);
  escribirCsv(carpeta, 'descartados.csv', plan.descartados, ['hoja', 'fila', 'motivo']);
  escribirCsv(carpeta, 'numeros-distintos.csv', plan.numerosDistintos.map((n) => ({ id_original: n.idOriginal, id_local: n.idLocal, id_tramite: n.idTramite, tipo: n.tipo, numero_en_base: n.base, numero_en_planilla: n.planilla })),
    ['id_original', 'id_local', 'id_tramite', 'tipo', 'numero_en_base', 'numero_en_planilla']);
  escribirCsv(carpeta, 'personas.csv', [...plan.personas].map(([nombre, p]) => ({ nombre, rol: [...p.roles].join(' / '), veces: p.veces })), ['nombre', 'rol', 'veces']);
  return carpeta;
}

/* ------------------------------------------------------------ aplicar */
const DESHACER = Symbol('ensayo');
async function aplicar() {
  const idsNuevos = [];
  await enTransaccion(async (cx) => {
    // 1. locales nuevos (y se reemplaza el id provisorio por el real)
    for (const a of plan.altasLocales) {
      const d = a.datos;
      const [r] = await cx.execute(
        `INSERT INTO local (cuit, id_original, id_usuario, id_rubro, id_estado, razon_social, nombre_local, direccion_local, domicilio_fiscal,
                            latitud_local, longitud_local, email_local, telefono_local, observacion, bloqueado, habilita)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
        [d.cuit, a.idOriginal, d.idRubro, d.idEstado, d.razonSocial, d.nombreLocal ?? d.razonSocial, d.direccion, d.domicilioFiscal,
          d.coordenadas?.latitud ?? null, d.coordenadas?.longitud ?? null, d.email, d.telefono,
          d.observaciones || null],
      );
      a.idLocal = r.insertId;
      idsNuevos.push(r.insertId);
    }
    // 2. datos que faltaban en locales existentes
    for (const u of plan.actualizaciones) {
      const columnas = Object.keys(u.campos);
      await cx.execute(`UPDATE local SET ${columnas.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id_local = ?`, [...columnas.map((c) => u.campos[c]), u.idLocal]);
    }
    // 3. trámites (el local nuevo ya tiene id real)
    const ciclos = new Map();
    const ciclo = async (idLocal) => {
      if (!ciclos.has(idLocal)) ciclos.set(idLocal, await cicloActual(idLocal, cx));
      return ciclos.get(idLocal);
    };
    for (const r of plan.relevamientos) {
      await insertarTramite(cx, { ...r.tramite, idLocal: r.local.idLocal, idUsuario: null, nroCiclo: await ciclo(r.local.idLocal) });
    }
    for (const a of plan.actuaciones) {
      const idLocal = a.local.idLocal;
      const idTramite = await insertarTramite(cx, { ...a.tramite, idLocal, idUsuario: null, nroCiclo: await ciclo(idLocal) });
      if (a.documento) {
        await cx.execute(
          `INSERT INTO documentacion (id_tramite, id_tdocumentacion, numero, origen, fecha_emision, fecha_vencimiento, habilita)
           VALUES (?, ?, ?, 'CARGADO_OFICINA', ?, ?, 1)`,
          [idTramite, a.documento.idTdocumentacion, a.documento.numero, a.documento.fechaEmision, a.documento.fechaVencimiento],
        );
      }
    }
    if (ENSAYO) throw DESHACER;
  }).catch((e) => { if (e !== DESHACER) throw e; });
  if (ENSAYO) return idsNuevos.length;
  // 4. la auditoría anota el punto de partida de los locales nuevos y el cambio
  //    de estado de los que recibieron trámites, igual que al pasar los días.
  await registrarPasoDelTiempo();
  return idsNuevos.length;
}

/* ------------------------------------------------------------ principal */
const idx = await cargarIndices();
const params = await parametros();
if (args.padron) procesarPadron(leerCsv(args.padron), idx);
if (args.relevamientos) procesarRelevamientos(leerCsv(args.relevamientos), idx);
if (args.actuaciones) procesarActuaciones(leerCsv(args.actuaciones), idx, params);

const porTipo = {};
for (const a of plan.actuaciones) porTipo[a.tipo] = (porTipo[a.tipo] ?? 0) + 1;
console.log(`
=== ${APLICAR ? 'APLICANDO' : ENSAYO ? 'ENSAYO (se escribe y se deshace)' : 'SIMULACIÓN (no se escribe nada)'} ===`);
console.log(`Locales en la base: ${idx.localPorOriginal.size} con código viejo`);
console.log(`Locales nuevos:                  ${plan.altasLocales.length}`);
console.log(`Locales a completar (vacíos):    ${plan.actualizaciones.length}`);
console.log(`Locales con datos distintos:     ${plan.diferencias.length}  (se listan, no se pisan)`);
console.log(`Relevamientos nuevos:            ${plan.relevamientos.length}`);
console.log(`Actuaciones nuevas:              ${plan.actuaciones.length}  ${JSON.stringify(porTipo)}`);
console.log(`Filas descartadas (con motivo):  ${plan.descartados.length}`);
console.log(`Ya cargadas con otro número:     ${plan.numerosDistintos.length}  (se listan, no se tocan)`);
console.log(`Personas nombradas:              ${plan.personas.size}`);
const carpeta = escribirListados();
console.log(`\nListados en ${carpeta}`);

if (APLICAR) {
  const n = await aplicar();
  console.log(`\nListo: ${n} local(es) nuevo(s), ${plan.relevamientos.length} relevamientos y ${plan.actuaciones.length} actuaciones cargados.`);
  console.log('Ahora corré "Recalcular estados" desde Configuración → Herramientas para que el padrón refleje lo cargado.');
} else if (ENSAYO) {
  await aplicar();
  console.log('\nEnsayo terminado: todas las escrituras pasaron y se deshicieron. Podés correr con --aplicar.');
} else {
  console.log('\nRevisá los listados. Para cargar de verdad, agregá --aplicar al mismo comando.');
}
await pool.end();
process.exit(0);
