/* ============================================================================
   datos/semilla.js  —  DATOS DE PRUEBA  *** NO HAY BACKEND TODAVÍA ***
   ----------------------------------------------------------------------------
   Esta es la base de datos de la maqueta. Está armada con un criterio: hay al
   menos un local en CADA estado del circuito, así se puede ver y mostrar el
   sistema completo sin cargar nada a mano.

   LAS FECHAS SON RELATIVAS AL DÍA EN QUE SE ABRE LA APP.
   No hay ninguna fecha escrita fija: todas salen de dia(-20), dia(+3), etc.
   Si fueran fijas, en dos meses todos los plazos estarían vencidos y la demo
   mostraría cualquier cosa.

   CUANDO EXISTA EL BACKEND: este archivo se borra. Lo único que hay que
   cambiar es datos/DatosProvider.jsx, que hoy lo llama para arrancar y pasaría
   a hacer los fetch. Ninguna pantalla importa este archivo.
   ============================================================================ */

import { hoyISO, sumarDias, vencimientoHabil } from '../dominio/fechas.js';
import { vencimientoAnual } from '../dominio/vigencias.js';
import { geocodificar } from '../dominio/geo.js';

/* Atajo: dia(-5) = hace cinco días. */
const dia = (n) => sumarDias(hoyISO(), n);

/* Fecha y hora completa, para relevamientos y auditoría. */
const momento = (n, hora = '10:30') => `${dia(n)}T${hora}:00`;

/* ============================================================================
   FERIADOS  (sección 4.1)
   ----------------------------------------------------------------------------
   [NO PORTAR] El sistema viejo excluye solo sábados y domingos: hoy los plazos
   pueden estar venciendo antes de lo que corresponde legalmente.

   La tabla es administrable desde Configuración → Feriados e incluye los tres
   alcances que pide el pliego: nacional, provincial de Tucumán y asueto
   municipal. Los años que faltan se cargan desde esa pantalla.
   ============================================================================ */
const anio = new Date().getFullYear();

export const FERIADOS_INICIALES = [
  { id: 1, fecha: `${anio}-01-01`, motivo: 'Año Nuevo', alcance: 'nacional' },
  { id: 2, fecha: `${anio}-03-24`, motivo: 'Día de la Memoria', alcance: 'nacional' },
  { id: 3, fecha: `${anio}-04-02`, motivo: 'Día del Veterano y de los Caídos en Malvinas', alcance: 'nacional' },
  { id: 4, fecha: `${anio}-05-01`, motivo: 'Día del Trabajador', alcance: 'nacional' },
  { id: 5, fecha: `${anio}-05-25`, motivo: 'Revolución de Mayo', alcance: 'nacional' },
  { id: 6, fecha: `${anio}-06-20`, motivo: 'Paso a la Inmortalidad del Gral. Belgrano', alcance: 'nacional' },
  { id: 7, fecha: `${anio}-07-09`, motivo: 'Día de la Independencia', alcance: 'nacional' },
  { id: 8, fecha: `${anio}-08-17`, motivo: 'Paso a la Inmortalidad del Gral. San Martín', alcance: 'nacional' },
  { id: 9, fecha: `${anio}-09-24`, motivo: 'Batalla de Tucumán', alcance: 'provincial' },
  { id: 10, fecha: `${anio}-10-12`, motivo: 'Día del Respeto a la Diversidad Cultural', alcance: 'nacional' },
  { id: 11, fecha: `${anio}-11-23`, motivo: 'Día de la Soberanía Nacional', alcance: 'nacional' },
  { id: 12, fecha: `${anio}-12-08`, motivo: 'Inmaculada Concepción', alcance: 'nacional' },
  { id: 13, fecha: `${anio}-12-25`, motivo: 'Navidad', alcance: 'nacional' },
  { id: 14, fecha: `${anio}-10-24`, motivo: 'Fundación de San Miguel de Tucumán (asueto)', alcance: 'municipal' },
];

/* ============================================================================
   PARÁMETROS DEL SISTEMA  (sección 4.1)
   ----------------------------------------------------------------------------
   Los plazos son FIJOS por decisión de la Dirección: no se cargan por
   actuación y coordinación no los puede tocar. Se implementan como parámetros
   editables ÚNICAMENTE desde el rol Dirección, así un cambio de criterio no
   requiere desarrollo pero tampoco queda al alcance del uso diario.

   Los tres primeros de la segunda mitad están en el Anexo B.2 como decisiones
   pendientes. Quedaron como parámetro justamente para no tener que reprogramar
   cuando el área legal defina.
   ============================================================================ */
export const PARAMETROS_INICIALES = {
  plazoNotif1: 5,               // días hábiles
  plazoNotif2: 3,               // días hábiles
  contarDiaEntrega: false,      // PENDIENTE área legal: ¿el día de la entrega es el día 1?
  modoBisiesto: '01-mar',       // PENDIENTE área legal: DDJJ del 29/02 -> '28-feb' | '01-mar'
  exigirDatosSiempre: true,     // PENDIENTE: exigir CUIT/razón social/rubro también antes del expediente
  emisionAutomatica: false,     // sección 9.6: manual con control previo, o automática
  topeProrrogaDias: 30,         // PENDIENTE: ¿hay tope? 0 = sin tope
  maxProrrogasPorLocal: 1,      // PENDIENTE: ¿cuántas prórrogas por local?
};

/* Numeraciones administrativas con significado legal (sección 5.4): secuencias
   controladas, sin reutilización. Arrancan del último valor emitido en el
   sistema viejo. */
export const SECUENCIAS_INICIALES = {
  cedula: 1284,
  expediente: 96,
};

/* ============================================================================
   USUARIOS
   ----------------------------------------------------------------------------
   [NO PORTAR] El sistema viejo identifica a los agentes por su cuenta personal
   de correo gratuito: un agente que deja el organismo conserva el control de
   la cuenta con la que firmó actuaciones administrativas. Acá la identidad es
   institucional (la va a proveer CiDiTuc, capítulo 8).

   El alta y la baja se hacen desde Configuración → Usuarios, sin tocar código:
   es un requerimiento explícito del área (sección 7.1), porque el equipo rota.
   ============================================================================ */
export const USUARIOS_INICIALES = [
  { id: 1, nombre: 'Mariano Agustín', email: 'magustin@smt.gob.ar', rol: 'coordinacion', activo: true },
  { id: 2, nombre: 'Candelaria Peza', email: 'cpeza@smt.gob.ar', rol: 'administrativo', activo: true },
  { id: 3, nombre: 'Jorge Medina', email: 'jmedina@smt.gob.ar', rol: 'relevador', activo: true },
  { id: 4, nombre: 'Lucía Sosa', email: 'lsosa@smt.gob.ar', rol: 'notificador', activo: true },
  { id: 5, nombre: 'Raúl Ibáñez', email: 'ribanez@smt.gob.ar', rol: 'notificador', activo: true },
  { id: 6, nombre: 'Dirección de Ambiente', email: 'ambiente@smt.gob.ar', rol: 'direccion', activo: true },
  { id: 7, nombre: 'Ana Gómez (titular)', email: 'ana.gomez@gmail.com', rol: 'titular', activo: true },
  { id: 8, nombre: 'Sistema', email: 'sistema@smt.gob.ar', rol: 'sistema', activo: true },
  { id: 9, nombre: 'Pedro Ruiz (baja)', email: 'pruiz@smt.gob.ar', rol: 'relevador', activo: false },
];

export const RUBROS_INICIALES = [
  { id: 1, nombre: 'Supermercado' },
  { id: 2, nombre: 'Industria' },
  { id: 3, nombre: 'Gastronomía' },
  { id: 4, nombre: 'Hotelería' },
  { id: 5, nombre: 'Salud' },
  { id: 6, nombre: 'Comercio mayorista' },
  { id: 7, nombre: 'Servicios' },
  { id: 8, nombre: 'Shopping / Galería' },
];

/* Plantilla de la cédula (sección 6.4). Es texto editable por el área, con
   variables entre llaves que el sistema reemplaza al generar el PDF. */
export const PLANTILLA_INICIAL = `MUNICIPALIDAD DE SAN MIGUEL DE TUCUMÁN
Secretaría de Ambiente y Sustentabilidad — Dirección de Ambiente

CÉDULA DE NOTIFICACIÓN N° {numeroCedula}
{instanciaTexto}

Establecimiento: {nombreLocal}
Razón social: {razonSocial}
CUIT: {cuit}
Domicilio: {direccion}
Rubro: {rubro}

Por la presente se intima al titular del establecimiento a acreditar, en el
plazo de {plazoDias} días hábiles contados desde la recepción de esta cédula,
la gestión de sus residuos por vía propia, mediante alguna de las siguientes
formas:

  a) contrato vigente con prestador habilitado del servicio de recolección;
  b) Declaración Jurada de gestión de residuos;
  c) Declaración Jurada de Separación de Residuos (reciclaje).

La falta de presentación en el plazo indicado dará lugar a las actuaciones
administrativas que correspondan.

San Miguel de Tucumán, {fechaEmision}.`;

/* ============================================================================
   LOCALES
   ----------------------------------------------------------------------------
   `estadoInicial` es el punto de partida que dejó el control administrativo.
   El estado que se ve en pantalla NO es este: se calcula con las actuaciones
   (dominio/reglas.js). Este campo solo dice de dónde arranca el cálculo.

   La coordenada del padrón se obtiene geocodificando la dirección, NUNCA se
   copia del relevamiento (sección 9.2). Por eso acá se llama a geocodificar()
   en vez de escribir latitud y longitud a mano.
   ============================================================================ */
function local(base) {
  const geo = geocodificar(base.direccion);
  return {
    idLegacy: null,
    cuit: '',
    razonSocial: '',
    domicilioFiscal: '',
    email: '',
    telefono: '',
    observaciones: '',
    titularCuil: null,
    bloqueado: false,
    bloqueadoMotivo: '',
    bloqueadoPor: null,
    bloqueadoEn: null,
    estadoCongelado: null,
    latitud: geo.ok ? geo.latitud : null,
    longitud: geo.ok ? geo.longitud : null,
    motivoSinGeo: geo.ok ? null : geo.motivo,
    ...base,
  };
}

export const LOCALES_INICIALES = [
  local({
    id: 1, idLegacy: 'L-0412', nombreLocal: 'Supermercado Norte', razonSocial: 'Distribuidora Norte S.A.',
    cuit: '30-12345678-9', rubro: 'Supermercado', direccion: 'Av. Alem 1230',
    domicilioFiscal: 'Av. Alem 1230', email: 'compras@dnorte.com.ar', telefono: '381-4221100',
    estadoInicial: 'NOTIF1_PENDIENTE', titularCuil: '27-30111222-4',
  }),
  local({
    id: 2, idLegacy: 'L-0198', nombreLocal: 'Industria Sur', razonSocial: 'Metalúrgica Sur S.R.L.',
    cuit: '30-98765432-1', rubro: 'Industria', direccion: 'Ruta 301 Km 5',
    domicilioFiscal: 'San Martín 45', email: 'admin@indsur.com', telefono: '381-4330099',
    estadoInicial: 'NOTIF1_PENDIENTE',
  }),
  local({
    id: 3, idLegacy: 'L-0733', nombreLocal: 'Farmacia Centro', razonSocial: '',
    cuit: '', rubro: 'Salud', direccion: 'San Martín 456',
    estadoInicial: 'REVISION_DATOS',
  }),
  local({
    id: 4, nombreLocal: 'Kiosco San Martín', razonSocial: '', cuit: '',
    rubro: 'Servicios', direccion: 'San Martín 980',
    estadoInicial: 'EXENTO_REVISION',
  }),
  local({
    id: 5, idLegacy: 'L-0055', nombreLocal: 'Panadería La Espiga', razonSocial: 'La Espiga S.H.',
    cuit: '30-22334455-6', rubro: 'Gastronomía', direccion: 'Muñecas 745',
    estadoInicial: 'EXENTO_CONFIRMADO',
  }),
  local({
    id: 6, idLegacy: 'L-0301', nombreLocal: 'Hotel Plaza', razonSocial: 'Plaza Hoteles S.A.',
    cuit: '30-44556677-8', rubro: 'Hotelería', direccion: '24 de Septiembre 512',
    domicilioFiscal: '24 de Septiembre 512', email: 'gerencia@hotelplaza.com.ar', telefono: '381-4310000',
    estadoInicial: 'NOTIF1_PENDIENTE',
  }),
  local({
    id: 7, idLegacy: 'L-0620', nombreLocal: 'Shopping Aconquija', razonSocial: 'Aconquija Centro Comercial S.A.',
    cuit: '30-66778899-0', rubro: 'Shopping / Galería', direccion: 'Av. Aconquija 1850',
    estadoInicial: 'NOTIF1_PENDIENTE',
  }),
  local({
    id: 8, idLegacy: 'L-0811', nombreLocal: 'Clínica Belgrano', razonSocial: 'Centro Médico Belgrano S.A.',
    cuit: '30-11223344-5', rubro: 'Salud', direccion: 'Belgrano 620',
    estadoInicial: 'NOTIF1_PENDIENTE',
  }),
  local({
    id: 9, idLegacy: 'L-0904', nombreLocal: 'Restaurante El Fogón', razonSocial: 'El Fogón Gastronomía S.R.L.',
    cuit: '30-55667788-2', rubro: 'Gastronomía', direccion: 'Lamadrid 340',
    estadoInicial: 'NOTIF1_PENDIENTE',
  }),
  local({
    // Este es el caso de COMPLETAR_DATOS: venció la primera notificación pero
    // no tiene CUIT ni razón social, así que no se puede emitir la segunda.
    id: 10, nombreLocal: 'Bar Los Amigos', razonSocial: '', cuit: '',
    rubro: 'Gastronomía', direccion: 'Corrientes 1120',
    estadoInicial: 'NOTIF1_PENDIENTE',
  }),
  local({
    id: 11, idLegacy: 'L-1007', nombreLocal: 'Autoservicio Este', razonSocial: 'Este Alimentos S.R.L.',
    cuit: '30-77889900-3', rubro: 'Supermercado', direccion: 'Av. Roca 2200',
    estadoInicial: 'NOTIF1_PENDIENTE',
  }),
  local({
    id: 12, idLegacy: 'L-1122', nombreLocal: 'Frigorífico Tucumán', razonSocial: 'Frigorífico Tucumán S.A.',
    cuit: '30-99001122-4', rubro: 'Industria', direccion: 'Av. Sáenz Peña 3100',
    estadoInicial: 'NOTIF1_PENDIENTE',
  }),
  local({
    id: 13, idLegacy: 'L-1230', nombreLocal: 'Textil del Norte', razonSocial: 'Textil del Norte S.A.',
    cuit: '30-31122334-5', rubro: 'Industria', direccion: 'Chacabuco 1450',
    estadoInicial: 'NOTIF1_PENDIENTE',
  }),
  local({
    id: 14, idLegacy: 'L-1305', nombreLocal: 'Metalúrgica Suárez', razonSocial: 'Suárez Hermanos S.R.L.',
    cuit: '30-42233445-6', rubro: 'Industria', direccion: 'Bolívar 2050',
    estadoInicial: 'NOTIF1_PENDIENTE',
  }),
  local({
    id: 15, idLegacy: 'CON-0042', nombreLocal: 'Verdulería Don Pepe', razonSocial: 'José Pereyra',
    cuit: '20-14556677-8', rubro: 'Comercio mayorista', direccion: 'Mendoza 1875',
    estadoInicial: 'NOTIF1_PENDIENTE',
  }),
  local({
    id: 16, idLegacy: 'L-1418', nombreLocal: 'Café Central', razonSocial: 'Central Café S.R.L.',
    cuit: '30-53344556-7', rubro: 'Gastronomía', direccion: 'Congreso 210',
    estadoInicial: 'NOTIF1_PENDIENTE',
  }),
  local({
    id: 17, idLegacy: 'L-1520', nombreLocal: 'Rotisería La Plaza', razonSocial: 'La Plaza Comidas S.H.',
    cuit: '30-64455667-8', rubro: 'Gastronomía', direccion: 'Junín 830',
    estadoInicial: 'NOTIF1_PENDIENTE',
  }),
  local({
    // Duplicado de verdad: mismo CUIT que el id 1, cargado con otro nombre y
    // otra dirección. Es el caso que muestra Herramientas → Duplicados.
    id: 18, idLegacy: 'L-1602', nombreLocal: 'Super Norte', razonSocial: 'Distribuidora Norte SA',
    cuit: '30123456789', rubro: 'Supermercado', direccion: 'Avenida Alem 1230',
    estadoInicial: 'REVISION_DATOS',
  }),
  local({
    // Dirección sin altura: no se puede geocodificar. Aparece en
    // Herramientas → Geocodificación pendiente, SIN coordenada aproximada.
    id: 19, nombreLocal: 'Depósito zona sur', razonSocial: 'Logística del Sur S.A.',
    cuit: '30-75566778-9', rubro: 'Comercio mayorista', direccion: 'Camino del Perú s/n',
    estadoInicial: 'REVISION_DATOS',
  }),
  local({
    id: 21, idLegacy: 'L-1808', nombreLocal: 'Distribuidora Oeste', razonSocial: 'Oeste Mayorista S.R.L.',
    cuit: '30-27788990-1', rubro: 'Comercio mayorista', direccion: 'Marco Avellaneda 1560',
    estadoInicial: 'NOTIF1_PENDIENTE',
  }),
  local({
    id: 22, idLegacy: 'L-1902', nombreLocal: 'Sanatorio Norte', razonSocial: 'Sanatorio Norte S.A.',
    cuit: '30-38899001-2', rubro: 'Salud', direccion: 'Salta 740',
    estadoInicial: 'NOTIF1_PENDIENTE',
  }),
  local({
    // Bloqueo manual activo (sección 3.4): queda fuera del recálculo.
    id: 20, idLegacy: 'L-1710', nombreLocal: 'Mercado de Abasto', razonSocial: 'Cooperativa de Abasto Ltda.',
    cuit: '30-86677889-0', rubro: 'Comercio mayorista', direccion: 'Av. Alem 2400',
    estadoInicial: 'GENERAR_EXPEDIENTE', estadoCongelado: 'GENERAR_EXPEDIENTE',
    bloqueado: true, bloqueadoMotivo: 'Convenio en negociación con la Secretaría. No avanzar hasta resolución.',
    bloqueadoPor: 'Mariano Agustín', bloqueadoEn: momento(-9, '09:15'),
  }),
];

/* ============================================================================
   RELEVAMIENTOS
   ----------------------------------------------------------------------------
   Una fila por visita de campo. La coordenada de acá es la del DISPOSITIVO al
   momento de guardar: es una métrica del trabajo de campo, no la ubicación del
   local. Fijate que los valores no coinciden con los del padrón, y eso está
   bien.

   El id 105 llega con coordenada nula: se cargó sin permiso de GPS. El sistema
   viejo lo guardaba como "0,0", que después se confunde con una ubicación real.
   ============================================================================ */
export const RELEVAMIENTOS_INICIALES = [
  { id: 101, localId: 3, usuario: 'Jorge Medina', fechaHora: momento(-6, '11:20'), direccionRelevada: 'San Martín 456', latitud: -26.8241, longitud: -65.2043, nombreLocal: 'Farmacia Centro', rubro: 'Salud', clasificacion: 'GRAN_GENERADOR', revisadoPor: null, revisadoEn: null, offline: false },
  { id: 102, localId: 4, usuario: 'Jorge Medina', fechaHora: momento(-6, '11:48'), direccionRelevada: 'San Martín 980', latitud: -26.8255, longitud: -65.2011, nombreLocal: 'Kiosco San Martín', rubro: 'Servicios', clasificacion: 'GENERADOR_MENOR', revisadoPor: null, revisadoEn: null, offline: false },
  { id: 103, localId: 5, usuario: 'Jorge Medina', fechaHora: momento(-32, '09:05'), direccionRelevada: 'Muñecas 745', latitud: -26.8199, longitud: -65.2098, nombreLocal: 'Panadería La Espiga', rubro: 'Gastronomía', clasificacion: 'GENERADOR_MENOR', revisadoPor: 'Mariano Agustín', revisadoEn: momento(-30, '08:40'), resultadoRevision: 'EXENTO_CONFIRMADO', offline: false },
  { id: 104, localId: 18, usuario: 'Pedro Ruiz (baja)', fechaHora: momento(-3, '16:30'), direccionRelevada: 'Avenida Alem 1230', latitud: -26.8302, longitud: -65.1955, nombreLocal: 'Super Norte', rubro: 'Supermercado', clasificacion: 'GRAN_GENERADOR', revisadoPor: null, revisadoEn: null, offline: true },
  { id: 105, localId: 19, usuario: 'Jorge Medina', fechaHora: momento(-2, '12:10'), direccionRelevada: 'Camino del Perú s/n', latitud: null, longitud: null, nombreLocal: 'Depósito zona sur', rubro: 'Comercio mayorista', clasificacion: 'GRAN_GENERADOR', revisadoPor: null, revisadoEn: null, offline: true },
  { id: 106, localId: 1, usuario: 'Jorge Medina', fechaHora: momento(-380, '10:00'), direccionRelevada: 'Av. Alem 1230', latitud: -26.8301, longitud: -65.1954, nombreLocal: 'Supermercado Norte', rubro: 'Supermercado', clasificacion: 'GRAN_GENERADOR', revisadoPor: 'Mariano Agustín', revisadoEn: momento(-378, '09:00'), resultadoRevision: 'GRAN_GENERADOR', offline: false },
];

/* ============================================================================
   ACTUACIONES
   ----------------------------------------------------------------------------
   El historial. Cada bloque de abajo produce un estado distinto en pantalla,
   sin que ninguna pantalla lo escriba: lo deduce dominio/reglas.js.
   ============================================================================ */
const P = PARAMETROS_INICIALES;
const F = FERIADOS_INICIALES;

/* Atajo para armar una notificación ya entregada: calcula el vencimiento con
   la misma función que usa el sistema en producción, no a ojo. */
function notif({ id, localId, instancia, diasAtras, resultado, notificador, cedula, impresa = true }) {
  const fechaEntrega = resultado ? dia(diasAtras + 1) : null;
  const plazoDias = instancia === 1 ? P.plazoNotif1 : P.plazoNotif2;
  return {
    id,
    localId,
    tipo: 'NOTIFICACION',
    fecha: dia(diasAtras),
    usuario: 'Candelaria Peza',
    instancia,
    numeroCedula: cedula,
    notificadorId: notificador ?? null,
    fechaEntrega,
    plazoDias,
    fechaVencimiento:
      resultado && resultado !== 'NO_ENTREGADA'
        ? vencimientoHabil(fechaEntrega, plazoDias, F, P.contarDiaEntrega)
        : null,
    resultado: resultado ?? null,
    evidencia: resultado ? `foto_cedula_${cedula}.jpg` : null,
    impresaPor: impresa ? 'Candelaria Peza' : null,
    impresaEn: impresa ? momento(diasAtras, '08:15') : null,
    observaciones: '',
  };
}

function doc({ id, localId, tipo, numero, diasAtras, expediente, origen = 'PRESENTADO_TITULAR', validado = true, vencimiento }) {
  const fechaEmision = dia(diasAtras);
  return {
    id,
    localId,
    tipo,
    fecha: fechaEmision,
    usuario: 'Candelaria Peza',
    numero,
    fechaEmision,
    fechaVencimiento: tipo === 'CONTRATO' ? vencimiento : vencimientoAnual(fechaEmision, P.modoBisiesto),
    origen,
    // Sección 4.5: el número del expediente de trámite de la presentación. Es
    // DISTINTO del expediente de multa. El sistema viejo no lo guardaba.
    expedienteTramite: expediente,
    archivo: `${numero}.pdf`,
    validado,
    observaciones: '',
  };
}

export const ACTUACIONES_INICIALES = [
  /* --- id 1: DDJJ vigente -> DDJJ_VIGENTE ------------------------------- */
  doc({ id: 1, localId: 1, tipo: 'DDJJ', numero: 'DDJJ-00125', diasAtras: -120, expediente: 'EXP-2026-004512' }),

  /* --- id 2: contrato presentado por el titular -> CONTRATO_VIGENTE ----- */
  doc({ id: 2, localId: 2, tipo: 'CONTRATO', numero: 'CONT-0048', diasAtras: -200, expediente: 'EXP-2026-003980', vencimiento: dia(165) }),

  /* --- Hotel Plaza (6): cédula emitida, sin entregar -> NOTIF1_GENERADA -
     Con notificador ya asignado. El plazo NO corre: una cédula generada pero
     no entregada no hace correr ningún plazo (sección 4.1). */
  notif({ id: 3, localId: 6, instancia: 1, diasAtras: -2, resultado: null, notificador: 4, cedula: 'CED-001275' }),

  /* --- Shopping Aconquija (7): emitida, sin imprimir ni asignar ---------- */
  notif({ id: 4, localId: 7, instancia: 1, diasAtras: -1, resultado: null, notificador: null, cedula: 'CED-001278', impresa: false }),

  /* --- Clínica Belgrano (8): entregada hace 2 días, plazo CORRIENDO ----- */
  notif({ id: 5, localId: 8, instancia: 1, diasAtras: -4, resultado: 'ENTREGADA', notificador: 4, cedula: 'CED-001260' }),

  /* --- El Fogón (9): 1° vencida con datos completos -> NOTIF2_PENDIENTE - */
  notif({ id: 6, localId: 9, instancia: 1, diasAtras: -22, resultado: 'SIN_FIRMA', notificador: 5, cedula: 'CED-001201' }),

  /* --- Bar Los Amigos (10): 1° vencida SIN CUIT -> COMPLETAR_DATOS ------ */
  notif({ id: 7, localId: 10, instancia: 1, diasAtras: -25, resultado: 'FIJADA', notificador: 5, cedula: 'CED-001188' }),

  /* --- Autoservicio Este (11): no entregada -> el circuito se DETIENE --- */
  notif({ id: 8, localId: 11, instancia: 1, diasAtras: -18, resultado: 'NO_ENTREGADA', notificador: 4, cedula: 'CED-001210' }),

  /* --- Frigorífico (12): las dos agotadas -> GENERAR_EXPEDIENTE -------- */
  notif({ id: 9, localId: 12, instancia: 1, diasAtras: -40, resultado: 'ENTREGADA', notificador: 4, cedula: 'CED-001120' }),
  notif({ id: 10, localId: 12, instancia: 2, diasAtras: -25, resultado: 'ENTREGADA', notificador: 4, cedula: 'CED-001190' }),

  /* --- Textil del Norte (13): prórroga en curso -> PRORROGA_VIGENTE ----- */
  notif({ id: 11, localId: 13, instancia: 1, diasAtras: -60, resultado: 'ENTREGADA', notificador: 5, cedula: 'CED-001050' }),
  notif({ id: 12, localId: 13, instancia: 2, diasAtras: -40, resultado: 'ENTREGADA', notificador: 5, cedula: 'CED-001121' }),
  {
    id: 13, localId: 13, tipo: 'PRORROGA', fecha: dia(-10), usuario: 'Mariano Agustín',
    diasOtorgados: 20, fechaVencimiento: dia(10),
    motivo: 'El titular presentó nota solicitando plazo para firmar contrato con prestador.',
    observaciones: '',
  },

  /* --- Metalúrgica Suárez (14): expediente iniciado -> EXPEDIENTE -------- */
  notif({ id: 14, localId: 14, instancia: 1, diasAtras: -95, resultado: 'ENTREGADA', notificador: 4, cedula: 'CED-000980' }),
  notif({ id: 15, localId: 14, instancia: 2, diasAtras: -80, resultado: 'FIJADA', notificador: 4, cedula: 'CED-001002' }),
  {
    id: 16, localId: 14, tipo: 'EXPEDIENTE', fecha: dia(-70), usuario: 'Candelaria Peza',
    numeroExpediente: 'EXP-2026-000091',
    observaciones: 'Elevado a la Dirección de Faltas.',
  },

  /* --- Verdulería Don Pepe (15): contrato informado por la prestataria ---
     Origen INFORME_9DJ: su vigencia no se acredita con un documento cargado
     sino con el informe periódico de la empresa, y por eso tiene estado
     propio. Ante una impugnación el valor probatorio es distinto (sección 4.6). */
  doc({ id: 17, localId: 15, tipo: 'CONTRATO', numero: '9DJ-2026-0177', diasAtras: -45, expediente: null, origen: 'INFORME_9DJ', vencimiento: dia(140) }),

  /* --- Café Central (16): DDJJ de reciclaje vigente -> DDJJ_RECICLAJE --- */
  doc({ id: 18, localId: 16, tipo: 'DDJJ_RECICLAJE', numero: 'DDJJV-00031', diasAtras: -90, expediente: 'EXP-2026-004120' }),

  /* --- Rotisería La Plaza (17): DDJJ VENCIDA ---------------------------
     Tuvo documentación y ya no tiene nada vigente: el sistema lo reingresa
     solo a 1° Notificación pendiente (condición 11). Es lo que hace cíclico
     al circuito: nadie tocó nada, el local volvió por vencimiento. */
  doc({ id: 19, localId: 17, tipo: 'DDJJ', numero: 'DDJJ-00098', diasAtras: -400, expediente: 'EXP-2025-002233' }),

  /* --- Mercado de Abasto (20): bloqueado, con las dos notificaciones ---- */
  notif({ id: 20, localId: 20, instancia: 1, diasAtras: -50, resultado: 'ENTREGADA', notificador: 5, cedula: 'CED-001080' }),
  notif({ id: 21, localId: 20, instancia: 2, diasAtras: -30, resultado: 'ENTREGADA', notificador: 5, cedula: 'CED-001150' }),

  /* --- Distribuidora Oeste (21): 2° cédula emitida sin entregar --------
     -> NOTIF2_GENERADA. El plazo de la segunda no corre todavía. */
  notif({ id: 23, localId: 21, instancia: 1, diasAtras: -30, resultado: 'FIJADA', notificador: 5, cedula: 'CED-001165' }),
  notif({ id: 24, localId: 21, instancia: 2, diasAtras: -1, resultado: null, notificador: 4, cedula: 'CED-001280' }),

  /* --- Sanatorio Norte (22): 2° entregada, plazo de 3 días CORRIENDO ---
     -> NOTIF2_ENTREGADA. Es el local que está más cerca del expediente. */
  notif({ id: 25, localId: 22, instancia: 1, diasAtras: -35, resultado: 'ENTREGADA', notificador: 4, cedula: 'CED-001140' }),
  notif({ id: 26, localId: 22, instancia: 2, diasAtras: -3, resultado: 'ENTREGADA', notificador: 4, cedula: 'CED-001270' }),

  /* --- PRESENTACIÓN DEL PORTAL PENDIENTE DE VALIDAR --------------------
     validado: false. NO cuenta como documentación vigente y por lo tanto NO
     suspende el plazo del local 9: aparece en la bandeja de validación hasta
     que un agente la apruebe (sección 6.3). Si esto dejara de funcionar,
     cualquiera podría detener una intimación subiendo un archivo. */
  doc({ id: 27, localId: 9, tipo: 'DDJJ', numero: 'DDJJ-00140', diasAtras: -1, expediente: 'EXP-2026-005001', validado: false }),
];

/* Última fila del informe de la prestataria, para la pantalla de carga
   asistida (sección 9.3). Simula el archivo que remite la empresa. */
export const INFORME_9DJ_EJEMPLO = [
  { cuit: '30-44556677-8', razonSocial: 'Plaza Hoteles S.A.', direccion: '24 de Septiembre 512', numeroContrato: '9DJ-2026-0201', vencimiento: dia(150) },
  { cuit: '30-99001122-4', razonSocial: 'Frigorífico Tucumán S.A.', direccion: 'Av. Sáenz Peña 3100', numeroContrato: '9DJ-2026-0202', vencimiento: dia(150) },
  { cuit: '30-19283746-5', razonSocial: 'Panificadora El Trigal S.R.L.', direccion: 'Av. Perón 1450', numeroContrato: '9DJ-2026-0203', vencimiento: dia(150) },
  { cuit: '30-1122334-5', razonSocial: 'Centro Medico Belgrano', direccion: 'Belgrano 620', numeroContrato: '9DJ-2026-0204', vencimiento: dia(150) },
];

/* ============================================================================
   EL ESTADO INICIAL COMPLETO
   ============================================================================ */
export function crearSemilla() {
  return {
    version: 3,
    locales: LOCALES_INICIALES,
    relevamientos: RELEVAMIENTOS_INICIALES,
    actuaciones: ACTUACIONES_INICIALES,
    usuarios: USUARIOS_INICIALES,
    rubros: RUBROS_INICIALES,
    feriados: FERIADOS_INICIALES,
    parametros: PARAMETROS_INICIALES,
    secuencias: SECUENCIAS_INICIALES,
    plantillaCedula: PLANTILLA_INICIAL,
    // Historial de cambios de estado (sección 5.2). En el sistema viejo el
    // estado se sobrescribe sin dejar rastro; sin esto no hay métricas de
    // tiempo de ciclo y no hay defensa ante una impugnación.
    auditoria: [],
    // Registro de fusiones de duplicados, para poder rastrear una actuación
    // histórica hasta el registro donde se cargó (sección 9.4).
    fusiones: [],
  };
}
