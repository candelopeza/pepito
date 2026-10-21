/* ============================================================================
   pruebas/informe-9dj.mjs  —  LOS CRITERIOS DE ACEPTACIÓN DEL MÓDULO 9DJ
   ----------------------------------------------------------------------------
   Se ejecuta con:  npm run informe   (con el backend corriendo en :3000)

   Una prueba por cada criterio de la sección 8 de la especificación del módulo
   Informe 9 de Julio, numeradas como ella los numera. Corre contra la API y la
   base REALES, así que está armada para no dejar marca en el padrón:

     - los CUIT inventados usan dígito verificador válido pero no existen
     - no se confirma NINGUNA baja de locales reales
     - todo lo que la prueba aplica, la prueba lo ANULA al final — que además
       es la mejor prueba de la anulación (criterio 12)
     - lo único que queda es el historial de cargas de prueba, en estado
       DESCARTADO o ANULADO, firmado por "Prueba automática 9DJ": es la
       constancia que el propio módulo exige (criterio 16), no basura.

   Si las tablas del módulo no están creadas, el backend responde 503 y la
   suite lo dice: correr backend/sql/09-tablas-informe-9dj.sql.
   ============================================================================ */

import { validarCuit } from '../backend/lector-informe-9dj.js';
import { estadoDeLocal, ID_ESTADO } from '../backend/mapeo.js';

const BASE = process.env.VITE_API_URL ?? 'http://localhost:3000';
const USUARIO = 'Prueba automática 9DJ';

let ok = 0;
let fallas = 0;

function verificar(criterio, condicion, detalle = '') {
  if (condicion) {
    ok += 1;
    console.log(`OK   ${criterio}`);
  } else {
    fallas += 1;
    console.log(`FALLA ${criterio}`);
    if (detalle) console.log(`      ${detalle}`);
  }
}

function seccion(titulo) {
  console.log(`\n=== ${titulo} ===`);
}

/* El fetch de Node reutiliza conexiones y el servidor corta las ociosas a los
   5 segundos: un pedido sobre un socket ya muerto da ECONNRESET. Se reintenta
   UNA vez con conexión nueva (en estas pruebas ningún pedido llega al servidor
   cuando el socket muere al escribir). */
async function conReintento(hacerPedido) {
  try {
    return await hacerPedido();
  } catch (e) {
    if (String(e?.cause?.code ?? '') !== 'ECONNRESET') throw e;
    await new Promise((r) => setTimeout(r, 300));
    return hacerPedido();
  }
}

async function pedir(ruta, opciones = {}) {
  const respuesta = await conReintento(() => fetch(`${BASE}${ruta}`, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      'x-usuario-nombre': encodeURIComponent(USUARIO),
      'x-usuario-rol': 'coordinacion',
    },
  }));
  const texto = await respuesta.text();
  let cuerpo = null;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    cuerpo = null;
  }
  return { estado: respuesta.status, cuerpo };
}

const get = (r) => pedir(r);
const post = (r, b) => pedir(r, { method: 'POST', body: JSON.stringify(b ?? {}) });
const put = (r, b) => pedir(r, { method: 'PUT', body: JSON.stringify(b ?? {}) });

/* Subir un archivo como lo hace la pantalla: en base64. */
const cargar = (nombre, buffer, periodo) =>
  post('/informe-9dj/cargas', { nombreArchivo: nombre, contenidoBase64: buffer.toString('base64'), periodo });

/* Un PDF mínimo pero VÁLIDO, armado a mano con su tabla xref correcta. Las
   líneas van como texto plano de la página (solo ASCII, sin paréntesis). */
function pdfMinimo(lineas) {
  const contenido = `BT /F1 12 Tf 50 740 Td 14 TL ${lineas.map((l) => `(${l}) Tj T*`).join(' ')} ET`;
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const posiciones = [];
  objetos.forEach((o, i) => {
    posiciones.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const p of posiciones) pdf += `${String(p).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

/* ===========================================================================
   PREPARACIÓN: el backend, las tablas y los datos reales que la prueba usa
   =========================================================================== */
const salud = await get('/salud').catch(() => null);
if (!salud || salud.estado !== 200) {
  console.log(`No se pudo contactar al backend en ${BASE}. Arrancarlo con: cd backend && npm run dev`);
  process.exit(1);
}

{
  const { estado, cuerpo } = await get('/informe-9dj/cargas');
  if (estado === 503) {
    console.log(cuerpo?.error ?? 'Faltan las tablas del módulo.');
    process.exit(1);
  }
  // Una corrida anterior interrumpida puede haber dejado una revisión abierta
  // DE ESTA PRUEBA: se descarta. Una revisión abierta de una persona no se toca.
  for (const c of cuerpo ?? []) {
    if (c.estado === 'EN_REVISION' && c.usuarioCarga === USUARIO) {
      await post(`/informe-9dj/cargas/${c.id}/descartar`);
    } else if (c.estado === 'EN_REVISION') {
      console.log(`Hay un informe en revisión de ${c.usuarioCarga} (carga N° ${c.id}): la prueba no lo toca. Aplicalo o descartalo y volvé a correr.`);
      process.exit(1);
    }
  }
}

/* Los protagonistas, elegidos del padrón real:
     A  un local con CUIT válido y único, SIN contrato 9DJ: recibirá el
        contrato del informe y después la anulación se lo sacará
     D  un CUIT válido con varias sucursales: nunca se resuelve solo */
const { cuerpo: padron } = await get('/locales');
const porCuit = new Map();
for (const l of padron) {
  const digitos = String(l.cuit ?? '').replace(/\D/g, '');
  if (!validarCuit(digitos).valido) continue;
  if (!porCuit.has(digitos)) porCuit.set(digitos, []);
  porCuit.get(digitos).push(l);
}

const unicos = [...porCuit.values()].filter((ls) => ls.length === 1).map(([l]) => l);
const localA =
  unicos.find((l) => ['GENERAR_EXPEDIENTE', 'NOTIF2_PENDIENTE', 'NOTIF1_PENDIENTE'].includes(l.estado)) ??
  unicos.find((l) => l.estado !== 'CONTRATO_9DJ' && !l.bloqueado);
const sucursales = [...porCuit.values()].find((ls) => ls.length > 1);

if (!localA) {
  console.log('No se encontró en el padrón un local con CUIT válido y único para la prueba.');
  process.exit(1);
}
const cuitA = String(localA.cuit).replace(/\D/g, '');
console.log(`Local de prueba A: ${localA.nombreLocal} (N° ${localA.id}, estado ${localA.estado})`);
console.log(`CUIT con sucursales: ${sucursales ? `${sucursales[0].cuit} (${sucursales.length} locales)` : 'no hay, se salta el criterio 10'}`);

/* CUIT inventados con verificador correcto, que no existen en el padrón. */
const CUIT_NUEVO = '20123456786';
const CUIT_ROTO = '20123456785';
/* 27-12345678-0 también cierra: suma 176, 176 % 11 = 0, verificador 0. */
const CUIT_VENCIDO = '27123456780';
/* 23-12345678-5 también: suma 160, 160 % 11 = 6, verificador 5. */
const CUIT_DISTINTO = '23123456785';

const csvPrincipal = Buffer.from(
  'CUIT;Razón Social;Domicilio;N° de Contrato;Vencimiento\n' +
    `${cuitA};${localA.razonSocial || localA.nombreLocal};${localA.direccion};CON-PRUEBA-A;31/12/2027\n` +
    `${CUIT_NUEVO};COMERCIO DE PRUEBA AUTOMATICA;CALLE DE PRUEBA 123;CON-PRUEBA-B;\n` +
    `${CUIT_ROTO};FILA CON CUIT QUE NO CIERRA;OTRA CALLE 45;;\n` +
    `${CUIT_VENCIDO};CONTRATO QUE YA VINO VENCIDO;CALLE VIEJA 1;CON-VENCIDO;01/01/2020\n` +
    // El caso clave del cruce: el MISMO local real (nombre y dirección) pero
    // con otro CUIT. Tiene que salir como coincidencia parecida, nunca sola.
    `${CUIT_DISTINTO};"${(localA.razonSocial || localA.nombreLocal).replace(/"/g, '')}";"${(localA.direccion ?? '').replace(/"/g, '')}";CON-PARECIDO;\n` +
    (sucursales ? `${sucursales[0].cuit};${sucursales[0].razonSocial || 'SUCURSALES'};DIRECCION QUE NO COINCIDE 99999;;\n` : ''),
);

/* ===========================================================================
   CRITERIO 2 — un PDF con capa de texto se lee sin OCR; un escaneo deriva a
   la contingencia OCR (prevista, no implementada: TODO-DEFINICION)
   =========================================================================== */
seccion('2. PDF: con capa de texto se lee; el escaneo deriva a la contingencia');

{
  const conTexto = await cargar('informe.pdf', pdfMinimo(['ALMACEN PDF 20-12345678-6 SAN MARTIN 450 31/12/2026']));
  verificar(
    'un PDF con capa de texto se lee sin OCR',
    conTexto.estado === 201 && conTexto.cuerpo.filas.length === 1 && conTexto.cuerpo.filas[0].cuit === CUIT_NUEVO,
    JSON.stringify(conTexto.cuerpo).slice(0, 200),
  );
  verificar('y la carga avisa que vino en PDF, para cotejar contra el crudo', Boolean(conTexto.cuerpo?.advertencia));
  // Era solo para probar la lectura: se descarta sin efectos.
  if (conTexto.estado === 201) await post(`/informe-9dj/cargas/${conTexto.cuerpo.id}/descartar`);

  const escaneo = await cargar('escaneo.pdf', pdfMinimo([]));
  verificar(
    'un escaneo (PDF sin texto) se rechaza derivando a la contingencia OCR',
    escaneo.estado === 400 && /OCR/.test(escaneo.cuerpo?.error ?? ''),
    JSON.stringify(escaneo.cuerpo),
  );
}

/* ===========================================================================
   LA CARGA PRINCIPAL — criterios 1, 3, 10 y 15
   =========================================================================== */
seccion('1. Cargar no escribe nada en el padrón hasta que el agente confirma');

const localesAntes = padron.length;
const { estado: estadoCarga, cuerpo: carga } = await cargar('informe-prueba.csv', csvPrincipal, 'prueba automática');
if (estadoCarga !== 201) {
  console.log(`No se pudo cargar el informe de prueba: ${JSON.stringify(carga)}`);
  process.exit(1);
}

{
  const { cuerpo: despues } = await get('/locales');
  verificar('cargar el informe no creó ni tocó ningún local', despues.length === localesAntes);
  verificar('la carga quedó EN_REVISION, esperando a la persona', carga.estado === 'EN_REVISION');
}

seccion('3. El CUIT cuyo dígito no cierra queda marcado como lectura dudosa');
{
  const filaRota = carga.filas.find((f) => f.cuit === CUIT_ROTO);
  verificar('la fila se conserva, no se descarta', Boolean(filaRota));
  verificar('viene marcada como CUIT inválido', filaRota?.cuitValido === false);
  verificar('con el motivo a la vista del agente', /verificador/.test(filaRota?.motivoCuit ?? ''));
  verificar('y nunca atada sola a un local: nadie aplica una lectura dudosa', filaRota?.cruce !== 'ENCONTRADO' && filaRota?.idLocal === null);
}

seccion('10. Un CUIT con varias sucursales nunca se resuelve solo');
if (sucursales) {
  const filaSucursal = carga.filas.find((f) => f.cuit === String(sucursales[0].cuit).replace(/\D/g, ''));
  verificar('la fila no quedó atada a ningún local', filaSucursal?.idLocal === null);
  verificar(
    'se presentan TODOS los candidatos para que la persona elija',
    filaSucursal?.candidatos?.length === sucursales.length,
    `candidatos: ${JSON.stringify(filaSucursal?.candidatos)}`,
  );
} else {
  console.log('(sin CUIT con sucursales en el padrón: criterio no verificable acá)');
}

seccion('15. La carga queda registrada con archivo, usuario y momento');
verificar('el archivo', carga.nombreArchivo === 'informe-prueba.csv');
verificar('el usuario que cargó', carga.usuarioCarga === USUARIO);
verificar('el momento', Boolean(carga.fechaCarga));

/* ===========================================================================
   CRITERIOS 4 y 7 — decidir fila por fila, sin perder el avance
   =========================================================================== */
seccion('4. Una fila sin revisar no se confirma junto con el resto');
{
  const { estado, cuerpo } = await post(`/informe-9dj/cargas/${carga.id}/aplicar`, { bajas: [] });
  verificar('aplicar con filas sin revisar se rechaza', estado === 400 && /sin revisar/.test(cuerpo?.error ?? ''), JSON.stringify(cuerpo));
}

seccion('7. Cerrar y volver a abrir conserva lo decidido');
{
  const filaA = carga.filas.find((f) => f.cuit === cuitA);
  const filaB = carga.filas.find((f) => f.cuit === CUIT_NUEVO);
  const filaRota = carga.filas.find((f) => f.cuit === CUIT_ROTO);
  const filaSucursal = sucursales ? carga.filas.find((f) => f.cuit === String(sucursales[0].cuit).replace(/\D/g, '')) : null;

  verificar('la fila del local real cruzó sola (CUIT único)', filaA?.cruce === 'ENCONTRADO' && filaA?.idLocal === localA.id);

  seccion('Corrección: un contrato que ya viene vencido no se puede cargar');
  {
    const filaVencida = carga.filas.find((f) => f.cuit === CUIT_VENCIDO);
    const alta = await put(`/informe-9dj/cargas/${carga.id}/filas/${filaVencida.id}`, { decision: 'ALTA' });
    verificar('darlo de alta se rechaza nombrando el vencimiento', alta.estado === 409 && /vencido/.test(alta.cuerpo?.error ?? ''), JSON.stringify(alta.cuerpo));
    const vinculo = await put(`/informe-9dj/cargas/${carga.id}/filas/${filaVencida.id}`, { decision: 'VINCULADA', idLocal: localA.id });
    verificar('vincularlo también', vinculo.estado === 409);
    const rechazo = await put(`/informe-9dj/cargas/${carga.id}/filas/${filaVencida.id}`, { decision: 'RECHAZADA' });
    verificar('rechazarlo sí se puede: es justamente lo que corresponde', rechazo.estado === 200);
  }

  seccion('Corrección: las coincidencias parecidas se detectan y se proponen');
  {
    const filaParecida = carga.filas.find((f) => f.cuit === CUIT_DISTINTO);
    verificar(
      'la misma razón social en la misma dirección con OTRO CUIT sale como PARECIDO',
      filaParecida?.cruce === 'PARECIDO',
      `cruce: ${filaParecida?.cruce}`,
    );
    verificar('sin atarse sola a ningún local (propone, no decide)', filaParecida?.idLocal === null);
    verificar(
      'y el local verdadero está entre los candidatos',
      filaParecida?.candidatos?.includes(localA.id),
      `candidatos: ${JSON.stringify(filaParecida?.candidatos)} · esperaba incluir ${localA.id}`,
    );
    const vinculo = await put(`/informe-9dj/cargas/${carga.id}/filas/${filaParecida.id}`, { decision: 'VINCULADA', idLocal: localA.id });
    verificar('vincularla al candidato entra sin forzar (los datos sí se parecen)', vinculo.estado === 200, JSON.stringify(vinculo.cuerpo));
    // Se rechaza para no interferir con la aritmética del aplicar de más abajo.
    await put(`/informe-9dj/cargas/${carga.id}/filas/${filaParecida.id}`, { decision: 'RECHAZADA' });
  }

  seccion('Corrección: el vínculo manual se corrobora, no se cree');
  {
    // La fila B no se parece en nada al local A: ni CUIT, ni dirección, ni nombre.
    const dudoso = await put(`/informe-9dj/cargas/${carga.id}/filas/${filaB.id}`, { decision: 'VINCULADA', idLocal: localA.id });
    verificar('el vínculo sin ningún parecido se frena', dudoso.estado === 409, JSON.stringify(dudoso.cuerpo).slice(0, 200));
    verificar('y la respuesta trae los dos lados para comparar', Boolean(dudoso.cuerpo?.comparacion?.fila && dudoso.cuerpo?.comparacion?.local));
    const forzado = await put(`/informe-9dj/cargas/${carga.id}/filas/${filaB.id}`, { decision: 'VINCULADA', idLocal: localA.id, forzar: true });
    verificar('confirmado a propósito (forzar), el vínculo entra', forzado.estado === 200 && forzado.cuerpo?.idLocal === localA.id);
  }

  seccion('Corrección: una fila vinculada a mano se puede confirmar o rechazar');
  {
    const confirmada = await put(`/informe-9dj/cargas/${carga.id}/filas/${filaB.id}`, { decision: 'CONFIRMADA' });
    verificar('confirmar después de vincular funciona', confirmada.estado === 200 && confirmada.cuerpo?.idLocal === localA.id, JSON.stringify(confirmada.cuerpo));
  }

  seccion('Corrección: el alta guarda los datos revisados en el formulario');
  {
    const alta = await put(`/informe-9dj/cargas/${carga.id}/filas/${filaB.id}`, {
      decision: 'ALTA',
      datosAlta: { nombreLocal: 'LOCAL CREADO POR LA PRUEBA', razonSocial: 'COMERCIO DE PRUEBA AUTOMATICA', cuit: CUIT_NUEVO, direccion: 'CALLE DE PRUEBA 123', telefono: '381-0000000' },
    });
    verificar('la decisión ALTA acepta los datos del formulario', alta.estado === 200 && alta.cuerpo?.datosAlta?.nombreLocal === 'LOCAL CREADO POR LA PRUEBA', JSON.stringify(alta.cuerpo));
    const sinNombre = await put(`/informe-9dj/cargas/${carga.id}/filas/${filaB.id}`, { decision: 'ALTA', datosAlta: { nombreLocal: '', direccion: 'X 1' } });
    verificar('sin nombre o sin dirección, el alta se rechaza', sinNombre.estado === 400);
  }

  await put(`/informe-9dj/cargas/${carga.id}/filas/${filaA.id}`, { decision: 'CONFIRMADA' });
  await put(`/informe-9dj/cargas/${carga.id}/filas/${filaRota.id}`, { decision: 'RECHAZADA' });
  if (filaSucursal) await put(`/informe-9dj/cargas/${carga.id}/filas/${filaSucursal.id}`, { decision: 'PENDIENTE' });

  // "Cerrar la pantalla" es simplemente volver a pedir el detalle.
  const { cuerpo: releido } = await get(`/informe-9dj/cargas/${carga.id}`);
  const releerA = releido.filas.find((f) => f.id === filaA.id);
  verificar('la decisión sobrevive a recargar', releerA?.decision === 'CONFIRMADA');
  verificar('y quedó con su autor (criterio 15: cada fila con su decisión y su autor)', releerA?.usuarioDecision === USUARIO);
}

/* ===========================================================================
   CRITERIO 5 — las bajas se proponen con nombre y dirección, nunca de oficio
   =========================================================================== */
seccion('5. El aviso de bajas lista los comercios con nombre y dirección');
{
  const { cuerpo: detalle } = await get(`/informe-9dj/cargas/${carga.id}`);
  const bajas = detalle.bajasPropuestas;
  verificar(
    'la foto propone como baja a los que tienen contrato y no figuran',
    Array.isArray(bajas) && bajas.length > 0,
    `propuestas: ${bajas?.length}`,
  );
  verificar('cada propuesta trae el nombre del comercio', bajas.every((b) => b.nombreLocal));
  verificar('y su dirección, no solo la cantidad', bajas.every((b) => 'direccion' in b));
}

/* ===========================================================================
   APLICAR — criterios 9, 13 y 1 (cierre)
   =========================================================================== */
seccion('9. El alta desde el informe: prefijo CON y actuación origen INFORME_9DJ');

const estadoPrevioA = localA.estado;
let idLocalNuevo = null;
{
  // SIN confirmar ninguna baja: los locales reales conservan su contrato.
  // confirmarIncompleto: el padron real puede tener informes aplicados mas
  // grandes que este de prueba, y la alarma (que se prueba aparte, criterio 6)
  // no tiene que frenar el resto de la suite.
  const { estado, cuerpo } = await post(`/informe-9dj/cargas/${carga.id}/aplicar`, { bajas: [], confirmarIncompleto: true });
  verificar('la carga se aplicó', estado === 200 && cuerpo?.ok === true, JSON.stringify(cuerpo));
  verificar('con un alta y un contrato nuevo', cuerpo?.resumen?.altas === 1 && cuerpo?.resumen?.creados === 1, JSON.stringify(cuerpo?.resumen));

  const { cuerpo: detalle } = await get(`/informe-9dj/cargas/${carga.id}`);
  idLocalNuevo = detalle.filas.find((f) => f.cuit === CUIT_NUEVO)?.idLocal;

  const { cuerpo: nuevo } = await get(`/locales/${idLocalNuevo}`);
  verificar('el comercio nuevo existe', Boolean(nuevo?.id));
  verificar(
    'con los datos revisados en el formulario, no los crudos de la fila',
    nuevo?.nombreLocal === 'LOCAL CREADO POR LA PRUEBA',
    `nombre: ${nuevo?.nombreLocal}`,
  );
  verificar('con el prefijo CON en su identificador de origen', /^CON-/.test(nuevo?.idLegacy ?? nuevo?.idOriginal ?? ''), JSON.stringify(nuevo).slice(0, 200));
  verificar('y en estado CONTRATO_9DJ', nuevo?.estado === 'CONTRATO_9DJ', nuevo?.estado);

  const { cuerpo: actuaciones } = await get('/actuaciones');
  const contratoNuevo = actuaciones.find((a) => a.localId === idLocalNuevo && a.tipo === 'CONTRATO');
  verificar('la actuación del contrato tiene origen INFORME_9DJ', contratoNuevo?.origen === 'INFORME_9DJ', JSON.stringify(contratoNuevo ?? {}).slice(0, 200));
}

seccion('13. Un comercio en GENERAR_EXPEDIENTE que recibe contrato pasa a CONTRATO_9DJ');
{
  // Sobre la máquina de estados, con el caso armado exacto: segunda cédula
  // vencida (GENERAR_EXPEDIENTE) y encima el contrato que informó la foto.
  const base = { id: 1, estadoInicial: 'REVISION_DATOS', bloqueado: false, cuit: '20123456786', razonSocial: 'X', rubro: 'COMERCIO' };
  const notif2Vencida = {
    id: 1, tipo: 'NOTIFICACION', instancia: 2, idEstado: ID_ESTADO.NOTIF_ENTREGADA ?? 0,
    fecha: '2026-01-10', fechaVencimiento: '2026-01-20',
  };
  const sinContrato = estadoDeLocal(base, [notif2Vencida], '2026-06-15');
  const contratoFoto = {
    id: 2, tipo: 'CONTRATO', origen: 'INFORME_9DJ', idEstado: ID_ESTADO.DOC_VIGENTE,
    fecha: '2026-06-01', fechaVencimiento: null,
  };
  const conContrato = estadoDeLocal(base, [notif2Vencida, contratoFoto], '2026-06-15');
  verificar('sin el contrato estaba para expediente', sinContrato === 'GENERAR_EXPEDIENTE', sinContrato);
  verificar('con el contrato de la foto pasa a CONTRATO_9DJ, aun sin fecha de vencimiento', conContrato === 'CONTRATO_9DJ', conContrato);
}

seccion('14. Un comercio heredado sin número de contrato se muestra sin fallar');
{
  const { cuerpo: locales } = await get('/locales');
  const heredados = locales.filter((l) => l.estado === 'CONTRATO_9DJ');
  verificar(
    'los contratos heredados cargados a mano (sin número ni fecha) están en el padrón como CONTRATO_9DJ',
    heredados.length >= 200,
    `hay ${heredados.length}`,
  );
}

/* ===========================================================================
   CRITERIO 8 — el mismo archivo no entra dos veces
   =========================================================================== */
seccion('8. Cargar dos veces el mismo archivo avisa que ya fue procesado');
{
  const { estado, cuerpo } = await cargar('renombrado.csv', csvPrincipal);
  verificar('la doble carga se rechaza aunque el archivo venga renombrado', estado === 409 && /ya se cargó/.test(cuerpo?.error ?? ''), JSON.stringify(cuerpo));
}

/* ===========================================================================
   CRITERIOS 6 y 16 — la alarma de informe incompleto y el descarte limpio
   =========================================================================== */
seccion('6. Un informe con muchas menos filas dispara la advertencia');

{
  const chico = Buffer.from(`CUIT;Razón Social;Domicilio\n${CUIT_NUEVO};UNA SOLA FILA;CALLE 1\n`);
  const { estado: e2, cuerpo: carga2 } = await cargar('informe-chico.csv', chico);
  verificar('el informe chico carga normalmente (la alarma no impide revisar)', e2 === 201, JSON.stringify(carga2).slice(0, 200));
  verificar('la carga avisa que puede estar incompleta', carga2?.incompleto === true, `incompleto: ${carga2?.incompleto}, anterior: ${JSON.stringify(carga2?.informeAnterior)}`);

  const fila = carga2.filas[0];
  await put(`/informe-9dj/cargas/${carga2.id}/filas/${fila.id}`, { decision: 'PENDIENTE' });

  const sinConfirmar = await post(`/informe-9dj/cargas/${carga2.id}/aplicar`, { bajas: [] });
  verificar(
    'aplicar sin reconocer la alarma se rechaza y explica el porqué',
    sinConfirmar.estado === 400 && /incompleto/.test(sinConfirmar.cuerpo?.error ?? ''),
    JSON.stringify(sinConfirmar.cuerpo),
  );

  seccion('16. Descartar el informe no deja rastro en el padrón');
  const { cuerpo: antesDescartar } = await get('/locales');
  await post(`/informe-9dj/cargas/${carga2.id}/descartar`);
  const { cuerpo: despuesDescartar } = await get('/locales');
  verificar('el padrón quedó idéntico', despuesDescartar.length === antesDescartar.length);
  const { cuerpo: historial } = await get('/informe-9dj/cargas');
  verificar(
    'pero la constancia de la carga descartada queda en el historial',
    historial.find((c) => c.id === carga2.id)?.estado === 'DESCARTADO',
  );
}

/* ===========================================================================
   CRITERIO 11 — el contrato del informe es intocable fuera del módulo
   =========================================================================== */
seccion('11. Un contrato origen INFORME_9DJ rechaza la edición desde la ficha');
{
  const { cuerpo: actuaciones } = await get('/actuaciones');
  const contrato = actuaciones.find((a) => a.origen === 'INFORME_9DJ' && a.tipo === 'CONTRATO');
  const validar = await post(`/documentacion/${contrato.id}/validacion`, { aprobar: false, observaciones: 'intento de la prueba' });
  verificar(
    'rechazarlo desde la validación de documentación devuelve error y no toca nada',
    validar.estado === 409 && /9 de Julio/.test(validar.cuerpo?.error ?? ''),
    JSON.stringify(validar.cuerpo),
  );
  const manual = await post('/documentacion', {
    localId: localA.id, tipo: 'CONTRATO', fechaEmision: '2026-06-01', fechaVencimiento: '2027-06-01', origen: 'INFORME_9DJ',
  });
  verificar('y tampoco se puede inventar uno a mano con ese origen', manual.estado === 400, JSON.stringify(manual.cuerpo));
}

/* ===========================================================================
   CRITERIO 12 — anular: motivo, usuario, y el padrón vuelve a como estaba
   =========================================================================== */
seccion('12. Anular una carga registra motivo y usuario, y el estado se recalcula');
{
  const sinMotivo = await post(`/informe-9dj/cargas/${carga.id}/anular`, {});
  verificar('sin motivo no hay anulación', sinMotivo.estado === 400);

  const { estado } = await post(`/informe-9dj/cargas/${carga.id}/anular`, { motivo: 'Carga de la prueba automática: se revierte.' });
  verificar('la anulación corre', estado === 200);

  const { cuerpo: anulada } = await get(`/informe-9dj/cargas/${carga.id}`);
  verificar('quedó ANULADO con su motivo', anulada.estado === 'ANULADO' && Boolean(anulada.motivoAnulacion));
  verificar('y con el usuario que anuló', anulada.usuarioAnulacion === USUARIO);

  const { estado: nuevoBorrado } = await get(`/locales/${idLocalNuevo}`);
  verificar('el comercio que la carga había creado ya no está', nuevoBorrado === 404, `respondió ${nuevoBorrado}`);

  const { cuerpo: localAFinal } = await get(`/locales/${localA.id}`);
  verificar(
    `el local real volvió a su estado anterior (${estadoPrevioA})`,
    localAFinal?.estado === estadoPrevioA,
    `quedó en ${localAFinal?.estado}`,
  );

  const { cuerpo: finales } = await get('/locales');
  verificar('el padrón tiene exactamente los locales que tenía antes de la prueba', finales.length === localesAntes, `${finales.length} vs ${localesAntes}`);
}

/* ===========================================================================
   RESULTADO
   =========================================================================== */
console.log(`\n${ok} criterio(s) cumplidos · ${fallas} falla(s)`);
process.exit(fallas ? 1 : 0);
