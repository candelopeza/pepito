/* ============================================================================
   datos/leerInforme.js  —  EL ARCHIVO QUE MANDA LA EMPRESA 9 DE JULIO
   ----------------------------------------------------------------------------
   Convierte el listado de contratos de la prestataria (sección 9.3) en las
   filas que analiza pages/herramientas/Informe9DJ.jsx.

   FORMATO: CSV, que es lo que guarda Excel con "Guardar como → CSV". Acepta
   punto y coma (el Excel en castellano) o coma como separador, y campos entre
   comillas. El XLSX no se lee directo: habría que sumar una librería, y con
   guardarlo como CSV alcanza.

   LAS COLUMNAS SE RECONOCEN POR EL TÍTULO, no por la posición, y sin importar
   mayúsculas ni acentos:
     cuit             CUIT, CUIT/CUIL
     razonSocial      Razón social, Titular, Nombre, Empresa, Cliente
     direccion        Dirección, Domicilio, Calle
     numeroContrato   Contrato, N° contrato, Número
     vencimiento      Vencimiento, Vence, Fecha de vencimiento, Vto, Hasta
   Las fechas pueden venir como 2027-03-01 o 01/03/2027.
   ============================================================================ */

const COLUMNAS = {
  cuit: ['cuit', 'cuitcuil', 'nrocuit', 'numerocuit'],
  razonSocial: ['razonsocial', 'razon', 'titular', 'nombre', 'empresa', 'cliente', 'denominacion'],
  direccion: ['direccion', 'domicilio', 'domiciliocomercial', 'calle', 'ubicacion'],
  numeroContrato: ['contrato', 'nrocontrato', 'ncontrato', 'numerocontrato', 'nrodecontrato', 'numero', 'nro'],
  vencimiento: ['vencimiento', 'vence', 'fechavencimiento', 'fechadevencimiento', 'fechavto', 'vto', 'hasta', 'vigenciahasta'],
};

const normalizar = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/* Parte una línea de CSV respetando las comillas ("Pérez; Juan" es un campo). */
function partirLinea(linea, separador) {
  const campos = [];
  let actual = '';
  let entreComillas = false;
  for (let i = 0; i < linea.length; i += 1) {
    const c = linea[i];
    if (entreComillas) {
      if (c === '"' && linea[i + 1] === '"') {
        actual += '"';
        i += 1;
      } else if (c === '"') {
        entreComillas = false;
      } else {
        actual += c;
      }
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === separador) {
      campos.push(actual.trim());
      actual = '';
    } else {
      actual += c;
    }
  }
  campos.push(actual.trim());
  return campos;
}

/* '01/03/2027', '1/3/27' o '2027-03-01' -> '2027-03-01'. '' si no se entiende. */
export function fechaISO(texto) {
  const t = String(texto ?? '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (m) {
    const anio = m[3].length === 2 ? `20${m[3]}` : m[3];
    const iso = `${anio}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return Number.isNaN(Date.parse(iso)) ? '' : iso;
  }
  return '';
}

/* texto del archivo -> { filas: [{ cuit, razonSocial, direccion, numeroContrato, vencimiento }], errores: [] } */
export function leerInformeCsv(texto) {
  const lineas = String(texto ?? '')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lineas.length < 2) return { filas: [], errores: ['El archivo no tiene filas debajo de los títulos.'] };

  const encabezado = lineas[0];
  const separador = (encabezado.match(/;/g) ?? []).length >= (encabezado.match(/,/g) ?? []).length ? ';' : ',';
  const titulos = partirLinea(encabezado, separador).map(normalizar);

  const indice = {};
  for (const [campo, nombres] of Object.entries(COLUMNAS)) {
    indice[campo] = titulos.findIndex((t) => nombres.includes(t));
  }
  const errores = [];
  if (indice.vencimiento < 0) errores.push('No se encontró la columna del vencimiento del contrato.');
  if (indice.cuit < 0 && indice.razonSocial < 0) errores.push('No se encontró ni la columna del CUIT ni la de la razón social.');
  if (errores.length) return { filas: [], errores };

  const filas = [];
  lineas.slice(1).forEach((linea, i) => {
    const campos = partirLinea(linea, separador);
    const valor = (campo) => (indice[campo] >= 0 ? campos[indice[campo]] ?? '' : '');
    const vencimiento = fechaISO(valor('vencimiento'));
    if (!vencimiento) {
      errores.push(`Fila ${i + 2}: el vencimiento "${valor('vencimiento')}" no es una fecha.`);
      return;
    }
    filas.push({
      cuit: valor('cuit'),
      razonSocial: valor('razonSocial'),
      direccion: valor('direccion'),
      numeroContrato: valor('numeroContrato'),
      vencimiento,
    });
  });
  return { filas, errores };
}
