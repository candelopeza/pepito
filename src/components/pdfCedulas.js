/* ============================================================================
   components/pdfCedulas.js  —  LAS CÉDULAS Y LA HOJA DE RUTA EN PDF
   ----------------------------------------------------------------------------
   Sección 6.4 del pliego: "El sistema genera la cédula en PDF a partir de una
   plantilla editable por el área (...). Debe permitir la impresión individual
   y por lote, y generar la hoja de ruta del día para los notificadores."

   POR QUÉ PDF Y NO window.print(): lo que imprime el navegador depende del
   navegador (márgenes, escala, la fecha y la dirección web que agrega arriba y
   abajo). El PDF sale igual en cualquier computadora y se puede guardar,
   mandar o imprimir más tarde.

   QUÉ LLEVA CADA CÉDULA
     - el texto de la plantilla de Configuración, completado con los datos del
       local (el mismo que muestra la vista previa: dominio/textoCedula.js);
     - la CONSTANCIA DE NOTIFICACIÓN, que completa el notificador en el
       domicilio: fecha y hora, resultado, quién recibió, firmas y
       observaciones. Es la prueba de la entrega fehaciente, y sus casillas son
       los mismos resultados que después se cargan en el sistema.

   LA HOJA DE RUTA va POR NOTIFICADOR: cada uno en su hoja, con su recorrido
   ordenado por cercanía (dominio/geo.js), y al final las cédulas que todavía
   no tienen notificador. Una sola lista ordenada mezclaba los recorridos.

   QUIÉN Y CUÁNDO: abajo a la izquierda de cada hoja va "Generado el ... a las
   ... por ...", con el usuario que lo generó (el de la barra de arriba; con
   CiDiTuc, el de su inicio de sesión). Las cédulas NO lo llevan (lo pidió la
   Dirección: PIE_GENERADO_EN_CEDULAS en dominio/cedulaOficial.js).

   Se arma en el navegador con jsPDF y jspdf-autotable. Se cargan recién al
   generar el primer PDF, para no demorar la apertura de la aplicación.
   ============================================================================ */

import { textoDeCedula } from '../dominio/textoCedula.js';
import { RESULTADOS_ENTREGA } from '../dominio/actuaciones.js';
import { fmtFecha, hoyISO } from '../dominio/fechas.js';
import { ordenarPorProximidad } from '../dominio/geo.js';
import { ESTADOS, etiquetaEstado } from '../dominio/estados.js';
import { COPIAS_OFICIALES, FORMATO_OFICIAL, LOGOS, PIE_GENERADO_EN_CEDULAS, contenidoCedulaOficial } from '../dominio/cedulaOficial.js';
import logoMunicipio from '../assets/cedula/logo-municipio.png';
import logoAmbiente from '../assets/cedula/logo-ambiente.png';

/* Cuántas copias de cada cédula. Con 2 sale ORIGINAL (queda en el local) y
   DUPLICADO (vuelve a la oficina con la constancia firmada). */
const COPIAS_POR_CEDULA = 1;
const ROTULO_COPIA = ['ORIGINAL · queda en el local', 'DUPLICADO · vuelve a la oficina'];

const MEMBRETE = 'Municipalidad de San Miguel de Tucumán · Dirección de Ambiente';
const GRIS = 110;

async function jsPdf() {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  return { jsPDF, autoTable };
}

/* Las fuentes estándar del PDF no traen algunos signos tipográficos. Se
   cambian por su equivalente simple para que no salgan como basura. */
function apto(texto) {
  return String(texto ?? '')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .replace(/[Ā-￿]/g, '?');
}

const nombreDeArchivo = (texto) => apto(texto).replace(/[^\w.-]+/g, '-');

/* El nombre que va en "Generado por": el de la barra de arriba. Si se eligió
   un agente en "Firmar como", la barra muestra su legajo. */
export function quienGenera(usuario) {
  if (!usuario?.nombre) return 'usuario sin identificar';
  return usuario.deLaBase ? `legajo ${usuario.nombre}` : usuario.nombre;
}

/* "Generado el 07/10/2026 a las 10:45 por Mariano Agustín". Se calcula una vez
   por PDF: todas sus hojas dicen el mismo momento. */
function leyendaGenerado(generadoPor) {
  const ahora = new Date();
  const fecha = ahora.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  return apto(`Generado el ${fecha} a las ${hora} por ${generadoPor || 'usuario sin identificar'}`);
}

/* ---------------------------------------------------------------------------
   EL PAPEL
   ---------------------------------------------------------------------------
   El PDF sale en tamaño PAPEL ('carta', 'a4' u 'oficio'). Pero el contenido se
   acomoda SIEMPRE dentro de la zona que comparten Carta y A4 (210 x 279 mm):
   así sale completo en las dos, aunque la impresora tenga cargado el otro
   papel. Antes el PDF era A4 y en una impresora con papel Carta se perdían
   casi 2 cm de abajo (el pie con quién lo generó) o del costado derecho.
   --------------------------------------------------------------------------- */
const PAPEL = 'carta';
const PAPELES = {
  carta: { formato: 'letter', ancho: 215.9, alto: 279.4 },
  a4: { formato: 'a4', ancho: 210, alto: 297 },
  oficio: { formato: 'legal', ancho: 215.9, alto: 355.6 },
};
const HOJA = PAPELES[PAPEL] ?? PAPELES.carta;
// La zona que se imprime completa tanto en Carta como en A4.
const ZONA = { ancho: Math.min(HOJA.ancho, 210), alto: Math.min(HOJA.alto, 279.4) };

/* ---------------------------------------------------------------------------
   UNA CÉDULA (una página por copia)
   --------------------------------------------------------------------------- */
const A4 = ZONA; // (se llamaba así cuando el PDF era A4: ahora es la zona imprimible)
const MARGEN = 22;
const ANCHO_UTIL = A4.ancho - MARGEN * 2;
const ALTO_CONSTANCIA = 92;
/* El pie (quién la generó y cuándo) va a esta distancia del borde de abajo,
   en mm. Más cerca del borde, muchas impresoras no lo imprimen. */
const PIE_DESDE_ABAJO = 13;
/* Dónde va la constancia de notificación: a continuación del texto, con este
   espacio en milímetros entre el texto y el recuadro. En true, al pie de la
   hoja (como estaba antes). */
const CONSTANCIA_AL_PIE = false;
const ESPACIO_ANTES_DE_CONSTANCIA = 14;

function dibujarCedula(doc, { cedula, local, notificador, plantilla, copia, generado }) {
  const { texto } = textoDeCedula(plantilla, cedula, local);
  let y = 24;

  // El texto de la plantilla, tal como lo escribió el área. Las líneas en
  // mayúsculas que no son un "dato: valor" (membrete, título, instancia) van
  // en negrita.
  doc.setFontSize(11);
  for (const linea of apto(texto).split('\n')) {
    if (!linea.trim()) {
      y += 3.5;
      continue;
    }
    const titulo = linea === linea.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(linea) && !linea.includes(':');
    doc.setFont('helvetica', titulo ? 'bold' : 'normal');
    for (const parte of doc.splitTextToSize(linea, ANCHO_UTIL)) {
      if (y > A4.alto - MARGEN - 10) {
        doc.addPage();
        y = 24;
      }
      doc.text(parte, MARGEN, y);
      y += 5.6;
    }
  }

  // La constancia va a continuación del texto, separada por ESPACIO_ANTES_DE_CONSTANCIA
  // milímetros. Con CONSTANCIA_AL_PIE va abajo de todo, siempre en el mismo
  // lugar. Si el texto es tan largo que no deja lugar, pasa a la hoja siguiente.
  const alPie = A4.alto - MARGEN - ALTO_CONSTANCIA;
  let yConstancia = CONSTANCIA_AL_PIE ? alPie : Math.min(y + ESPACIO_ANTES_DE_CONSTANCIA, alPie);
  if (y > yConstancia - 6) {
    doc.addPage();
    yConstancia = 30;
  }
  dibujarConstancia(doc, yConstancia, notificador);

  // Pie: solo quién la generó y cuándo (abajo a la izquierda). El número, la
  // instancia y el membrete ya están en el texto de la cédula: no se repiten.
  // Con dos copias, a la derecha va cuál es (ORIGINAL o DUPLICADO).
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(GRIS);
  if (generado) doc.text(generado, MARGEN, A4.alto - PIE_DESDE_ABAJO);
  if (copia) doc.text(apto(copia), A4.ancho - MARGEN, A4.alto - PIE_DESDE_ABAJO, { align: 'right' });
  doc.setTextColor(0);
}

function linea(doc, x1, y, x2) {
  doc.setDrawColor(150);
  doc.setLineWidth(0.2);
  doc.line(x1, y, x2, y);
}

function dibujarConstancia(doc, y0, notificador) {
  const x = MARGEN;
  const fin = A4.ancho - MARGEN;
  doc.setDrawColor(60);
  doc.setLineWidth(0.4);
  doc.rect(x, y0, ANCHO_UTIL, ALTO_CONSTANCIA);

  let y = y0 + 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('CONSTANCIA DE NOTIFICACIÓN', x + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(GRIS);
  doc.text('La completa el notificador en el domicilio', fin - 4, y, { align: 'right' });
  doc.setTextColor(0);
  doc.setFontSize(9.5);

  // Notificador y momento de la entrega
  y += 10;
  doc.text('Notificador:', x + 4, y);
  if (notificador) doc.text(apto(notificador), x + 26, y - 0.8);
  linea(doc, x + 25, y + 0.8, x + 90);
  doc.text('Fecha:', x + 95, y);
  doc.text('___ / ___ / ______', x + 106, y);
  doc.text('Hora:', fin - 26, y);
  doc.text('___ : ___', fin - 16, y);

  // Resultado: las mismas opciones que se cargan después en el sistema
  y += 9;
  doc.text('Resultado:', x + 4, y);
  RESULTADOS_ENTREGA.forEach((r, i) => {
    const cx = x + 26 + (i % 2) * 70;
    const cy = y + Math.floor(i / 2) * 7;
    doc.setDrawColor(60);
    doc.rect(cx, cy - 3.2, 3.6, 3.6);
    doc.text(apto(r.etiqueta), cx + 5.5, cy);
  });

  // Quién recibió
  y += 18;
  doc.text('Recibió (nombre y apellido):', x + 4, y);
  linea(doc, x + 50, y + 0.8, x + 120);
  doc.text('DNI:', x + 123, y);
  linea(doc, x + 131, y + 0.8, fin - 4);
  y += 8;
  doc.text('Relación con el local (titular, encargado, empleado...):', x + 4, y);
  linea(doc, x + 88, y + 0.8, fin - 4);

  // Firmas
  y += 20;
  const mitad = x + ANCHO_UTIL / 2;
  linea(doc, x + 8, y, mitad - 8);
  linea(doc, mitad + 8, y, fin - 8);
  doc.setFontSize(8.5);
  doc.text('Firma de quien recibe', (x + mitad) / 2, y + 4, { align: 'center' });
  doc.text('Firma, aclaración y legajo del notificador', (mitad + fin) / 2, y + 4, { align: 'center' });

  // Observaciones (obligatorias si no se entregó: motivo, y foto en el sistema)
  y += 11;
  doc.setFontSize(9.5);
  doc.text('Observaciones:', x + 4, y);
  linea(doc, x + 30, y + 0.8, fin - 4);
  linea(doc, x + 4, y + 7.8, fin - 4);
}

/* ===========================================================================
   EL FORMATO OFICIAL DE LA DIRECCIÓN DE AMBIENTE (26/10/2026)
   ---------------------------------------------------------------------------
   La Dirección pasó el modelo de las dos notificaciones (PRIMERA y SEGUNDA) y
   se imprime así, fijo: título y número arriba, los dos logos, Fecha / Hora /
   Sr./a para completar a mano, los datos del local, el texto con las
   ordenanzas (los casilleros van vacíos: se tildan a mano según el rubro), las
   firmas y las observaciones. La primera lleva las tres firmas en una fila; la
   segunda, la del Director arriba y las de recepción y notificador abajo.

   TRES COPIAS IGUALES de cada cédula, una por hoja: para el local, para la
   Dirección de Ambiente y para el expediente.

   El texto y los datos salen de dominio/cedulaOficial.js, el mismo que usa la
   pantalla "Ver cédula": lo que se revisa y lo que se imprime no pueden
   diferir. Ahí están FORMATO_OFICIAL (en false vuelve el formato anterior: el
   texto de Configuración → Plantilla de cédula con la constancia de
   notificación, que quedó intacto más arriba) y la cantidad de copias.

   LOS LOGOS: src/assets/cedula/logo-municipio.png y logo-ambiente.png,
   recortados de la imagen del encabezado que pasó la Dirección. Van dentro de
   la app (Vite los incrusta en el index.html), así que salen también sin señal
   o abriendo el archivo con doble clic. Para cambiarlos: reemplazar esos dos
   archivos y compilar de nuevo. Si una imagen no carga, en su lugar va el
   nombre en texto y la cédula se imprime igual.
   =========================================================================== */
/* Prepara un logo para el PDF, con su tamaño en píxeles (para no deformarlo).
   null si no carga. */
async function cargarLogo(url) {
  try {
    const respuesta = await fetch(url);
    if (!respuesta.ok) return null;
    const blob = await respuesta.blob();
    const datos = await new Promise((resolver, rechazar) => {
      const lector = new FileReader();
      lector.onload = () => resolver(lector.result);
      lector.onerror = rechazar;
      lector.readAsDataURL(blob);
    });
    const { ancho, alto } = await new Promise((resolver, rechazar) => {
      const img = new Image();
      img.onload = () => resolver({ ancho: img.naturalWidth, alto: img.naturalHeight });
      img.onerror = rechazar;
      img.src = datos;
    });
    return { datos, ancho, alto, tipo: 'PNG' };
  } catch {
    return null;
  }
}

/* El logo dentro de su caja, sin deformarlo. Sin archivo, el nombre en texto. */
function dibujarLogo(doc, logo, caja, textoSinLogo, alinear) {
  if (logo) {
    const escala = Math.min(caja.ancho / logo.ancho, caja.alto / logo.alto);
    const ancho = logo.ancho * escala;
    const alto = logo.alto * escala;
    const x = alinear === 'derecha' ? caja.x + caja.ancho - ancho : caja.x;
    // 'FAST': comprimida sin perder calidad (sin esto, cada logo pesa ~200 KB en el PDF).
    doc.addImage(logo.datos, logo.tipo, x, caja.y + (caja.alto - alto) / 2, ancho, alto, undefined, 'FAST');
    return;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  const lineas = textoSinLogo.map(apto);
  const x = alinear === 'derecha' ? caja.x + caja.ancho : caja.x;
  lineas.forEach((t, i) => doc.text(t, x, caja.y + 6 + i * 4.2, { align: alinear === 'derecha' ? 'right' : 'left' }));
}

/* Un párrafo con partes en negrita, justificado como en el modelo. `partes`:
   [{ t: 'texto', e: 'normal' | 'bold' | 'italic' | 'bolditalic' }]. Las
   palabras pegadas entre partes (una negrita seguida de ":") quedan juntas.
   Con dibujar = false solo mide: devuelve dónde termina. */
function parrafo(doc, partes, { x, y, ancho, tam, justificar = true, dibujar = true, sangria = 0 }) {
  const interlinea = tam * 0.3528 * 1.22;
  // Unidades: palabras (con su estilo) que van juntas, separadas por espacios.
  const unidades = [];
  let actual = [];
  for (const p of partes) {
    for (const trozo of String(p.t).split(/(\s+)/)) {
      if (!trozo) continue;
      if (/^\s+$/.test(trozo)) {
        if (actual.length) unidades.push(actual);
        actual = [];
      } else {
        actual.push({ t: apto(trozo), e: p.e ?? 'normal' });
      }
    }
  }
  if (actual.length) unidades.push(actual);

  doc.setFontSize(tam);
  const medir = (u) =>
    u.reduce((suma, pieza) => {
      doc.setFont('times', pieza.e);
      return suma + doc.getTextWidth(pieza.t);
    }, 0);
  doc.setFont('times', 'normal');
  const espacio = doc.getTextWidth(' ');

  const lineas = [];
  let linea = [];
  let largo = 0;
  for (const u of unidades) {
    const w = medir(u);
    const disponible = ancho - (lineas.length === 0 ? sangria : 0);
    if (linea.length && largo + espacio + w > disponible) {
      lineas.push({ unidades: linea, largo });
      linea = [];
      largo = 0;
    }
    largo += (linea.length ? espacio : 0) + w;
    linea.push({ u, w });
  }
  if (linea.length) lineas.push({ unidades: linea, largo, ultima: true });

  let yy = y;
  lineas.forEach((l, i) => {
    if (dibujar) {
      const inicio = x + (i === 0 ? sangria : 0);
      const disponible = ancho - (i === 0 ? sangria : 0);
      const huecos = l.unidades.length - 1;
      const extra = justificar && !l.ultima && huecos > 0 ? (disponible - l.largo) / huecos : 0;
      let xx = inicio;
      for (const { u, w } of l.unidades) {
        let xp = xx;
        for (const pieza of u) {
          doc.setFont('times', pieza.e);
          doc.text(pieza.t, xp, yy);
          xp += doc.getTextWidth(pieza.t);
        }
        xx += w + espacio + extra;
      }
    }
    yy += interlinea;
  });
  return yy;
}

/* Línea de puntos para completar a mano (como los "………" del modelo). */
function puntos(doc, x1, y, x2) {
  doc.setDrawColor(0);
  doc.setLineWidth(0.25);
  doc.setLineDashPattern([0.35, 0.9], 0);
  doc.line(x1, y, x2, y);
  doc.setLineDashPattern([], 0);
}

/* El cuerpo de la cédula oficial, desde los datos del local hasta el último
   párrafo. Devuelve dónde termina. Con dibujar = false solo mide (para elegir
   el tamaño de letra que entra en una hoja). */
function cuerpoOficial(doc, contenido, { x, y, ancho, tam, dibujar }) {
  const opciones = { x, ancho, tam, dibujar };
  const salto = tam * 0.3528 * 0.55;

  // Los datos del local: la primera en un párrafo, la segunda en dos renglones.
  contenido.datos.forEach((renglon, i) => {
    const partes = renglon.flatMap((d) => [{ t: d.etiqueta + ': ', e: 'bold' }, { t: d.valor + '  ' }]);
    y = parrafo(doc, partes, { ...opciones, y: y + (i ? salto : 0), justificar: false });
  });
  y += salto * 2;
  for (const p of contenido.parrafos) y = parrafo(doc, p, { ...opciones, y });

  // Las ordenanzas, cada una con su casillero vacío para tildar a mano.
  const lado = tam * 0.3528 * 0.78;
  for (const { titulo, texto } of contenido.ordenanzas) {
    y += salto;
    if (dibujar) {
      doc.setDrawColor(0);
      doc.setLineWidth(0.25);
      doc.rect(x, y - lado * 0.95, lado, lado);
    }
    y = parrafo(doc, [{ t: titulo, e: 'bold' }, { t: texto }], { ...opciones, y, sangria: lado + 1.6 });
  }
  for (const p of contenido.cierre) y = parrafo(doc, p, { ...opciones, y });
  return y;
}

/* Una copia de la cédula oficial: una hoja. */
function dibujarCedulaOficial(doc, { cedula, local }, { logos, generado }) {
  const x = 18;
  const fin = ZONA.ancho - 18;
  const ancho = fin - x;
  const contenido = contenidoCedulaOficial(cedula, local);
  const { instancia } = contenido;

  // Título y número
  doc.setFont('times', 'bold');
  doc.setFontSize(12.5);
  doc.text(contenido.titulo, x + ancho * 0.38, 17, { align: 'center' });
  doc.setFontSize(11);
  doc.text(apto(`N°: ${contenido.numero}`), fin, 17, { align: 'right' });

  // Los logos, a la misma altura. El de Ambiente, como en el modelo, un poco
  // más de la mitad de alto que el del Municipio.
  dibujarLogo(doc, logos.municipio, { x: x + 4, y: 21, ancho: 58, alto: 22 }, LOGOS.municipio.texto, 'izquierda');
  dibujarLogo(doc, logos.ambiente, { x: fin - 62, y: 25.5, ancho: 58, alto: 13 }, LOGOS.ambiente.texto, 'derecha');

  // Fecha y hora (a mano)
  let y = 50;
  doc.setFont('times', 'bold');
  doc.setFontSize(10.5);
  doc.text('Fecha:', fin - 92, y);
  doc.setFont('times', 'normal');
  doc.text('........./........./.........', fin - 79, y);
  doc.setFont('times', 'bold');
  doc.text('Hora:', fin - 36, y);
  puntos(doc, fin - 25, y + 0.6, fin);

  // Sr./a (a mano)
  y += 9;
  doc.text('Sr./a:', x, y);
  puntos(doc, x + 11, y + 0.6, fin);

  // El cuerpo: se elige el tamaño de letra más grande que deja entrar las
  // firmas y las observaciones en la misma hoja.
  const inicioCuerpo = y + 7;
  const firmasYObservaciones = instancia === 1 ? 34 : 52;
  const limite = ZONA.alto - 16 - firmasYObservaciones;
  const tam = [10.5, 10, 9.5, 9, 8.5].find((t) => cuerpoOficial(doc, contenido, { x, y: inicioCuerpo, ancho, tam: t, dibujar: false }) <= limite) ?? 8.5;
  y = cuerpoOficial(doc, contenido, { x, y: inicioCuerpo, ancho, tam, dibujar: true });

  // Firmas
  doc.setFont('times', 'bold');
  doc.setFontSize(10.5);
  if (instancia === 1) {
    y += 20;
    doc.text('Firma Recepción', x + ancho / 6, y, { align: 'center' });
    doc.text('Firma Notificador', x + ancho / 2, y, { align: 'center' });
    doc.text('Firma Director/ Sub director', x + (ancho * 5) / 6, y, { align: 'center' });
  } else {
    y += 16;
    puntos(doc, x, y, x + 60);
    y += 6;
    doc.text('Firma Director/ Sub director', fin, y, { align: 'right' });
    y += 14;
    puntos(doc, x, y, x + 55);
    puntos(doc, x + 80, y, x + 135);
    y += 5;
    doc.text('Firma Recepción', x + 27.5, y, { align: 'center' });
    doc.text('Firma Notificador', x + 107.5, y, { align: 'center' });
  }

  // Observaciones
  y += 11;
  doc.text('OBSERVACIONES:', x, y);
  puntos(doc, x + 33, y + 0.6, fin);
  puntos(doc, x, y + 7, fin);

  // Pie: quién la generó y cuándo (sección 6.4), chico y en gris. Hoy apagado
  // en las cédulas (PIE_GENERADO_EN_CEDULAS): `generado` llega vacío.
  if (generado) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(GRIS);
    doc.text(generado, x, ZONA.alto - 8);
    doc.setTextColor(0);
  }
}

/* Las cédulas. Formato oficial: tres copias iguales de cada una, una por hoja.
   Formato anterior: una por hoja (o dos con COPIAS_POR_CEDULA = 2).
   `items`: [{ cedula, local, notificador }]. */
export async function pdfCedulas(items, plantilla, { generadoPor = '' } = {}) {
  const { jsPDF } = await jsPdf();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: HOJA.formato });
  doc.setProperties({ title: 'Cédulas de notificación', author: 'Dirección de Ambiente' });
  const generado = PIE_GENERADO_EN_CEDULAS ? leyendaGenerado(generadoPor) : '';
  const logos = FORMATO_OFICIAL
    ? { municipio: await cargarLogo(logoMunicipio), ambiente: await cargarLogo(logoAmbiente) }
    : null;
  const copias = FORMATO_OFICIAL ? COPIAS_OFICIALES : COPIAS_POR_CEDULA;
  let primera = true;
  for (const item of items) {
    for (let n = 0; n < copias; n += 1) {
      if (!primera) doc.addPage();
      primera = false;
      if (FORMATO_OFICIAL) dibujarCedulaOficial(doc, item, { logos, generado });
      else dibujarCedula(doc, { ...item, plantilla, generado, copia: copias > 1 ? ROTULO_COPIA[n] : null });
    }
  }
  return doc;
}

/* ---------------------------------------------------------------------------
   LA HOJA DE RUTA (vertical, con lugar para escribir)
   `filas`: las cédulas de la hoja de ruta (con .local, .notificador, .latitud
   y .longitud). Se agrupan por notificador y cada grupo se ordena por
   cercanía: es el recorrido de esa persona.
   --------------------------------------------------------------------------- */
const SIN_NOTIFICADOR = 'Sin notificador asignado';

/* Vertical: es como imprime cualquier impresora por defecto. Apaisada, si la
   impresora no la gira, se corta del lado derecho. Los anchos de columna (mm)
   suman el ancho útil de cada orientación: 210 - 2 x 8 = 194 y 297 - 2 x 8 = 281. */
const HOJA_DE_RUTA_APAISADA = false;
const MARGEN_HOJA = 8;
const COLUMNAS_HOJA = HOJA_DE_RUTA_APAISADA ? [9, 24, 11, 58, 70, 38, 53] : [7, 20, 10, 44, 49, 26, 38];

function recorridosPorNotificador(filas) {
  const grupos = new Map();
  for (const c of filas) {
    const quien = c.notificador?.nombre || SIN_NOTIFICADOR;
    if (!grupos.has(quien)) grupos.set(quien, []);
    grupos.get(quien).push(c);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => (a === SIN_NOTIFICADOR) - (b === SIN_NOTIFICADOR) || a.localeCompare(b, 'es'))
    .map(([quien, cedulas]) => ({ quien, cedulas: ordenarPorProximidad(cedulas) }));
}

export async function pdfHojaDeRuta(filas, { fecha = hoyISO(), generadoPor = '' } = {}) {
  const { jsPDF, autoTable } = await jsPdf();
  const doc = new jsPDF({
    orientation: HOJA_DE_RUTA_APAISADA ? 'landscape' : 'portrait',
    unit: 'mm',
    format: HOJA.formato,
  });
  doc.setProperties({ title: `Hoja de ruta ${fmtFecha(fecha)}`, author: 'Dirección de Ambiente' });
  // Todo dentro de la zona que sale completa en Carta y en A4 (ver EL PAPEL).
  const altoPagina = doc.internal.pageSize.getHeight();
  const alto = HOJA_DE_RUTA_APAISADA ? Math.min(HOJA.ancho, 210) : ZONA.alto;
  const izq = MARGEN_HOJA;
  // El borde derecho es el de la tabla: la fecha y el número de página quedan alineados con ella.
  const der = izq + COLUMNAS_HOJA.reduce((t, c) => t + c, 0);
  const yPie = alto - PIE_DESDE_ABAJO;
  const generado = leyendaGenerado(generadoPor);
  const recorridos = recorridosPorNotificador(filas);

  recorridos.forEach(({ quien, cedulas }, n) => {
    if (n > 0) doc.addPage();
    const sinAsignar = quien === SIN_NOTIFICADOR;
    autoTable(doc, {
      head: [['#', 'Cédula', 'Inst', 'Local', 'Dirección', 'Resultado', 'Firma de quien recibe']],
      body: cedulas.map((c, i) => [
        i + 1,
        apto(c.numeroCedula),
        c.instancia === 1 ? '1°' : '2°',
        apto(c.local?.nombreLocal ?? ''),
        apto(c.local?.direccion ?? '') + (typeof c.latitud !== 'number' ? '\n(sin ubicación: ubicar a mano)' : ''),
        '',
        '',
      ]),
      // Abajo, la tabla corta a tiempo para no pisar el pie (y pasa a la hoja siguiente).
      margin: { top: 30, left: MARGEN_HOJA, right: MARGEN_HOJA, bottom: altoPagina - yPie + 6 },
      styles: {
        font: 'helvetica',
        fontSize: HOJA_DE_RUTA_APAISADA ? 9 : 8.5,
        cellPadding: 2,
        valign: 'middle',
        lineColor: 150,
        lineWidth: 0.2,
        textColor: 20,
      },
      headStyles: { fillColor: [232, 236, 241], textColor: 20, fontStyle: 'bold' },
      bodyStyles: { minCellHeight: 13 },
      columnStyles: {
        0: { cellWidth: COLUMNAS_HOJA[0], halign: 'center' },
        1: { cellWidth: COLUMNAS_HOJA[1], overflow: 'visible' },
        2: { cellWidth: COLUMNAS_HOJA[2], halign: 'center' },
        3: { cellWidth: COLUMNAS_HOJA[3] },
        4: { cellWidth: COLUMNAS_HOJA[4] },
        5: { cellWidth: COLUMNAS_HOJA[5] },
        6: { cellWidth: COLUMNAS_HOJA[6] },
      },
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      didDrawPage: () => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text('Hoja de ruta · Grandes Generadores', izq, 13);
        doc.setFontSize(11);
        doc.text(apto(sinAsignar ? 'Notificador: ______________________________' : `Notificador: ${quien}`), izq, 20);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(GRIS);
        doc.text(apto(`${MEMBRETE} `), izq, 25.5);
        doc.setTextColor(0);
        doc.setFontSize(10);
        doc.text(apto(`Fecha: ${fmtFecha(fecha)}`), der, 13, { align: 'right' });
        doc.setFontSize(8);
        doc.setTextColor(GRIS);
        doc.text(generado, izq, yPie);
        doc.setTextColor(0);
      },
    });
  });
  // "Página x de y" se escribe al final, cuando ya se sabe cuántas hojas son.
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(GRIS);
    doc.text(`Página ${i} de ${total}`, der, yPie, { align: 'right' });
  }
  doc.setTextColor(0);
  return doc;
}

/* ---------------------------------------------------------------------------
   UNA TABLA CUALQUIERA (el botón verde "Imprimir" de cada grilla)
   ---------------------------------------------------------------------------
   Antes ese botón mandaba la grilla al navegador tal como se veía: con la
   barra de herramientas, las columnas de la derecha cortadas y la dirección
   web arriba y abajo. Ahora arma un PDF con las filas que quedaron después de
   buscar y filtrar, en el orden en que se ven, y con todas las columnas
   visibles en el ancho de la hoja. Mismo encabezado y pie que la hoja de ruta.
   --------------------------------------------------------------------------- */
const RESULTADO_POR_CODIGO = Object.fromEntries(RESULTADOS_ENTREGA.map((r) => [r.id, r.etiqueta]));

/* El texto de una celda para el papel: fechas en formato argentino, sí/no, y
   los códigos internos (estados, resultados de entrega) con su nombre. */
export function textoParaPdf(valor) {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (valor instanceof Date) return valor.toLocaleDateString('es-AR');
  if (typeof valor === 'object') return '';
  const texto = String(valor);
  if (ESTADOS[texto]) return etiquetaEstado(texto);
  if (RESULTADO_POR_CODIGO[texto]) return RESULTADO_POR_CODIGO[texto];
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return fmtFecha(texto);
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(texto)) {
    const f = new Date(texto.replace(' ', 'T'));
    if (!Number.isNaN(f.getTime())) {
      return f.toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  }
  return texto;
}

/* `encabezados`: los títulos de las columnas. `filas`: matriz de textos.
   `detalle`: una línea gris debajo del título (cuántos registros, filtros). */
export async function pdfDeTabla({ titulo, detalle = '', encabezados, filas, generadoPor = '' }) {
  const { jsPDF, autoTable } = await jsPdf();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: HOJA.formato });
  doc.setProperties({ title: apto(titulo), author: 'Dirección de Ambiente' });
  const altoPagina = doc.internal.pageSize.getHeight();
  const izq = MARGEN_HOJA;
  const der = ZONA.ancho - MARGEN_HOJA;
  const yPie = ZONA.alto - PIE_DESDE_ABAJO;
  const generado = leyendaGenerado(generadoPor);
  // Con muchas columnas, letra más chica para que entren todas en el ancho.
  const tamano = encabezados.length > 9 ? 7 : encabezados.length > 6 ? 7.5 : 8.5;

  autoTable(doc, {
    head: [encabezados.map(apto)],
    body: filas.map((fila) => fila.map(apto)),
    margin: { top: 26, left: izq, right: doc.internal.pageSize.getWidth() - der, bottom: altoPagina - yPie + 6 },
    tableWidth: der - izq,
    styles: {
      font: 'helvetica',
      fontSize: tamano,
      cellPadding: 1.6,
      valign: 'middle',
      lineColor: 170,
      lineWidth: 0.2,
      textColor: 20,
      overflow: 'linebreak',
    },
    headStyles: { fillColor: [232, 236, 241], textColor: 20, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 249, 251] },
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    didDrawPage: () => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text(apto(titulo), izq, 13);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(GRIS);
      doc.text(apto(detalle ? `${MEMBRETE} · ${detalle}` : MEMBRETE), izq, 19.5);
      doc.setTextColor(0);
      doc.setFontSize(10);
      doc.text(apto(`Fecha: ${fmtFecha(hoyISO())}`), der, 13, { align: 'right' });
      doc.setFontSize(8);
      doc.setTextColor(GRIS);
      doc.text(generado, izq, yPie);
      doc.setTextColor(0);
    },
  });
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(GRIS);
    doc.text(`Página ${i} de ${total}`, der, yPie, { align: 'right' });
  }
  doc.setTextColor(0);
  return doc;
}

/* ---------------------------------------------------------------------------
   DESCARGAR O IMPRIMIR
   --------------------------------------------------------------------------- */
export function descargarPdf(doc, nombre) {
  doc.save(`${nombreDeArchivo(nombre)}.pdf`);
}

/* Abre el PDF en una pestaña nueva con el diálogo de impresión ya abierto.
   La pestaña se abre ANTES de armar el PDF (todavía dentro del clic): si se
   abriera después, el navegador la tomaría como ventana emergente y la
   bloquearía. Si igual la bloquea, el PDF se descarga. */
export async function imprimirPdf(armar, nombre) {
  const ventana = window.open('', '_blank');
  const doc = await armar();
  doc.autoPrint();
  const url = doc.output('bloburl');
  if (ventana) ventana.location.href = url;
  else descargarPdf(doc, nombre);
}

export const nombreCedula = (cedula) => `cedula-${cedula.numeroCedula}`;
export const nombreLote = (fecha = hoyISO()) => `cedulas-${fecha}`;
export const nombreHojaDeRuta = (fecha = hoyISO()) => `hoja-de-ruta-${fecha}`;
