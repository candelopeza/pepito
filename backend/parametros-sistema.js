/* ============================================================================
   backend/parametros-sistema.js  —  LOS PLAZOS Y REGLAS CONFIGURABLES
   ----------------------------------------------------------------------------
   Sección 4.1 del pliego. Lo que está acá son los VALORES POR DEFECTO. El
   área los cambia sin programador desde Configuración → Parámetros: lo que
   guarda va a la tabla `parametro` (sql/06, una fila por clave) y
   parametros() en consultas.js lo lee encima de estos defaults. Si una clave
   no tiene fila en la tabla, vale lo de acá.

   >>> QUÉ SIGNIFICA ESO EN LA PRÁCTICA <<<
   Para cambiar un plazo NO hay que tocar este archivo ni reiniciar nada: se
   hace desde la pantalla. Este archivo se toca solo para AGREGAR un parámetro
   nuevo (acá el default, en rutas/configuracion.js su validación y en
   pages/config/Parametros.jsx el campo).

   (Hasta octubre de 2026 la tabla no existía y estos valores eran fijos; por
   eso algún comentario viejo puede decir que la pantalla "no guarda".)

   LOS DOS QUE ESTÁN PENDIENTES DEL ÁREA LEGAL (Anexo B.2 del pliego):
     contarDiaEntrega  si el día de la entrega es el día uno del plazo
     modoBisiesto      una DDJJ emitida un 29 de febrero, ¿vence el 28/02 o el 01/03?
   Están como parámetro justamente porque la respuesta todavía no existe. Cuando
   el área legal se expida, se cambia el valor acá y no hay que tocar ninguna
   regla de cálculo.
   ============================================================================ */

export const PARAMETROS = {
  /* Días HÁBILES de plazo para presentar, contados desde la entrega efectiva
     de la cédula. Son distintos por instancia. */
  plazoNotif1: 5,
  plazoNotif2: 3,

  /* false = el plazo arranca el día siguiente a la entrega. */
  contarDiaEntrega: false,

  /* '01-mar' | '28-feb'. Ver el encabezado. */
  modoBisiesto: '01-mar',

  /* Exigir CUIT y razón social también para iniciar el expediente de multa,
     no solo para emitir la cédula. */
  exigirDatosSiempre: true,

  /* Emisión de cédulas sin intervención humana. Apagado: hoy cada cédula la
     emite una persona. Prendido, el sistema emite la cola todos los días
     hábiles a las 7 (backend/tareas-programadas.js). */
  emisionAutomatica: false,

  /* Respaldo de la emisión manual (sección 9.6): si a las 12 la cola sigue sin
     emitir, la emite el sistema y queda anotado como suyo en el historial.
     Solo cuenta con emisionAutomatica en false. Apagado hasta que la Dirección
     lo decida: emitir es un acto administrativo. */
  emisionRespaldo: false,

  /* Tope de días que puede otorgar una prórroga, y cuántas prórrogas admite un
     local por vuelta del circuito (nro_ciclo). */
  topeProrrogaDias: 30,
  maxProrrogasPorLocal: 1,

  /* A quién se le pide el número del expediente de multa. Es un parámetro y no
     un valor del código porque TODAVÍA NO SE SABE a quién se le pide
     (TODO-DEFINICION: lo confirma la Dirección) y porque puede cambiar. La
     Dirección lo edita desde Configuración → Parámetros sin tocar código. */
  correoSolicitudExpedientes: '',

  /* Hasta qué hora del día puede el relevador corregir SUS cargas de la
     jornada. Pasada esa hora (y siempre que sea otro día), la corrección la
     hace la oficina desde el padrón. 14 = hasta las 14:00. */
  horaLimiteCorreccionRelevador: 14,

  /* ¿El portal del titular muestra los NÚMEROS de expediente (el de multa y el
     del trámite de cada presentación)? PENDIENTE: decisión de la Dirección.
     A favor de mostrarlos: el titular tiene derecho a saber qué expediente se
     le inició, y lo va a necesitar para un trámite. En contra: es información
     del circuito sancionatorio y puede preferirse darla en ventanilla. Por
     defecto NO se muestran: el titular ve el estado y desde cuándo. */
  portalMuestraNumerosExpediente: false,
};

/* El texto de la cédula. Los {marcadores} los reemplaza el front al imprimir
   (ver la pantalla de Notificaciones).

   Vive acá por el mismo motivo que los plazos. Es el candidato más fuerte a
   mudarse a la base el día que el área quiera redactarla por su cuenta: es
   texto, cambia más seguido que un plazo y no requiere entender nada técnico. */
export const PLANTILLA_CEDULA = `MUNICIPALIDAD DE SAN MIGUEL DE TUCUMÁN
Secretaría de Ambiente y Sustentabilidad — Dirección de Ambiente

CÉDULA DE NOTIFICACIÓN N° {numeroCedula}
{instanciaTexto}

Establecimiento: {nombreLocal}
Razón social: {razonSocial}
CUIT: {cuit}
Domicilio: {direccion}

Se intima al titular a presentar la documentación que acredite el cumplimiento
del servicio de recolección de residuos, dentro del plazo de {plazoDias} días
hábiles contados a partir de la notificación.`;
