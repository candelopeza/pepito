/* ============================================================================
   pruebas/lector-informe.mjs  —  LA LECTURA DEL INFORME DE LA PRESTATARIA
   ----------------------------------------------------------------------------
   Se ejecuta con:  npm run lector

   La especificación del módulo Informe 9 de Julio lo pide con estas palabras:
   "Implementá primero la lectura del archivo y su suite de pruebas, antes que
   la interfaz". Esto es esa suite: prueba backend/lector-informe-9dj.js sin
   base de datos y sin servidor, archivo adentro → filas afuera.

   TODO-DEFINICION: estos archivos de prueba imitan lo que la especificación da
   por posible. Cuando llegue el PRIMER INFORME REAL de la prestataria, sumarle
   acá una prueba con (un recorte de) ese archivo, que es la única prueba que
   de verdad fija el formato.
   ============================================================================ */

import {
  ErrorDeLectura,
  filasDesdeTexto,
  huellaDeArchivo,
  leerInforme,
  normalizarFecha,
  validarCuit,
} from '../backend/lector-informe-9dj.js';

let ok = 0;
let fallas = 0;

function verificar(criterio, obtenido, esperado) {
  const o = JSON.stringify(obtenido);
  const e = JSON.stringify(esperado);
  if (o === e) {
    ok += 1;
    console.log(`OK   ${criterio}`);
  } else {
    fallas += 1;
    console.log(`FALLA ${criterio}`);
    console.log(`      esperado: ${e}`);
    console.log(`      obtenido: ${o}`);
  }
}

async function verificarRechazo(criterio, promesa, pedazoDelMensaje) {
  try {
    await promesa;
    fallas += 1;
    console.log(`FALLA ${criterio}`);
    console.log('      esperado: que lo rechace, y lo aceptó');
  } catch (e) {
    if (e instanceof ErrorDeLectura && e.message.includes(pedazoDelMensaje)) {
      ok += 1;
      console.log(`OK   ${criterio}`);
    } else {
      fallas += 1;
      console.log(`FALLA ${criterio}`);
      console.log(`      esperado: ErrorDeLectura con "${pedazoDelMensaje}"`);
      console.log(`      obtenido: ${e.name}: ${e.message}`);
    }
  }
}

function seccion(titulo) {
  console.log(`\n=== ${titulo} ===`);
}

/* 20-12345678-6 cierra: 2·5+0·4+1·3+2·2+3·7+4·6+5·5+6·4+7·3+8·2 = 148,
   148 % 11 = 5, 11 − 5 = 6. Es el CUIT válido de cabecera de estas pruebas. */
const CUIT_OK = '20123456786';

/* ===========================================================================
   EL DÍGITO VERIFICADOR DE CUIT
   =========================================================================== */
seccion('CUIT: el dígito verificador como red contra errores de tipeo y de OCR');

verificar('un CUIT que cierra pasa', validarCuit('20123456786').valido, true);
verificar('los guiones no molestan', validarCuit('20-12345678-6'), { cuit: CUIT_OK, valido: true });
verificar('los espacios tampoco', validarCuit(' 20 12345678 6 ').valido, true);
verificar('un dígito cambiado (error de tipeo) no cierra', validarCuit('20123456886').valido, false);
verificar('el verificador equivocado no cierra', validarCuit('20123456785').valido, false);
verificar('un 0 leído como letra O por el OCR deja 10 dígitos: inválido', validarCuit('2O-12345678-6').valido, false);
verificar('diez dígitos no son un CUIT', validarCuit('2012345678').valido, false);
verificar('vacío no es un CUIT', validarCuit('').valido, false);
verificar(
  'el inválido dice por qué, para que el agente sepa qué mirar',
  validarCuit('20123456785').motivo.includes('verificador'),
  true,
);
/* 2012345676 suma 144, 144 % 11 = 1, verificador 10: AFIP no emite esos CUIT. */
verificar('un CUIT cuyo verificador daría 10 no existe: inválido', validarCuit('20123456760').valido, false);

/* ===========================================================================
   FECHAS DE VENCIMIENTO
   =========================================================================== */
seccion('Fechas: lo que no se entiende queda vacío, nunca inventado');

verificar('31/12/2026 se entiende', normalizarFecha('31/12/2026'), '2026-12-31');
verificar('31-12-2026 también', normalizarFecha('31-12-2026'), '2026-12-31');
verificar('1/3/26 completa el siglo', normalizarFecha('1/3/26'), '2026-03-01');
verificar('el formato ISO pasa tal cual', normalizarFecha('2026-12-31'), '2026-12-31');
verificar('una fecha de Excel (Date) se lee en UTC sin correrse un día', normalizarFecha(new Date('2026-12-31T00:00:00Z')), '2026-12-31');
verificar('un mes 99 no es una fecha', normalizarFecha('99/99/2026'), null);
verificar('vacío es vacío, no la fecha de hoy', normalizarFecha(''), null);
verificar('un texto cualquiera no es una fecha', normalizarFecha('sin vencimiento'), null);

/* ===========================================================================
   LA HUELLA DEL ARCHIVO
   =========================================================================== */
seccion('Huella: el mismo archivo se reconoce aunque lo renombren');

const archivoA = Buffer.from('CUIT;RAZON SOCIAL\n20-12345678-6;ALMACEN DON PEDRO\n');
verificar('el mismo contenido da la misma huella', huellaDeArchivo(archivoA), huellaDeArchivo(Buffer.from(archivoA)));
verificar(
  'un byte distinto da otra huella',
  huellaDeArchivo(archivoA) === huellaDeArchivo(Buffer.from(`${archivoA.toString()} `)),
  false,
);

/* ===========================================================================
   CSV
   =========================================================================== */
seccion('CSV: columnas por nombre, en cualquier orden, con cualquier separador');

const csv = (texto) => Buffer.from(texto);

{
  const { filas, formato } = await leerInforme(
    csv(
      'C.U.I.T.;Razón Social;Domicilio;N° de Contrato;Vencimiento\n' +
        '20-12345678-6;ALMACEN DON PEDRO;SAN MARTIN 450;CON-0012;31/12/2026\n',
    ),
    'informe.csv',
  );
  verificar('una fila completa se lee entera', filas[0], {
    numeroDeFila: 2,
    cuit: CUIT_OK,
    cuitValido: true,
    motivoCuit: null,
    razonSocial: 'ALMACEN DON PEDRO',
    direccion: 'SAN MARTIN 450',
    numeroContrato: 'CON-0012',
    vencimiento: '2026-12-31',
    crudo: '20-12345678-6 | ALMACEN DON PEDRO | SAN MARTIN 450 | CON-0012 | 31/12/2026',
  });
  verificar('el formato que informa es planilla', formato, 'planilla');
}

{
  const { filas } = await leerInforme(
    csv('Vencimiento,TITULAR,CUIT,Dirección\n,SUPERMERCADO SOL,20-12345678-6,"ALEM, ESQUINA MUÑECAS 123"\n'),
    'informe.csv',
  );
  verificar('las columnas desordenadas no importan: manda el encabezado', filas[0].razonSocial, 'SUPERMERCADO SOL');
  verificar('la coma entre comillas no parte la celda', filas[0].direccion, 'ALEM, ESQUINA MUÑECAS 123');
  verificar('sin columna de contrato, el número queda vacío (no inventado)', filas[0].numeroContrato, '');
  verificar('sin vencimiento, vacío', filas[0].vencimiento, null);
}

{
  const { filas } = await leerInforme(
    csv(
      'INFORME MENSUAL DE CONTRATOS - 9 DE JULIO S.A.\n' +
        'CUIT;RAZON SOCIAL;DOMICILIO\n' +
        '20-12345678-6;BAR AVENIDA;MENDOZA 102\n' +
        '20-12345678-5;KIOSCO 25;MUÑECAS 800\n' +
        ';;\n',
    ),
    'informe.csv',
  );
  verificar('el membrete arriba del encabezado no molesta', filas.length, 2);
  verificar('la fila con CUIT que no cierra SE CONSERVA, marcada', filas[1].cuitValido, false);
  verificar('y trae el motivo para el agente', Boolean(filas[1].motivoCuit), true);
  verificar('los renglones vacíos del final no son comercios', filas.some((f) => !f.cuit && !f.razonSocial), false);
}

{
  // "Ñ" y tilde en Latin-1, como exporta un Excel viejo de oficina.
  const latin1 = Buffer.from('CUIT;RAZON SOCIAL\n20-12345678-6;PEÑA EL BAGUALÓN\n', 'latin1');
  const { filas } = await leerInforme(latin1, 'informe.csv');
  verificar('un CSV en Latin-1 (Excel viejo) no rompe las eñes', filas[0].razonSocial, 'PEÑA EL BAGUALÓN');
}

await verificarRechazo(
  'un archivo sin columna CUIT se rechaza con el motivo claro',
  leerInforme(csv('NOMBRE;TELEFONO\nPEDRO;123\n'), 'otracosa.csv'),
  'columna CUIT',
);
await verificarRechazo('un archivo vacío se rechaza', leerInforme(csv(''), 'vacio.csv'), 'vacío');

/* ===========================================================================
   XLSX
   =========================================================================== */
seccion('XLSX: la planilla de Excel, con sus fechas como fechas');

{
  // exceljs vive en backend/node_modules (es una dependencia del backend, no
  // del front): se resuelve desde ahí.
  const { createRequire } = await import('node:module');
  const ExcelJS = createRequire(new URL('../backend/', import.meta.url))('exceljs');
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Contratos');
  hoja.addRow(['CUIT', 'Razón Social', 'Domicilio', 'Contrato', 'Vencimiento']);
  hoja.addRow(['20-12345678-6', 'ALMACEN DON PEDRO', 'SAN MARTIN 450', 12, new Date('2026-12-31T00:00:00Z')]);
  hoja.addRow(['20-12345678-5', 'KIOSCO 25', 'MUÑECAS 800', '', '']);
  const xlsx = Buffer.from(await libro.xlsx.writeBuffer());

  const { filas, formato } = await leerInforme(xlsx, 'informe.xlsx');
  verificar('la planilla se lee', filas.length, 2);
  verificar('el formato que informa es planilla', formato, 'planilla');
  verificar('la celda de fecha de Excel llega como fecha', filas[0].vencimiento, '2026-12-31');
  verificar('un contrato numérico llega como texto', filas[0].numeroContrato, '12');
  verificar('el CUIT inválido también viene marcado acá', filas[1].cuitValido, false);

  const renombrado = await leerInforme(xlsx, 'informe.csv');
  verificar('un .xlsx renombrado .csv se detecta por contenido igual', renombrado.filas.length, 2);
}

/* ===========================================================================
   PDF CON CAPA DE TEXTO (mejor esfuerzo)
   =========================================================================== */
seccion('PDF: solo lo seguro — el CUIT verificado ancla cada fila');

{
  const filas = filasDesdeTexto(
    'INFORME DE CONTRATOS VIGENTES\n' +
      'Página 1 de 3\n' +
      'ALMACEN DON PEDRO 20-12345678-6 SAN MARTIN 450 31/12/2026\n' +
      'KIOSCO 25 20-12345678-5 MUÑECAS 800\n' +
      'Total: 2 contratos\n',
  );
  verificar('solo las líneas con CUIT son filas: membrete y totales afuera', filas.length, 2);
  verificar('el CUIT se extrae y se verifica', filas[0].cuit, CUIT_OK);
  verificar('la fecha de la línea es el vencimiento', filas[0].vencimiento, '2026-12-31');
  verificar('la línea entera queda en crudo para cotejar', filas[0].crudo.includes('ALMACEN DON PEDRO'), true);
  verificar('el CUIT que no cierra queda marcado también acá', filas[1].cuitValido, false);
}

await verificarRechazo(
  'un archivo que no es planilla, CSV ni PDF se rechaza nombrando los formatos',
  leerInforme(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), 'foto-informe.jpg'),
  'formatos aceptados',
);

/* ===========================================================================
   RESULTADO
   =========================================================================== */
console.log(`\n${ok} criterio(s) cumplidos · ${fallas} falla(s)`);
process.exit(fallas ? 1 : 0);
