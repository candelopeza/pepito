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
   ============================================================================ */

import { faltantesParaCedula, rubroSinInformar } from './reglas.js';

export const FORMATO_OFICIAL = true;

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

  return {
    instancia,
    titulo: instancia === 1 ? 'PRIMERA NOTIFICACION' : 'SEGUNDA NOTIFICACION',
    numero: numeroOficial(cedula?.numeroCedula),
    // La primera lleva los datos en un párrafo; la segunda, en dos renglones.
    datos: instancia === 1 ? [[razonSocial, comercio, cuit, domicilio, rubro]] : [[razonSocial, comercio, cuit], [domicilio, rubro]],
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
