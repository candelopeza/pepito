/* ============================================================================
   pruebas/criterios-estado.mjs  —  LOS CRITERIOS DE ACEPTACIÓN DEL PLIEGO
   ----------------------------------------------------------------------------
   Se ejecuta con:  npm run criterios

   Cada prueba de acá es una de las verificaciones del CAPÍTULO 10 de la Guía de
   construcción, redactada como el pliego la redacta. No prueban "el código
   hace lo que dice el código": prueban que el sistema cumple lo que el área
   pidió por escrito.

   Prueban estadoDeLocal() de backend/mapeo.js, que es donde vive la máquina de
   estados (sección 4.3 del pliego). No necesitan base de datos: arman los
   trámites a mano, que es lo que permite probar casos que en el padrón real no
   existen todavía (una prórroga que vence mañana, una DDJJ del 29 de febrero).
   ============================================================================ */

import { estadoDeLocal, ID_ESTADO } from '../backend/mapeo.js';

let ok = 0;
let fallas = 0;

function verificar(criterio, obtenido, esperado) {
  if (obtenido === esperado) {
    ok += 1;
    console.log(`OK   ${criterio}`);
  } else {
    fallas += 1;
    console.log(`FALLA ${criterio}`);
    console.log(`      esperado: ${esperado}`);
    console.log(`      obtenido: ${obtenido}`);
  }
}

function seccion(titulo) {
  console.log(`\n=== ${titulo} ===`);
}

/* --- constructores de datos de prueba ------------------------------------- */

const local = (extra = {}) => ({
  id: 1,
  cuit: '30712345678',
  razonSocial: 'COMERCIO SA',
  rubro: 'GASTRONOMIA',
  bloqueado: false,
  estadoInicial: 'REVISION_DATOS',
  ...extra,
});

let secuencia = 0;
const notificacion = (instancia, idEstado, extra = {}) => ({
  id: (secuencia += 1),
  tipo: 'NOTIFICACION',
  instancia,
  idEstado,
  fecha: '2026-01-10',
  fechaVencimiento: null,
  ...extra,
});

const documento = (tipo, extra = {}) => ({
  id: (secuencia += 1),
  tipo,
  idEstado: ID_ESTADO.DOC_VIGENTE,
  fecha: '2026-01-10',
  fechaVencimiento: null,
  origen: 'PRESENTADO_TITULAR',
  ...extra,
});

const prorroga = (extra = {}) => ({
  id: (secuencia += 1),
  tipo: 'PRORROGA',
  idEstado: ID_ESTADO.PRORROGA_VIGENTE,
  fecha: '2026-01-10',
  fechaVencimiento: null,
  ...extra,
});

const expediente = (extra = {}) => ({
  id: (secuencia += 1),
  tipo: 'EXPEDIENTE',
  idEstado: ID_ESTADO.EXPEDIENTE_GENERADO,
  fecha: '2026-01-10',
  ...extra,
});

const HOY = '2026-06-15';

/* ==========================================================================
   CÓMPUTO DE PLAZOS
   ========================================================================== */
seccion('CÓMPUTO DE PLAZOS');

verificar(
  'una cédula generada pero NO entregada no produce ningún vencimiento',
  estadoDeLocal(local(), [notificacion(1, ID_ESTADO.NOTIF_GENERADA, { fecha: '2020-01-01' })], HOY),
  'NOTIF1_GENERADA',
);

verificar(
  'una cédula con resultado "No entregada" no hace avanzar al local',
  estadoDeLocal(
    local(),
    [notificacion(1, ID_ESTADO.NOTIF_NO_ENTREGADA, { fecha: '2020-01-01' })],
    HOY,
  ),
  'NOTIF1_NO_ENTREGADA',
);

verificar(
  'una cédula entregada con el plazo EN CURSO muestra el resultado de la entrega',
  estadoDeLocal(
    local(),
    [notificacion(1, ID_ESTADO.NOTIF_ENTREGADA, { fechaVencimiento: '2026-06-20' })],
    HOY,
  ),
  'NOTIF1_ENTREGADA',
);

verificar(
  'el día del vencimiento el interesado todavía puede presentar',
  estadoDeLocal(
    local(),
    [notificacion(1, ID_ESTADO.NOTIF_ENTREGADA, { fechaVencimiento: HOY })],
    HOY,
  ),
  'NOTIF1_ENTREGADA',
);

verificar(
  'vencida la primera con datos completos, pasa a segunda notificación',
  estadoDeLocal(
    local(),
    [notificacion(1, ID_ESTADO.NOTIF_ENTREGADA, { fechaVencimiento: '2026-06-01' })],
    HOY,
  ),
  'NOTIF2_PENDIENTE',
);

verificar(
  'vencida la segunda, corresponde generar expediente',
  estadoDeLocal(
    local(),
    [notificacion(2, ID_ESTADO.NOTIF_ENTREGADA, { fechaVencimiento: '2026-06-01' })],
    HOY,
  ),
  'GENERAR_EXPEDIENTE',
);

/* ==========================================================================
   DEBIDO PROCESO
   ========================================================================== */
seccion('DEBIDO PROCESO');

verificar(
  'ningún local avanza a segunda notificación sin CUIT, razón social y rubro',
  estadoDeLocal(
    local({ cuit: '' }),
    [notificacion(1, ID_ESTADO.NOTIF_ENTREGADA, { fechaVencimiento: '2026-06-01' })],
    HOY,
  ),
  'COMPLETAR_DATOS',
);

verificar(
  'un rubro SIN INFORMAR cuenta como dato registral faltante',
  estadoDeLocal(
    local({ rubro: 'SIN INFORMAR' }),
    [notificacion(1, ID_ESTADO.NOTIF_ENTREGADA, { fechaVencimiento: '2026-06-01' })],
    HOY,
  ),
  'COMPLETAR_DATOS',
);

/* ==========================================================================
   VIGENCIAS
   ========================================================================== */
seccion('VIGENCIAS');

verificar(
  'un local con contrato vigente y notificación vencida figura como contrato vigente',
  estadoDeLocal(
    local(),
    [
      notificacion(2, ID_ESTADO.NOTIF_ENTREGADA, { fecha: '2026-01-10', fechaVencimiento: '2026-02-01' }),
      documento('CONTRATO', { fecha: '2026-03-01', fechaVencimiento: '2027-03-01' }),
    ],
    HOY,
  ),
  'CONTRATO_VIGENTE',
);

verificar(
  'el contrato informado por la prestataria tiene su propio estado',
  estadoDeLocal(
    local(),
    [documento('CONTRATO', { fechaVencimiento: '2027-03-01', origen: 'INFORME_9DJ' })],
    HOY,
  ),
  'CONTRATO_9DJ',
);

verificar(
  'una DDJJ emitida el 15 de marzo ya no está vigente el 15 de marzo siguiente',
  estadoDeLocal(
    local(),
    [documento('DDJJ', { fecha: '2025-03-15', fechaVencimiento: '2026-03-15' })],
    '2026-03-15',
  ),
  'NOTIF1_PENDIENTE',
);

verificar(
  'el día anterior al vencimiento la DDJJ todavía está vigente',
  estadoDeLocal(
    local(),
    [documento('DDJJ', { fecha: '2025-03-15', fechaVencimiento: '2026-03-15' })],
    '2026-03-14',
  ),
  'DDJJ_VIGENTE',
);

verificar(
  'al vencer el último documento el local reingresa a primera notificación',
  estadoDeLocal(
    local(),
    [
      notificacion(2, ID_ESTADO.NOTIF_ENTREGADA, { fecha: '2025-01-10', fechaVencimiento: '2025-02-01' }),
      documento('DDJJ', { fecha: '2025-03-01', fechaVencimiento: '2026-03-01' }),
    ],
    HOY,
  ),
  'NOTIF1_PENDIENTE',
);

verificar(
  'la DDJJ de reciclaje tiene su propio estado',
  estadoDeLocal(local(), [documento('DDJJ_RECICLAJE', { fechaVencimiento: '2027-01-01' })], HOY),
  'DDJJ_RECICLAJE',
);

verificar(
  'una presentación del portal sin aprobar NO saca al local del circuito',
  estadoDeLocal(
    local(),
    [
      notificacion(1, ID_ESTADO.NOTIF_ENTREGADA, { fecha: '2026-01-10', fechaVencimiento: '2026-02-01' }),
      documento('DDJJ', {
        fecha: '2026-03-01',
        fechaVencimiento: '2027-03-01',
        idEstado: ID_ESTADO.DOC_PENDIENTE_REVISION,
      }),
    ],
    HOY,
  ),
  'NOTIF2_PENDIENTE',
);

verificar(
  'presentada DENTRO del plazo, la revisión de la oficina congela el avance',
  estadoDeLocal(
    local(),
    [
      notificacion(1, ID_ESTADO.NOTIF_ENTREGADA, { fecha: '2026-01-10', fechaVencimiento: '2026-02-01' }),
      // Presentó el 25/01, antes del vencimiento del 01/02: los días del plazo
      // eran para esto. El circuito no avanza por la demora en validar.
      documento('DDJJ', { fecha: '2026-01-25', fechaVencimiento: '2027-01-25', idEstado: ID_ESTADO.DOC_PENDIENTE_REVISION }),
    ],
    HOY,
  ),
  'PRESENTACION_EN_REVISION',
);

verificar(
  'si la oficina la aprueba, el local acredita (sale del circuito)',
  estadoDeLocal(
    local(),
    [
      notificacion(1, ID_ESTADO.NOTIF_ENTREGADA, { fecha: '2026-01-10', fechaVencimiento: '2026-02-01' }),
      documento('DDJJ', { fecha: '2026-01-25', fechaVencimiento: '2027-01-25' }),
    ],
    HOY,
  ),
  'DDJJ_VIGENTE',
);

/* ==========================================================================
   PRÓRROGA
   ========================================================================== */
seccion('PRÓRROGA');

verificar(
  'mientras la prórroga está vigente el local no aparece para generar expediente',
  estadoDeLocal(local(), [prorroga({ fechaVencimiento: '2026-07-01' })], HOY),
  'PRORROGA_VIGENTE',
);

verificar(
  'al vencer sin presentación, la prórroga deja el local para generar expediente',
  estadoDeLocal(local(), [prorroga({ fechaVencimiento: '2026-06-01' })], HOY),
  'GENERAR_EXPEDIENTE',
);

verificar(
  'el día del vencimiento la prórroga ya no está vigente',
  estadoDeLocal(local(), [prorroga({ fechaVencimiento: HOY })], HOY),
  'GENERAR_EXPEDIENTE',
);

/* ==========================================================================
   EXPEDIENTE Y ESTADOS TERMINALES
   ========================================================================== */
seccion('EXPEDIENTE Y ESTADOS TERMINALES');

verificar(
  'el expediente iniciado deja el local en estado Expediente',
  estadoDeLocal(local(), [expediente()], HOY),
  'EXPEDIENTE',
);

verificar(
  'la exención confirmada es terminal: no la mueve ninguna actuación',
  estadoDeLocal(
    local({ estadoInicial: 'EXENTO_CONFIRMADO' }),
    [notificacion(2, ID_ESTADO.NOTIF_ENTREGADA, { fechaVencimiento: '2020-01-01' })],
    HOY,
  ),
  'EXENTO_CONFIRMADO',
);

verificar(
  'el bloqueo manual excluye el local del cálculo automático',
  estadoDeLocal(
    local({ bloqueado: true, estadoInicial: 'REVISION_DATOS' }),
    [notificacion(2, ID_ESTADO.NOTIF_ENTREGADA, { fechaVencimiento: '2020-01-01' })],
    HOY,
  ),
  'REVISION_DATOS',
);

/* ==========================================================================
   ORDEN DE PRIORIDAD (sección 4.3)
   ========================================================================== */
seccion('ORDEN DE PRIORIDAD');

verificar(
  'la documentación vigente gana sobre una prórroga vigente',
  estadoDeLocal(
    local(),
    [prorroga({ fecha: '2026-05-01', fechaVencimiento: '2026-07-01' }),
     documento('DDJJ', { fecha: '2026-05-10', fechaVencimiento: '2027-05-10' })],
    HOY,
  ),
  'DDJJ_VIGENTE',
);

verificar(
  'la documentación vigente gana sobre un expediente iniciado',
  estadoDeLocal(
    local(),
    [expediente({ fecha: '2026-02-01' }), documento('CONTRATO', { fecha: '2026-03-01', fechaVencimiento: '2027-03-01' })],
    HOY,
  ),
  'CONTRATO_VIGENTE',
);

verificar(
  'el contrato gana sobre la DDJJ cuando los dos están vigentes',
  estadoDeLocal(
    local(),
    [documento('DDJJ', { fechaVencimiento: '2027-01-01' }), documento('CONTRATO', { fechaVencimiento: '2027-01-01' })],
    HOY,
  ),
  'CONTRATO_VIGENTE',
);

/* ========================================================================== */
console.log(`\n${ok} criterio(s) cumplidos · ${fallas} falla(s)`);
process.exit(fallas === 0 ? 0 : 1);
