/* ============================================================================
   pruebas/criterios.mjs  —  LOS CRITERIOS DE ACEPTACIÓN DEL CAPÍTULO 10
   ----------------------------------------------------------------------------
   El pliego define los criterios de aceptación como pruebas concretas, no como
   principios generales. Están escritos tal cual, uno por línea.

   SE CORRE CON:   npm test
   No necesita ninguna librería: es node pelado contra la capa de dominio.

   >>> SI TOCÁS dominio/reglas.js, dominio/fechas.js O dominio/vigencias.js,
       CORRÉ ESTO ANTES DE DAR EL CAMBIO POR BUENO. <<<
   Cada línea de acá es un acto administrativo que puede salir mal: un plazo
   mal computado es una intimación impugnable, no un bug cosmético.
   ============================================================================ */
import { vencimientoHabil, plazoVencido } from '../src/dominio/fechas.js';
import { vencimientoAnual, estaVigente } from '../src/dominio/vigencias.js';
import { requiereDatosRegistrales, resolverEstado } from '../src/dominio/reglas.js';
import { accionesRapidasPara, puedeVerRuta } from '../src/config/modulos.js';
import { textoDeCedula } from '../src/dominio/textoCedula.js';
import { armarNumeroCedula, completarNumeroCedula, mismoNumeroCedula, numeroCedula } from '../src/dominio/actuaciones.js';

let ok = 0;
let mal = 0;
const chequear = (nombre, obtenido, esperado) => {
  const bien = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (bien) ok += 1;
  else mal += 1;
  console.log(`${bien ? 'OK  ' : 'MAL '} ${nombre}${bien ? '' : `\n     esperado ${esperado} · obtenido ${obtenido}`}`);
};

console.log('=== CÓMPUTO DE PLAZOS ===');
// 2026-03-06 es viernes. 5 días hábiles, sin feriados -> viernes 13.
chequear('viernes + 5 hábiles vence el viernes siguiente', vencimientoHabil('2026-03-06', 5, [], false), '2026-03-13');
// Con un feriado el miércoles 11 en el medio -> corre al lunes 16.
chequear(
  'con un feriado en el medio, vence el lunes posterior',
  vencimientoHabil('2026-03-06', 5, [{ fecha: '2026-03-11' }], false),
  '2026-03-16',
);
chequear('el día de la entrega puede contar como día uno', vencimientoHabil('2026-03-06', 5, [], true), '2026-03-12');
chequear('segunda notificación: 3 días hábiles', vencimientoHabil('2026-03-06', 3, [], false), '2026-03-11');
chequear('el día del vencimiento todavía no está vencido', plazoVencido('2026-03-13', '2026-03-13'), false);
chequear('vence al día siguiente', plazoVencido('2026-03-13', '2026-03-14'), true);

console.log('\n=== VIGENCIAS ===');
chequear('DDJJ del 15/03 vence el 15/03 del año siguiente', vencimientoAnual('2026-03-15'), '2027-03-15');
chequear('ese día ya NO está vigente', estaVigente('2027-03-15', '2027-03-15'), false);
chequear('el día anterior sí', estaVigente('2027-03-15', '2027-03-14'), true);
chequear('29/02 con criterio 01-mar', vencimientoAnual('2028-02-29', '01-mar'), '2029-03-01');
chequear('29/02 con criterio 28-feb', vencimientoAnual('2028-02-29', '28-feb'), '2029-02-28');

console.log('\n=== MÁQUINA DE ESTADOS ===');
const HOY = '2026-09-04';
const localCompleto = { id: 1, cuit: '30-1-1', razonSocial: 'X S.A.', rubro: 'Industria', estadoInicial: 'NOTIF1_PENDIENTE' };
const localIncompleto = { ...localCompleto, cuit: '', razonSocial: '' };
const est = (local, acts) => resolverEstado(local, acts, { hoy: HOY });

const cedula = (extra) => ({ id: 1, localId: 1, tipo: 'NOTIFICACION', instancia: 1, fecha: '2026-08-01', ...extra });

chequear('sin actuaciones queda en el estado inicial', est(localCompleto, []), 'NOTIF1_PENDIENTE');
chequear('cédula emitida sin entregar', est(localCompleto, [cedula({ resultado: null })]), 'NOTIF1_GENERADA');
chequear(
  'cédula generada y no entregada no produce vencimiento, pase el tiempo que pase',
  est(localCompleto, [cedula({ fecha: '2020-01-01', resultado: null })]),
  'NOTIF1_GENERADA',
);
chequear(
  'no entregada: el circuito se detiene',
  est(localCompleto, [cedula({ resultado: 'NO_ENTREGADA', fechaVencimiento: null })]),
  'NOTIF1_NO_ENTREGADA',
);
chequear(
  'entregada con plazo corriendo',
  est(localCompleto, [cedula({ resultado: 'ENTREGADA', fechaEntrega: '2026-09-02', fechaVencimiento: '2026-09-09' })]),
  'NOTIF1_ENTREGADA',
);
chequear(
  'plazo vencido con datos completos -> segunda notificación',
  est(localCompleto, [cedula({ resultado: 'ENTREGADA', fechaEntrega: '2026-08-01', fechaVencimiento: '2026-08-08' })]),
  'NOTIF2_PENDIENTE',
);
chequear(
  'plazo vencido SIN datos registrales -> completar datos',
  est(localIncompleto, [cedula({ resultado: 'FIJADA', fechaEntrega: '2026-08-01', fechaVencimiento: '2026-08-08' })]),
  'COMPLETAR_DATOS',
);

const dosNotifs = [
  cedula({ id: 1, fecha: '2026-07-01', resultado: 'ENTREGADA', fechaEntrega: '2026-07-01', fechaVencimiento: '2026-07-08' }),
  cedula({ id: 2, instancia: 2, fecha: '2026-07-10', resultado: 'ENTREGADA', fechaEntrega: '2026-07-11', fechaVencimiento: '2026-07-15' }),
];
chequear('segunda vencida -> generar expediente', est(localCompleto, dosNotifs), 'GENERAR_EXPEDIENTE');

const conProrrogaVigente = [...dosNotifs, { id: 3, localId: 1, tipo: 'PRORROGA', fecha: '2026-09-01', fechaVencimiento: '2026-09-20' }];
chequear('prórroga vigente suspende el expediente', est(localCompleto, conProrrogaVigente), 'PRORROGA_VIGENTE');

const conProrrogaVencida = [...dosNotifs, { id: 3, localId: 1, tipo: 'PRORROGA', fecha: '2026-07-20', fechaVencimiento: '2026-08-01' }];
chequear('prórroga vencida -> generar expediente', est(localCompleto, conProrrogaVencida), 'GENERAR_EXPEDIENTE');

const conExpediente = [...dosNotifs, { id: 3, localId: 1, tipo: 'EXPEDIENTE', fecha: '2026-07-20', numeroExpediente: 'EXP-1' }];
chequear('expediente registrado', est(localCompleto, conExpediente), 'EXPEDIENTE');
chequear(
  'reingreso al circuito desde expediente -> primera notificación pendiente',
  est(localCompleto, [...conExpediente, { id: 4, localId: 1, tipo: 'REINGRESO', fecha: '2026-08-01' }]),
  'NOTIF1_PENDIENTE',
);

console.log('\n--- prioridad de la documentación vigente ---');
const docVigente = { id: 9, localId: 1, tipo: 'DDJJ', fecha: '2026-08-20', fechaEmision: '2026-08-20', fechaVencimiento: '2027-08-20', validado: true };
chequear(
  'contrato/DDJJ vigente gana sobre una notificación vencida',
  est(localCompleto, [...dosNotifs, docVigente]),
  'DDJJ_VIGENTE',
);
chequear(
  'contrato informado por la prestataria tiene estado propio',
  est(localCompleto, [{ ...docVigente, tipo: 'CONTRATO', origen: 'INFORME_9DJ' }]),
  'CONTRATO_9DJ',
);
chequear(
  'una presentación sin validar NO suspende el plazo',
  est(localCompleto, [...dosNotifs, { ...docVigente, validado: false }]),
  'GENERAR_EXPEDIENTE',
);
chequear(
  'al vencer el último documento, el local reingresa a primera notificación',
  est(localCompleto, [...dosNotifs, { ...docVigente, fechaVencimiento: '2026-08-30' }]),
  'NOTIF1_PENDIENTE',
);

console.log('\n--- terminal y bloqueo ---');
chequear(
  'la exención confirmada es terminal',
  est({ ...localCompleto, estadoInicial: 'EXENTO_CONFIRMADO' }, [docVigente]),
  'EXENTO_CONFIRMADO',
);
chequear(
  'el bloqueo manual congela el estado',
  est({ ...localCompleto, bloqueado: true, estadoCongelado: 'GENERAR_EXPEDIENTE' }, [docVigente]),
  'GENERAR_EXPEDIENTE',
);

console.log('\n=== NÚMERO DE CÉDULA ===');
// El notificador escribe solo el número; el prefijo y los ceros los pone el
// sistema. Un error acá hace que una entrega legítima se rechace en la calle.
chequear('la secuencia arma el número oficial', numeroCedula(1275), 'CED-001275');
chequear('escribiendo 1275 se completa a CED-001275', completarNumeroCedula('1275'), 'CED-001275');
chequear('los ceros de más no molestan', completarNumeroCedula('001275'), 'CED-001275');
chequear('pegar la cédula entera también vale', completarNumeroCedula('CED-001275'), 'CED-001275');
chequear('sin dígitos no hay número', completarNumeroCedula('CED-'), '');
chequear('1275 es la misma cédula que CED-001275', mismoNumeroCedula('1275', 'CED-001275'), true);
chequear('1276 NO es la cédula asignada', mismoNumeroCedula('1276', 'CED-001275'), false);
chequear('lo vacío no coincide con ninguna cédula', mismoNumeroCedula('', 'CED-001275'), false);
// Formato de la base del área: SERIE-CORRELATIVO. El notificador escribe el
// correlativo, lo que figura después del guion en el papel.
chequear('675 es la cédula 0001-675 de la base', mismoNumeroCedula('675', '0001-675'), true);
chequear('676 NO es la cédula 0001-675', mismoNumeroCedula('676', '0001-675'), false);
chequear('escribiendo 675 se arma 0001-675', armarNumeroCedula('675', '0001-675'), '0001-675');

// Datos registrales: la PRIMERA cédula sale con nombre y dirección del local;
// la SEGUNDA individualiza al sujeto obligado y exige CUIT y razón social.
chequear('la primera cédula no exige datos registrales', requiereDatosRegistrales('generar-cedula', false, 1), false);
chequear('la segunda cédula sí exige datos registrales', requiereDatosRegistrales('generar-cedula', false, 2), true);
chequear('regenerar la segunda cédula exige lo mismo que emitirla', requiereDatosRegistrales('regenerar-cedula', false, 2), true);
chequear('el expediente exige datos solo si el parámetro lo pide', requiereDatosRegistrales('registrar-expediente', false), false);
chequear('con el parámetro prendido, el expediente exige datos', requiereDatosRegistrales('registrar-expediente', true), true);

// Accesos: lo que el administrador apaga desde Tipos de usuario también apaga
// las subrutas del módulo (la ficha de un local cuelga del padrón). De esto
// depende que la tarjeta del Inicio desaparezca junto con el módulo.
const sinPadron = { modulos: { locales: { administrativo: 'no' } }, rolesDeshabilitados: [] };
chequear('el Inicio siempre se puede ver', puedeVerRuta('administrativo', '/', sinPadron), true);
chequear('con el padrón apagado no se ve /locales', puedeVerRuta('administrativo', '/locales', sinPadron), false);
chequear('ni la ficha de un local, que cuelga del padrón', puedeVerRuta('administrativo', '/locales/123', sinPadron), false);
chequear('los demás módulos no se ven afectados', puedeVerRuta('administrativo', '/documentacion', sinPadron), true);
chequear('un rol apagado entero no ve nada', puedeVerRuta('administrativo', '/documentacion', { modulos: {}, rolesDeshabilitados: ['administrativo'] }), false);

// La primera cédula sale aunque falten CUIT, razón social o rubro (van como
// "No informado"); la segunda los exige, porque individualiza al obligado.
const PLANTILLA = 'Cédula {numeroCedula} - {instanciaTexto} - {nombreLocal} - CUIT {cuit} - {razonSocial} - {rubro} - {direccion}';
const localSinDatos = { nombreLocal: 'Kiosco', direccion: 'Mendoza 100', cuit: '', razonSocial: '', rubro: '' };
chequear(
  'la primera cédula no tiene faltantes aunque el local no tenga CUIT',
  textoDeCedula(PLANTILLA, { numeroCedula: '0001-1', instancia: 1, fecha: '2026-10-01' }, localSinDatos).faltantes,
  0,
);
chequear(
  'la segunda cédula sin CUIT, razón social ni rubro tiene 3 faltantes',
  textoDeCedula(PLANTILLA, { numeroCedula: '0001-2', instancia: 2, fecha: '2026-10-01' }, localSinDatos).faltantes,
  3,
);

// Una acción rápida se va del Inicio cuando se apaga el módulo del que
// depende, aunque su pantalla de destino sea otra (Nuevo relevamiento lleva
// a Campo → Relevar, pero es parte de Relevamientos).
const sinRelevamientos = { modulos: { relevamientos: { coordinacion: 'no' } }, rolesDeshabilitados: [] };
chequear(
  'con Relevamientos apagado, coordinación no ve "Nuevo relevamiento"',
  accionesRapidasPara('coordinacion', sinRelevamientos).some((a) => a.id === 'nuevo-relevamiento'),
  false,
);
// Coordinación no releva (decisión del 30/10/2026): la tarjeta es del relevador.
chequear(
  'con todo prendido, el relevador sí la ve',
  accionesRapidasPara('relevador', { modulos: {}, rolesDeshabilitados: [] }).some((a) => a.id === 'nuevo-relevamiento'),
  true,
);
chequear(
  'y con Relevamientos apagado para el relevador, tampoco la ve',
  accionesRapidasPara('relevador', { modulos: { relevamientos: { relevador: 'no' } }, rolesDeshabilitados: [] }).some((a) => a.id === 'nuevo-relevamiento'),
  false,
);

console.log(`\n${ok} criterio(s) cumplidos · ${mal} falla(s)`);
if (mal) process.exit(1);
