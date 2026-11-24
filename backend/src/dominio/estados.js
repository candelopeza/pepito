/* ============================================================================
   dominio/estados.js  —  LA MÁQUINA DE ESTADOS DEL LOCAL
   ----------------------------------------------------------------------------
   Capítulo 3 del pliego. El estado del local es el eje del sistema: define qué
   acciones se habilitan y en qué bandeja aparece.

   REGLA DE ORO: la lógica compara SIEMPRE contra el `codigo`, nunca contra la
   etiqueta. La etiqueta es texto de pantalla y el área la puede cambiar.

   GRUPOS (para armar bandejas y filtros):
     cola_admin | terminal | cola_emision | transitorio | en_tramite
     entrega    | bloqueo  | sancionatorio | documental
   ============================================================================ */

export const ESTADOS = {
  REVISION_DATOS:      { etiqueta: 'Revisión de datos pendiente',        grupo: 'cola_admin',    color: 'amarillo' },
  EXENTO_REVISION:     { etiqueta: 'Exento - pendiente de control',      grupo: 'cola_admin',    color: 'azul' },
  EXENTO_CONFIRMADO:   { etiqueta: 'Relevado - Exento',                  grupo: 'terminal',      color: 'verde' },
  // Lo usa el área (local.id_estado "inactivo") y llega así del backend
  // (mapeo.js). Antes no estaba acá y la pantalla mostraba el código crudo.
  INACTIVO_CERRADO:    { etiqueta: 'Inactivo / cerrado',                 grupo: 'terminal',      color: 'gris' },

  NOTIF1_PENDIENTE:    { etiqueta: '1° Notificación pendiente',          grupo: 'cola_emision',  color: 'naranja' },
  NOTIF1_GENERANDO:    { etiqueta: 'Generar notificación 1',             grupo: 'transitorio',   color: 'gris' },
  NOTIF1_GENERADA:     { etiqueta: 'Primera notificación generada',      grupo: 'en_tramite',    color: 'azul' },
  NOTIF1_ENTREGADA:    { etiqueta: '1° Notificación entregada',          grupo: 'entrega',       color: 'verde' },
  NOTIF1_SIN_FIRMA:    { etiqueta: '1° Notificación entregada sin firma', grupo: 'entrega',      color: 'verde' },
  NOTIF1_FIJADA:       { etiqueta: '1° Notificación fijada',             grupo: 'entrega',       color: 'verde' },
  NOTIF1_NO_ENTREGADA: { etiqueta: '1° Notificación no entregada',       grupo: 'entrega',       color: 'rojo' },

  COMPLETAR_DATOS:     { etiqueta: 'Completar datos',                    grupo: 'bloqueo',       color: 'rojo' },

  NOTIF2_PENDIENTE:    { etiqueta: '2° Notificación pendiente',          grupo: 'cola_emision',  color: 'naranja' },
  NOTIF2_GENERANDO:    { etiqueta: 'Generar notificación 2',             grupo: 'transitorio',   color: 'gris' },
  NOTIF2_GENERADA:     { etiqueta: 'Segunda notificación generada',      grupo: 'en_tramite',    color: 'azul' },
  NOTIF2_ENTREGADA:    { etiqueta: '2° Notificación entregada',          grupo: 'entrega',       color: 'verde' },
  NOTIF2_SIN_FIRMA:    { etiqueta: '2° Notificación entregada sin firma', grupo: 'entrega',      color: 'verde' },
  NOTIF2_FIJADA:       { etiqueta: '2° Notificación fijada',             grupo: 'entrega',       color: 'verde' },
  NOTIF2_NO_ENTREGADA: { etiqueta: '2° Notificación no entregada',       grupo: 'entrega',       color: 'rojo' },

  PRORROGA_VIGENTE:    { etiqueta: 'Prórroga vigente',                   grupo: 'en_tramite',    color: 'amarillo' },
  PRESENTACION_EN_REVISION: { etiqueta: 'Presentación en revisión',       grupo: 'cola_admin',    color: 'amarillo' },
  GENERAR_EXPEDIENTE:  { etiqueta: 'Generar expediente',                 grupo: 'cola_admin',    color: 'naranja' },
  EXPEDIENTE_SOLICITADO: { etiqueta: 'N° de expediente solicitado',      grupo: 'sancionatorio', color: 'naranja' },
  EXPEDIENTE:          { etiqueta: 'Expediente',                         grupo: 'sancionatorio', color: 'rojo' },

  CONTRATO_VIGENTE:    { etiqueta: 'Contrato vigente',                   grupo: 'documental',    color: 'verde' },
  CONTRATO_9DJ:        { etiqueta: 'Contrato vigente - 9 de Julio',      grupo: 'documental',    color: 'verde' },
  DDJJ_VIGENTE:        { etiqueta: 'Declaración Jurada',                 grupo: 'documental',    color: 'verde' },
  DDJJ_RECICLAJE:      { etiqueta: 'DDJJ Reciclaje',                     grupo: 'documental',    color: 'verde' },
};

/* Cada estado se expone también con su propio código adentro, así una fila de
   grilla o un badge puede llevar el objeto completo sin perder la clave. */
export const LISTA_ESTADOS = Object.entries(ESTADOS).map(([codigo, e]) => ({ codigo, ...e }));

export const CODIGOS_ESTADO = LISTA_ESTADOS.map((e) => e.codigo);

/* Etiquetas para los desplegables y filtros de las grillas. */
export const ETIQUETAS_ESTADO = LISTA_ESTADOS.map((e) => e.etiqueta);

/* ---------------------------------------------------------------------------
   LAS ETIQUETAS LAS PUEDE CAMBIAR EL ÁREA (sección 3.1)
   ---------------------------------------------------------------------------
   Configuración → Parámetros → "Nombres de los estados" guarda un objeto
   { CODIGO: 'Texto nuevo' } en la tabla `parametro` (clave etiquetasEstado).
   El store lo aplica al cargar con aplicarEtiquetas(), y desde ahí todas las
   pantallas muestran el texto nuevo. El código no cambia nunca: las reglas
   siguen comparando contra él. Sin nada guardado valen las de arriba. */
const ETIQUETA_ORIGINAL = Object.fromEntries(Object.entries(ESTADOS).map(([codigo, e]) => [codigo, e.etiqueta]));

export function etiquetaOriginal(codigo) {
  return ETIQUETA_ORIGINAL[codigo] ?? codigo;
}

export function aplicarEtiquetas(mapa = {}) {
  LISTA_ESTADOS.forEach((e, i) => {
    const texto = typeof mapa?.[e.codigo] === 'string' && mapa[e.codigo].trim() ? mapa[e.codigo].trim() : ETIQUETA_ORIGINAL[e.codigo];
    ESTADOS[e.codigo].etiqueta = texto;
    e.etiqueta = texto;
    ETIQUETAS_ESTADO[i] = texto;
  });
}

export function estado(codigo) {
  return ESTADOS[codigo] ?? { etiqueta: codigo ?? '—', grupo: 'desconocido', color: 'gris' };
}

export function etiquetaEstado(codigo) {
  return estado(codigo).etiqueta;
}

export function colorEstado(codigo) {
  return estado(codigo).color;
}

export function grupoEstado(codigo) {
  return estado(codigo).grupo;
}

/* Un local documental salió del circuito sancionatorio: acreditó algo vigente. */
export function esDocumental(codigo) {
  return grupoEstado(codigo) === 'documental';
}

export function esTerminal(codigo) {
  return codigo === 'EXENTO_CONFIRMADO';
}
