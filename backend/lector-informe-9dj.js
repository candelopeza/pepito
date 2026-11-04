/* ============================================================================
   backend/lector-informe-9dj.js  —  DEL ARCHIVO DE LA PRESTATARIA A FILAS
   ----------------------------------------------------------------------------
   Sección 9.3 del pliego, modelo de foto: el informe de 9 de Julio es una foto
   de su padrón de contratos. Este módulo resuelve UNA sola cosa: convertir el
   archivo que mande la prestataria en filas normalizadas

       { cuit, cuitValido, razonSocial, direccion, numeroContrato,
         vencimiento, crudo }

   y NADA más. No toca la base, no cruza contra el padrón, no decide nada: eso
   es del módulo que lo llama. Está separado a propósito, porque el formato del
   archivo es lo único de todo el circuito que NO controla el área: el día que
   la prestataria cambie la planilla, se toca este archivo y el resto queda.

   >>> TODO-DEFINICION: EL FORMATO REAL DEL ARCHIVO <<<
   Todavía no se recibió un informe real de la prestataria. Los formatos de acá
   salen de lo que la especificación da por posible (planilla, PDF con capa de
   texto, escaneo). Cuando llegue el primero real, ajustar la detección de
   columnas con ese archivo adelante.

   QUÉ SE ACEPTA, EN ORDEN DE PREFERENCIA
     1. Planilla (.xlsx) o texto separado (.csv, .txt): el formato pedido a la
        prestataria. Columnas por encabezado, en cualquier orden.
     2. PDF con capa de texto: se extrae el texto y se arman filas alrededor de
        cada CUIT que aparece. Mejor esfuerzo, con advertencia.
     3. Escaneo (PDF sin capa de texto, foto): NO implementado. Es la
        contingencia OCR de la especificación: queda detrás de esta misma
        interfaz, y mientras tanto el error le dice al agente qué pedir.

   >>> EL DÍGITO VERIFICADOR DE CUIT ES LA RED ANTI-ERROR <<<
   Un CUIT argentino termina en un dígito calculado a partir de los otros diez.
   Un error de tipeo o de OCR (un 0 leído como 8) rompe la cuenta casi siempre.
   Por eso cada CUIT se verifica: el que no cierra NO se descarta —la fila se
   conserva y se muestra— pero queda marcado `cuitValido: false` para que una
   persona lo mire antes de que ese CUIT cruce contra el padrón.
   ============================================================================ */

import { createHash } from 'node:crypto';

/* ---------------------------------------------------------------------------
   1. EL CUIT Y SU DÍGITO VERIFICADOR
   ---------------------------------------------------------------------------
   Algoritmo oficial (AFIP): los primeros diez dígitos se multiplican por la
   serie 5 4 3 2 7 6 5 4 3 2, se suma, y el verificador es 11 menos el resto de
   dividir por 11. Si da 11 se usa 0; si da 10 el CUIT no existe (AFIP no los
   emite), así que acá es inválido.
   --------------------------------------------------------------------------- */
const SERIE_CUIT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function validarCuit(texto) {
  const digitos = String(texto ?? '').replace(/\D/g, '');
  if (!digitos) return { cuit: null, valido: false, motivo: 'Sin CUIT.' };
  if (digitos.length !== 11) {
    return { cuit: digitos, valido: false, motivo: `El CUIT tiene ${digitos.length} dígitos y deben ser 11.` };
  }

  const suma = SERIE_CUIT.reduce((total, factor, i) => total + factor * Number(digitos[i]), 0);
  let verificador = 11 - (suma % 11);
  if (verificador === 11) verificador = 0;

  if (verificador === 10 || verificador !== Number(digitos[10])) {
    return { cuit: digitos, valido: false, motivo: 'El dígito verificador no cierra: puede ser un error de tipeo o de lectura.' };
  }
  return { cuit: digitos, valido: true };
}

/* ---------------------------------------------------------------------------
   2. LA HUELLA DEL ARCHIVO
   ---------------------------------------------------------------------------
   SHA-256 del contenido. Dos cargas del MISMO archivo dan la misma huella, y
   así el módulo detecta "este informe ya se cargó" aunque lo hayan renombrado.
   --------------------------------------------------------------------------- */
export function huellaDeArchivo(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/* ---------------------------------------------------------------------------
   3. FECHAS
   ---------------------------------------------------------------------------
   El vencimiento puede venir como 31/12/2026, 31-12-2026, 2026-12-31 o como
   fecha de Excel (un Date ya armado). Una celda vacía es un contrato sin
   vencimiento informado, y eso se acepta. Una celda CON ALGO que no se
   entiende (texto, o un día que no existe como 31/11) NO se acepta en
   silencio: `motivoDeFecha` explica qué tiene de malo y la carga entera se
   rechaza con ese motivo (rutas/informe-9dj.js), para que corrijan el archivo
   y lo vuelvan a subir. Pedido del 4/11/2026: antes quedaba vacío y nadie se
   enteraba, o la base lo rechazaba al guardar con un error incomprensible.
   --------------------------------------------------------------------------- */
export function normalizarFecha(valor) {
  if (valor === null || valor === undefined || valor === '') return null;

  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    // Las fechas de Excel vienen en UTC: se lee en UTC para no correrse un día.
    return valor.toISOString().slice(0, 10);
  }

  const texto = String(valor).trim();

  let m = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return componerFecha(m[1], m[2], m[3]);

  m = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return componerFecha(m[3], m[2], m[1]);

  m = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/);
  if (m) return componerFecha(`20${m[3]}`, m[2], m[1]);

  return null;
}

const DIAS_DEL_MES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/* Por qué un vencimiento no se pudo leer, o null si está bien (o vacío). */
export function motivoDeFecha(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? 'la celda tiene una fecha inválida de Excel' : null;
  if (normalizarFecha(valor) !== null) return null;
  const texto = String(valor).trim();
  const m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/) ?? texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const esISO = texto.match(/^\d{4}-/);
    const mes = Number(m[2]);
    const dia = Number(esISO ? m[3] : m[1]);
    let anio = Number(esISO ? m[1] : m[3]);
    if (anio < 100) anio += 2000;
    if (mes < 1 || mes > 12) return `"${texto}" no es una fecha: el mes ${mes} no existe`;
    const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
    if (dia < 1 || dia > ultimo) return `"${texto}" no es una fecha: ${DIAS_DEL_MES[mes]} de ${anio} tiene ${ultimo} días`;
  }
  return `"${texto}" no se reconoce como fecha (se esperan formatos como 31/12/2026 o 2026-12-31)`;
}

function componerFecha(a, mes, dia) {
  const aa = Number(a);
  const mm = Number(mes);
  const dd = Number(dia);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  // Que el día exista en ese mes: 31/11 o 29/02 de un año no bisiesto pasan
  // el control de arriba, pero la base los rechaza al guardar y se caía la
  // carga entera. Una fecha imposible queda vacía, como una ilegible.
  const fecha = new Date(Date.UTC(aa, mm - 1, dd));
  if (fecha.getUTCFullYear() !== aa || fecha.getUTCMonth() !== mm - 1 || fecha.getUTCDate() !== dd) return null;
  return `${a}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/* ---------------------------------------------------------------------------
   4. DETECCIÓN DE COLUMNAS POR ENCABEZADO
   ---------------------------------------------------------------------------
   La planilla puede traer las columnas en cualquier orden y con cualquier
   nombre razonable ("CUIT", "C.U.I.T.", "Razón Social", "TITULAR"...). Se
   busca la fila de encabezados y se mapea cada columna por su nombre, sin
   tildes y en minúsculas. Lo que no se reconoce se ignora.
   --------------------------------------------------------------------------- */
const sinTildes = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/* El orden importa: 'contrato' se prueba antes que nada que diga 'numero',
   porque "N° de contrato" debe caer en contrato y no en otra cosa. */
const COLUMNAS = [
  ['cuit', /c\.?u\.?i\.?t|cuil/],
  ['vencimiento', /venc|vto|vigencia|hasta/],
  ['numeroContrato', /contrato/],
  ['razonSocial', /razon|titular|denominacion|nombre|cliente/],
  ['direccion', /direccion|domicilio|calle|ubicacion/],
];

function mapearEncabezados(celdas) {
  const mapa = {};
  celdas.forEach((celda, i) => {
    const nombre = sinTildes(celda);
    if (!nombre) return;
    for (const [campo, patron] of COLUMNAS) {
      if (patron.test(nombre) && mapa[campo] === undefined) {
        mapa[campo] = i;
        return;
      }
    }
  });
  // Sin CUIT no hay cruce posible: es la única columna obligatoria.
  return mapa.cuit === undefined ? null : mapa;
}

/* Arma la fila normalizada a partir de las celdas y el mapa de columnas. */
function armarFila(celdas, mapa, numeroDeFila) {
  const leer = (campo) => {
    const i = mapa[campo];
    if (i === undefined) return '';
    const v = celdas[i];
    if (v instanceof Date) return v;
    return String(v ?? '').trim();
  };

  const { cuit, valido, motivo } = validarCuit(leer('cuit'));
  return {
    numeroDeFila,
    cuit,
    cuitValido: valido,
    motivoCuit: motivo ?? null,
    razonSocial: leer('razonSocial'),
    direccion: leer('direccion'),
    numeroContrato: String(leer('numeroContrato')),
    vencimiento: normalizarFecha(leer('vencimiento')),
    motivoVencimiento: motivoDeFecha(leer('vencimiento')),
    // La fila tal como vino, para que el agente pueda cotejar contra el
    // archivo original sin salir de la pantalla.
    crudo: celdas.map((c) => (c instanceof Date ? normalizarFecha(c) : String(c ?? '').trim())).join(' | '),
  };
}

/* Una fila sin NINGÚN dato no es un comercio: es el renglón vacío del final de
   la planilla o una línea decorativa del PDF. */
const tieneDatos = (f) => Boolean(f.cuit || f.razonSocial || f.direccion || f.numeroContrato);

/* ---------------------------------------------------------------------------
   5. CSV / TEXTO SEPARADO
   ---------------------------------------------------------------------------
   Separador autodetectado (; , o tabulación: el que más aparezca en la línea
   de encabezados), comillas dobles respetadas, y codificación con red: si el
   archivo no es UTF-8 válido se relee como Latin-1, que es lo que exportan los
   Excel viejos de oficina ("Ñ" y tildes incluidas).
   --------------------------------------------------------------------------- */
function decodificarTexto(buffer) {
  const utf8 = buffer.toString('utf8');
  // El carácter de reemplazo delata que el archivo no era UTF-8.
  return utf8.includes('�') ? buffer.toString('latin1') : utf8.replace(/^﻿/, '');
}

function partirLineaCsv(linea, separador) {
  const celdas = [];
  let actual = '';
  let entreComillas = false;
  for (let i = 0; i < linea.length; i += 1) {
    const c = linea[i];
    if (c === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"';
        i += 1;
      } else entreComillas = !entreComillas;
    } else if (c === separador && !entreComillas) {
      celdas.push(actual);
      actual = '';
    } else actual += c;
  }
  celdas.push(actual);
  return celdas.map((c) => c.trim());
}

function leerCsv(buffer) {
  const lineas = decodificarTexto(buffer)
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (!lineas.length) throw new ErrorDeLectura('El archivo está vacío.');

  // Se busca la fila de encabezados entre las primeras diez líneas: algunas
  // planillas traen un título o membrete arriba. De los tres separadores
  // posibles gana el que reconoce MÁS columnas: con el separador equivocado la
  // línea queda en una sola celda gigante donde igual aparece la palabra
  // "cuit", y eso parecería un encabezado válido de una columna.
  for (let fila = 0; fila < Math.min(lineas.length, 10); fila += 1) {
    let mejor = null;
    for (const separador of [';', ',', '\t']) {
      const mapa = mapearEncabezados(partirLineaCsv(lineas[fila], separador));
      if (mapa && (!mejor || Object.keys(mapa).length > Object.keys(mejor.mapa).length)) {
        mejor = { mapa, separador };
      }
    }
    if (mejor) {
      const filas = lineas
        .slice(fila + 1)
        .map((l, i) => armarFila(partirLineaCsv(l, mejor.separador), mejor.mapa, fila + 2 + i))
        .filter(tieneDatos);
      return { filas, formato: 'planilla' };
    }
  }
  throw new ErrorDeLectura(
    'No se encontró la fila de encabezados: el archivo tiene que tener al menos una columna CUIT. ' +
      `La primera línea dice: "${lineas[0].slice(0, 120)}".`,
  );
}

/* ---------------------------------------------------------------------------
   6. XLSX
   --------------------------------------------------------------------------- */
async function leerXlsx(buffer) {
  const { default: ExcelJS } = await import('exceljs');
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer);

  const hoja = libro.worksheets[0];
  if (!hoja) throw new ErrorDeLectura('La planilla no tiene ninguna hoja.');

  // A matriz de celdas. `row.values` de exceljs arranca en el índice 1.
  const matriz = [];
  hoja.eachRow({ includeEmpty: false }, (row) => {
    matriz.push(
      row.values.slice(1).map((v) => {
        if (v === null || v === undefined) return '';
        if (v instanceof Date) return v;
        // Las celdas con formato (hipervínculo, texto enriquecido, fórmula)
        // vienen como objeto: se toma el valor plano.
        if (typeof v === 'object') return v.result ?? v.text ?? v.richText?.map((r) => r.text).join('') ?? '';
        return v;
      }),
    );
  });
  if (!matriz.length) throw new ErrorDeLectura('La planilla está vacía.');

  for (let fila = 0; fila < Math.min(matriz.length, 10); fila += 1) {
    const mapa = mapearEncabezados(matriz[fila]);
    if (mapa) {
      const filas = matriz
        .slice(fila + 1)
        .map((celdas, i) => armarFila(celdas, mapa, fila + 2 + i))
        .filter(tieneDatos);
      return { filas, formato: 'planilla' };
    }
  }
  throw new ErrorDeLectura('No se encontró la fila de encabezados: la planilla tiene que tener al menos una columna CUIT.');
}

/* ---------------------------------------------------------------------------
   7. PDF CON CAPA DE TEXTO
   ---------------------------------------------------------------------------
   Mejor esfuerzo: de un PDF no se sabe qué es columna y qué no. La estrategia
   es conservadora: solo las líneas donde aparece un CUIT se toman como filas,
   el CUIT se verifica por su dígito, y el resto de la línea queda entero en
   `crudo` con un reparto heurístico en razón social / dirección. Todo lo que
   entra por acá se marca con una advertencia para que el agente revise más.

   >>> TODO-DEFINICION <<< Ajustar con un PDF real de la prestataria.
   --------------------------------------------------------------------------- */
const PATRON_CUIT = /\b(\d{2}-?\d{8}-?\d)\b/;
const PATRON_FECHA = /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/;

export function filasDesdeTexto(texto) {
  const filas = [];
  const lineas = String(texto ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  lineas.forEach((linea, i) => {
    const cuitCrudo = linea.match(PATRON_CUIT);
    if (!cuitCrudo) return;

    const { cuit, valido, motivo } = validarCuit(cuitCrudo[1]);
    let resto = linea.replace(cuitCrudo[0], ' ');

    const fecha = resto.match(PATRON_FECHA);
    if (fecha) resto = resto.replace(fecha[0], ' ');

    // Heurística mínima: lo que queda antes de un número de calle suele ser la
    // razón social; desde ahí, la dirección. Si no se distingue, va todo junto
    // en razón social y el agente lo corrige mirando `crudo`.
    const limpio = resto.replace(/\s{2,}/g, ' ').trim();
    const corte = limpio.search(/[A-ZÁÉÍÓÚÑa-záéíóúñ.\s]\d+\s*$/);

    filas.push({
      numeroDeFila: i + 1,
      cuit,
      cuitValido: valido,
      motivoCuit: motivo ?? null,
      razonSocial: corte > 0 ? limpio.slice(0, corte + 1).trim() : limpio,
      direccion: corte > 0 ? limpio.slice(corte + 1).trim() : '',
      numeroContrato: '',
      vencimiento: fecha ? normalizarFecha(fecha[0]) : null,
      motivoVencimiento: fecha ? motivoDeFecha(fecha[0]) : null,
      crudo: linea,
    });
  });
  return filas;
}

async function leerPdf(buffer) {
  const { PDFParse } = await import('pdf-parse');
  let text;
  try {
    const analizador = new PDFParse({ data: new Uint8Array(buffer) });
    ({ text } = await analizador.getText());
    await analizador.destroy();
  } catch (e) {
    throw new ErrorDeLectura(`El PDF está dañado o no se pudo leer (${e.message}). Pedir el archivo de nuevo.`);
  }

  // Un PDF "sin texto" es un escaneo: cada página es una imagen. Es la
  // contingencia OCR de la especificación, prevista pero no implementada.
  if (!text || text.replace(/\s/g, '').length < 30) {
    throw new ErrorDeLectura(
      'El PDF no tiene capa de texto: es un escaneo o una foto. La lectura por reconocimiento óptico (OCR) ' +
        'está prevista como contingencia pero no implementada. Pedir el informe en planilla (Excel o CSV), ' +
        'que es el formato acordado con la prestataria.',
    );
  }

  const filas = filasDesdeTexto(text);
  if (!filas.length) {
    throw new ErrorDeLectura('El PDF tiene texto pero no se encontró ningún CUIT. Revisar que sea el informe de contratos.');
  }
  return {
    filas,
    formato: 'pdf',
    advertencia:
      'El archivo vino en PDF: la separación en columnas es un mejor esfuerzo. Cotejar cada fila contra el texto original antes de confirmar.',
  };
}

/* ---------------------------------------------------------------------------
   8. LA PUERTA DE ENTRADA
   ---------------------------------------------------------------------------
   leerInforme(buffer, nombreArchivo) → { filas, formato, advertencia? }
   Lanza ErrorDeLectura con un mensaje PARA EL AGENTE cuando el archivo no se
   puede procesar. Cualquier otro error es un bug y sube como tal.
   --------------------------------------------------------------------------- */
export class ErrorDeLectura extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorDeLectura';
  }
}

export async function leerInforme(buffer, nombreArchivo = '') {
  if (!buffer?.length) throw new ErrorDeLectura('El archivo está vacío.');

  const nombre = nombreArchivo.toLowerCase();

  // Por contenido antes que por extensión: los archivos reales vienen mal
  // nombrados más seguido de lo que uno quisiera.
  const esZip = buffer[0] === 0x50 && buffer[1] === 0x4b; // "PK": un .xlsx es un zip
  const esPdf = buffer.slice(0, 5).toString('latin1') === '%PDF-';

  if (esZip || nombre.endsWith('.xlsx')) return leerXlsx(buffer);
  if (esPdf || nombre.endsWith('.pdf')) return leerPdf(buffer);
  if (/\.(csv|txt|tsv)$/.test(nombre) || !nombre) return leerCsv(buffer);

  // .xls viejo, .doc, imágenes sueltas: afuera, con el motivo claro.
  throw new ErrorDeLectura(
    `No se puede leer "${nombreArchivo}": los formatos aceptados son planilla (.xlsx), texto separado (.csv) y PDF con capa de texto. ` +
      'Si es una foto o un escaneo, pedir el informe en planilla.',
  );
}
