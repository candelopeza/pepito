/* ============================================================================
   dominio/cedulaOficial.js  —  EL MODELO OFICIAL DE LA CÉDULA (26/10/2026)
   ----------------------------------------------------------------------------
   El texto de las dos notificaciones tal como lo pasó la Dirección de
   Ambiente (PRIMERA y SEGUNDA NOTIFICACION), con los datos del local ya
   completados. Lo usan las dos cosas que muestran la cédula, para que no
   puedan diferir:
     - components/pdfCedulas.js   la imprime (tres copias iguales);
     - components/VistaCedula.jsx la muestra en pantalla ("Ver cédula").

   Cada párrafo es una lista de partes { t: texto, e: estilo }, con estilo
   'normal', 'bold' o 'bolditalic', como las negritas del modelo.

   FORMATO_OFICIAL en false vuelve al formato anterior: el texto editable de
   Configuración → Plantilla de cédula (dominio/textoCedula.js), que quedó
   intacto.

   12/11/2026: la Dirección pasó un modelo nuevo. El texto es más corto, las
   ordenanzas van con viñeta y abajo hay un recuadro con la documentación a
   presentar y un QR a las plantillas. Se apagan por separado con
   TEXTO_NOVIEMBRE y RECUADRO_DOCUMENTACION; el texto del 26/10 sigue abajo.
   ============================================================================ */

import { faltantesParaCedula, rubroSinInformar } from './reglas.js';

export const FORMATO_OFICIAL = true;

/* El texto del modelo del 12/11/2026, en las dos notificaciones: más corto,
   las ordenanzas con viñeta en vez de casillero y "sita en calle". En false
   vuelve el texto del 26/10 (ORDENANZAS y los párrafos de
   contenidoCedulaOficial). */
export const TEXTO_NOVIEMBRE = true;

/* El recuadro "DOCUMENTACIÓN QUE DEBE PRESENTAR" con el QR, entre el último
   párrafo y las firmas, en las dos notificaciones. En false sale sin él. */
export const RECUADRO_DOCUMENTACION = true;

/* Adónde lleva el QR: la página de la Dirección con las plantillas para
   descargar (DDJJ de Generadores Menores, Formulario de presentación de
   Contrato y DDJJ de separación de residuos secos y limpios). Es la misma
   dirección del QR del modelo, con su "?qrcode=", así la Dirección sigue
   contando los escaneos. La imagen es src/assets/cedula/qr-plantillas.png: si
   cambia la dirección, hay que generarla de nuevo (backend/PROCEDIMIENTO.md,
   sección 25). */
export const URL_PLANTILLAS = 'https://campsite.bio/grandesgeneradores?qrcode=6af4609fec6a92a9d93f2edf';

/* Lo que dice el recuadro. El modelo decía "CINCO (5)" con cuatro ítems: se
   dejó "CUATRO (4)" (12/11/2026). */
const DOCUMENTACION = {
  titulo: 'DOCUMENTACIÓN QUE DEBE PRESENTAR · CUATRO (4) DOCUMENTOS',
  items: [
    [{ t: '1) NOTIFICACIÓN', e: 'bold' }, { t: ' (esta hoja).' }],
    [{ t: '2) FOTOCOPIA DEL DNI', e: 'bold' }, { t: ' de quien firma la nota.' }],
    [{ t: '3) DOCUMENTACIÓN COMPLETA Y FIRMADA:', e: 'bold' }, { t: ' use el modelo correspondiente del código QR y complete sus datos' }],
    [{ t: '4) DOCUMENTACIÓN AUTORIZANTE A REALIZAR EL TRAMITE', e: 'bold' }, { t: ' si corresponde' }],
  ],
};

/* Tres copias iguales de cada cédula: para el local, para la Dirección de
   Ambiente y para el expediente. */
export const COPIAS_OFICIALES = 3;

/* El "Generado el ... a las ... por ..." de abajo a la izquierda: la
   Dirección pidió sacarlo de las cédulas (27/10/2026). La hoja de ruta y los
   listados en PDF lo siguen llevando. Quién imprimió y cuándo queda igual
   registrado en el sistema (constancia de impresión, sql/04). En true vuelve. */
export const PIE_GENERADO_EN_CEDULAS = false;

/* Los logos son imágenes de src/assets/cedula/ que van dentro de la app (las
   importan pdfCedulas.js y VistaCedula.jsx): salen también sin señal. Este es
   el texto que va en su lugar si una imagen no carga. */
export const LOGOS = {
  municipio: { texto: ['Municipio', 'San Miguel de Tucumán'] },
  ambiente: { texto: ['Secretaría de Ambiente', 'y Desarrollo Sustentable', 'Dirección de Ambiente'] },
};

const EN_LETRAS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte'];

/* "0001-675" -> "0001 - 000675": la serie y el número de seis cifras, como en
   el modelo. */
export function numeroOficial(numeroCedula) {
  const [serie, numero] = String(numeroCedula ?? '').split('-');
  if (!numero) return String(numeroCedula ?? '');
  return `${serie} - ${numero.padStart(6, '0')}`;
}

/* Cuántos datos del local le faltan a la cédula para imprimirse: la primera
   solo pide nombre y dirección; la segunda, todo (dominio/reglas.js). */
export function faltantesCedulaOficial(cedula, local) {
  return faltantesParaCedula(local, cedula?.instancia === 2 ? 2 : 1).length;
}

/* Un dato que la primera cédula no exige y el local no tiene: renglón de
   puntos, para completarlo a mano si el titular lo da en la entrega. */
const PARA_COMPLETAR = '..............................';

const ORDENANZAS = [
  {
    titulo: 'Ordenanza Municipal  N.° 2822/98:',
    texto:
      ' Prohíbe los basurales a cielo abierto y la disposición de residuos en cuerpos de agua (ríos, acequias, canales, etc.). Aplica especialmente a locales que generen residuos orgánicos o húmedos, como: Gastronomía (restaurantes, bares, rotiserías), Panaderías, Supermercados con secciones de frescos o perecederos. -',
  },
  {
    titulo: 'Ordenanza N.° 4742/14:',
    texto:
      ' Establece que los grandes generadores deben contratar servicios especiales de recolección de residuos a su cuenta y costo. Aplica a: - Supermercados - Locales gastronómicos con gran volumen de residuos- Comercios con cámaras frigoríficas o manipulación de productos frescos. -',
  },
  {
    titulo: 'Ordenanza N.° 728/67:',
    texto:
      ' Regula días y horarios permitidos para sacar los residuos a la vía pública. Aplica a todos los comercios del ejido urbano, especialmente: - Comercio General - Panaderías- Locales pequeños que depositan residuos en la vía pública. -',
  },
  {
    titulo: 'Ordenanza N.° 1740:',
    texto:
      ' Regula el tratamiento y la disposición técnica y ambientalmente adecuada de los residuos generados. Aplica a establecimientos con procesos de producción, almacenamiento prolongado o tratamiento de residuos especiales, como: - Fábricas o talleres - Comercios mayoristas - Centros logísticos o de acopio.',
  },
];

/* Las ordenanzas del modelo del 12/11/2026: más cortas, con viñeta. */
const ORDENANZAS_NOVIEMBRE = [
  { titulo: 'Ordenanza N.º 2822/98:', texto: ' Prohíbe los basurales a cielo abierto y la disposición de residuos en cuerpos de agua.' },
  {
    titulo: 'Ordenanza N.º 4742/14:',
    texto: ' Establece la obligación de los grandes generadores de contratar servicios especiales de recolección de residuos, a su cuenta y costo.',
  },
  { titulo: 'Ordenanza N.º 728/67:', texto: ' Regula los días y horarios permitidos para la disposición de residuos en la vía pública.' },
  { titulo: 'Ordenanza N.º 1740:', texto: ' Regula el tratamiento y la disposición técnica y ambientalmente adecuada de los residuos generados.' },
];

/* El texto del modelo del 12/11/2026, con el plazo de la cédula. */
function textoNoviembre(plazo) {
  return {
    parrafos: [
      [
        { t: 'Por medio de la presente, se notifica a Ud./s que, en un plazo de ' },
        { t: `${plazo} días hábiles`, e: 'bold' },
        {
          t: ' a partir de la fecha de recepción de la misma, deberá presentarse para realizar el empadronamiento obligatorio ante el Registro de Retiro de Residuos Sólidos Urbanos (RSU), correspondiente a la empresa autorizada por el Municipio, y presentar posteriormente el contrato acordado en la ',
        },
        { t: 'Dirección de Ambiente de la Municipalidad de San Miguel de Tucumán', e: 'bold' },
        { t: ', sita en calle San Martín N.º 1009, de lunes a viernes, de 8:00 a 13:00 hs.' },
      ],
      [
        { t: 'La presente notificación se enmarca en la ' },
        { t: 'Ley Provincial N.º 8.177', e: 'bold' },
        {
          t: ', de aplicación general a todos los generadores de residuos, y en las siguientes normativas municipales, según corresponda al rubro del establecimiento:',
        },
      ],
    ],
    ordenanzas: ORDENANZAS_NOVIEMBRE,
    cierre: [
      [
        { t: 'En caso de no encontrarse comprendido en los supuestos anteriores, deberá presentar una ' },
        { t: 'Declaración Jurada', e: 'bold' },
        { t: ' ante la Dirección de Ambiente, a fin de acreditar que no reviste la condición de Gran Generador.' },
      ],
      [
        {
          t: 'Vencido el plazo establecido sin haberse presentado con la documentación correspondiente, se procederá a labrar las actas de infracción pertinentes, conforme a las ordenanzas vigentes.',
        },
      ],
    ],
  };
}

/* Todo lo que lleva una cédula, con los datos del local completados. El plazo
   sale de la cédula (lo fija la emisión); si no lo trae, el del modelo. */
export function contenidoCedulaOficial(cedula, local) {
  const instancia = cedula?.instancia === 2 ? 2 : 1;
  const dias = Number(cedula?.plazoDias) || (instancia === 1 ? 5 : 3);
  const letras = EN_LETRAS[dias] ?? String(dias);
  // El modelo escribe "5 (CINCO)" en la primera y "3 (tres)" en la segunda.
  const plazo = `${dias} (${instancia === 1 ? letras.toUpperCase() : letras})`;

  const dato = (etiqueta, valor) => ({ etiqueta, valor: String(valor ?? '').trim() || PARA_COMPLETAR });
  const razonSocial = dato('Razón Social', local?.razonSocial);
  const comercio = dato('Comercio', local?.nombreLocal);
  const cuit = dato('CUIT', local?.cuit);
  const domicilio = dato('Domicilio comercial', local?.direccion);
  const rubro = dato('Rubro', rubroSinInformar(local?.rubro) ? '' : local.rubro);

  const comun = {
    instancia,
    titulo: instancia === 1 ? 'PRIMERA NOTIFICACION' : 'SEGUNDA NOTIFICACION',
    numero: numeroOficial(cedula?.numeroCedula),
    // La primera lleva los datos en un párrafo; la segunda, en dos renglones.
    datos: instancia === 1 ? [[razonSocial, comercio, cuit, domicilio, rubro]] : [[razonSocial, comercio, cuit], [domicilio, rubro]],
    // Las ordenanzas con viñeta (modelo del 12/11) o con casillero (26/10).
    vinetas: TEXTO_NOVIEMBRE,
    // El recuadro con la documentación y el QR; null si está apagado.
    documentacion: RECUADRO_DOCUMENTACION ? { ...DOCUMENTACION, url: URL_PLANTILLAS } : null,
  };
  if (TEXTO_NOVIEMBRE) return { ...comun, ...textoNoviembre(plazo) };

  return {
    ...comun,
    parrafos: [
      [
        { t: 'Por medio de la presente, notifico a Ud./s para que en un plazo de ' },
        { t: plazo, e: 'bolditalic' },
        {
          t: ' días hábiles, a partir de la fecha de notificación de la misma, se apersone para tramitar el empadronamiento obligatorio ante el Registro de Retiro de Residuos Sólidos Urbanos (RSU) de la empresa autorizada por el Municipio. Posteriormente deberá presentar el contrato acordado en la ',
        },
        { t: 'Dirección de Ambiente de la Municipalidad de San Miguel de Tucumán', e: 'bold' },
        { t: ', cita en calle ' },
        { t: 'San Martin N.° 1009 de lunes a viernes, en el horario de 8:00 a 13:00 hs.', e: 'bold' },
      ],
      [
        { t: 'Dicha notificación se encuentra enmarcada en el cumplimiento de las siguientes normativas, según el rubro del comercio: ' },
        { t: 'Ley Provincial N.° 8.177', e: 'bold' },
        { t: ' en referencia a la Gestión Integral de los Residuos Sólidos Urbanos. La misma aplica de forma general a todos los generadores de residuos en el territorio provincial.' },
      ],
    ],
    // Cada una con su casillero vacío: se tilda a mano según el rubro.
    ordenanzas: ORDENANZAS,
    cierre: [
      [{ t: '- En caso de no encontrarse comprendido en ninguno de los ítems anteriores, deben presentar Declaración Jurada en la Dirección de Ambiente que lo exime de la presentación por no ser Gran Generador.' }],
      [{ t: '- Cumplido el plazo antes mencionado, y de no haberse presentado en el lugar indicado con la documentación necesaria para realizar el empadronamiento correspondiente, se procederá a labrar las actas de infracción que correspondan de acuerdo a lo establecido en las Ordenanzas vigentes.-' }],
    ],
  };
}
