/* ============================================================================
   backend/mapeo.js  —  EL PUENTE ENTRE LA BASE Y EL VOCABULARIO DEL FRONT
   ----------------------------------------------------------------------------
   La base smt_grandes_generadores y el dominio del front (src/dominio/) son el
   MISMO modelo dicho de dos maneras. Este archivo es la traducción, y es el
   único lugar del backend que conoce las dos.

     BASE                                    FRONT
     local.id_estado = 2                     'REVISION_DATOS'
     tramite tipo 3 + estado 13              actuación NOTIFICACION inst. 1,
                                             resultado 'ENTREGADA'
     tramite tipo 6 + estado 20              actuación PRORROGA vigente

   POR QUÉ EXISTE ESTE ARCHIVO Y NO SE CAMBIÓ NINGUNO DE LOS DOS LADOS:
   la base tiene 2.220 locales y 2.441 trámites cargados por el área, y el front
   tiene las reglas del pliego escritas y probadas. Cambiar cualquiera de los
   dos para que se parezca al otro significa tirar trabajo real. Traducir no.

   DECISIÓN DE DISEÑO: EL ESTADO SE LEE, NO SE RECALCULA.
   El diseño original del front calculaba el estado con resolverEstado() a
   partir del historial. Esta base lo guarda (local.id_estado, tramite.id_estado)
   y esos valores son el resultado del trabajo del área. Recalcularlos podría
   contradecir lo que un agente registró a mano, así que acá se leen. Lo que sí
   se conserva es el ORDEN DE PRIORIDAD del pliego (sección 4.3), que es la
   lógica de negocio: ver estadoDeLocal() al final del archivo.
   ============================================================================ */

import { hoyISO } from '../src/dominio/fechas.js';
import { faltantesParaCedula } from '../src/dominio/reglas.js';

/* ---------------------------------------------------------------------------
   1. LAS CLAVES DE LOS CATÁLOGOS
   ---------------------------------------------------------------------------
   Están escritas como constantes y no como números sueltos en las consultas:
   `ID_TTRAMITE.PRIMERA_NOTIFICACION` se entiende, `3` no. Si el área agrega
   una fila a un catálogo, se actualiza acá y en ningún otro lado.
   --------------------------------------------------------------------------- */

/* tabla `objeto`: a qué entidad se refiere un estado o un tipo de trámite. */
export const ID_OBJETO = {
  SIN_INFORMAR: 1,
  LOCAL: 2,
  RELEVAMIENTO: 3,
  NOTIFICACION: 4,
  DOCUMENTACION: 5,
  PRORROGA: 6,
  EXPEDIENTE: 7,
};

/* tabla `tipo_tramite`: qué clase de trámite es cada fila de `tramite`. */
export const ID_TTRAMITE = {
  SIN_INFORMAR: 1,
  RELEVAMIENTO: 2,
  PRIMERA_NOTIFICACION: 3,
  SEGUNDA_NOTIFICACION: 4,
  PRESENTACION_DOCUMENTACION: 5,
  PRORROGA: 6,
  EXPEDIENTE_MULTA: 7,
};

/* tabla `estado`: los 23 estados, agrupados por el objeto al que pertenecen. */
export const ID_ESTADO = {
  SIN_INFORMAR: 1,
  // objeto LOCAL
  REVISION_DATOS: 2,
  EXENTO_PENDIENTE: 3,
  RELEVADO_EXENTO: 4,
  COMPLETAR_DATOS: 5,
  LOCAL_INACTIVO: 6,
  // objeto RELEVAMIENTO
  GRAN_GENERADOR: 7,
  GENERADOR_MENOR: 8,
  RELEVAMIENTO_INACTIVO: 9,
  // objeto NOTIFICACION
  NOTIF_PENDIENTE: 10,
  NOTIF_GENERANDO: 11,
  NOTIF_GENERADA: 12,
  NOTIF_ENTREGADA: 13,
  NOTIF_SIN_FIRMA: 14,
  NOTIF_FIJADA: 15,
  NOTIF_NO_ENTREGADA: 16,
  // objeto DOCUMENTACION
  DOC_PENDIENTE_REVISION: 17,
  DOC_VIGENTE: 18,
  DOC_VENCIDA: 19,
  // objeto PRORROGA
  PRORROGA_VIGENTE: 20,
  PRORROGA_VENCIDA: 21,
  // objeto EXPEDIENTE (la secuencia completa esta en sql/10-expedientes.sql)
  EXPEDIENTE_PENDIENTE: 23,
  EXPEDIENTE_GENERADO: 24,
  EXPEDIENTE_SOLICITADO: 25,
  EXPEDIENTE_EN_TRAMITE: 26,
  EXPEDIENTE_CERRADO: 27,
};

/* tabla `tipo_documentacion`. */
export const ID_TDOC = {
  SIN_INFORMAR: 1,
  DDJJ: 2,
  CONTRATO: 3,
  DDJJ_RECICLAJE: 4,
};

/* tabla `tipo_usuario` -> los roles que usa el front (src/config/modulos.js).

   El 8 ('ADMINISTRADOR' en la base) antes se mapeaba a 'sistema', que es el
   actor técnico de los procesos automáticos y no puede hacer nada desde la
   aplicación: un administrador real de la base quedaba sin acceso. Ahora es
   'administrador', el perfil de control total que ya usa el front
   (src/auth/roles.js) y que middlewares/usuario.js deja pasar en todas las
   rutas. El 1 (SIN INFORMAR) sigue siendo 'sistema'. */
export const ROL_POR_TUSUARIO = {
  1: 'sistema',
  2: 'relevador',
  3: 'notificador',
  4: 'administrativo',
  5: 'coordinacion',
  6: 'direccion',
  7: 'titular',
  8: 'administrador',
};

export const TUSUARIO_POR_ROL = Object.fromEntries(
  Object.entries(ROL_POR_TUSUARIO).map(([id, rol]) => [rol, Number(id)]),
);

/* ---------------------------------------------------------------------------
   2. TRADUCCIÓN DE ESTADOS
   --------------------------------------------------------------------------- */

/* Estado del LOCAL (objeto 2) -> código del front. */
const ESTADO_LOCAL_A_CODIGO = {
  [ID_ESTADO.SIN_INFORMAR]: 'REVISION_DATOS',
  [ID_ESTADO.REVISION_DATOS]: 'REVISION_DATOS',
  [ID_ESTADO.EXENTO_PENDIENTE]: 'EXENTO_REVISION',
  [ID_ESTADO.RELEVADO_EXENTO]: 'EXENTO_CONFIRMADO',
  [ID_ESTADO.COMPLETAR_DATOS]: 'COMPLETAR_DATOS',
  // INACTIVO/CERRADO no existe en src/dominio/estados.js: es un estado que el
  // área usa y el front todavía no dibuja. Se expone con su propio código para
  // no disfrazarlo de otra cosa; la pantalla lo muestra con la etiqueta cruda.
  [ID_ESTADO.LOCAL_INACTIVO]: 'INACTIVO_CERRADO',
};

/* Estado de una NOTIFICACION (objeto 4) -> el sufijo del código del front.
   Se combina con la instancia: sufijo ENTREGADA + instancia 2 = NOTIF2_ENTREGADA. */
const SUFIJO_NOTIFICACION = {
  [ID_ESTADO.NOTIF_PENDIENTE]: 'PENDIENTE',
  [ID_ESTADO.NOTIF_GENERANDO]: 'GENERANDO',
  [ID_ESTADO.NOTIF_GENERADA]: 'GENERADA',
  [ID_ESTADO.NOTIF_ENTREGADA]: 'ENTREGADA',
  [ID_ESTADO.NOTIF_SIN_FIRMA]: 'SIN_FIRMA',
  [ID_ESTADO.NOTIF_FIJADA]: 'FIJADA',
  [ID_ESTADO.NOTIF_NO_ENTREGADA]: 'NO_ENTREGADA',
};

/* Estado de notificación -> `resultado` de entrega del front.
   Las tres primeras todavía no se entregaron, así que no tienen resultado:
   null es justamente lo que hace que el front las trate como "el plazo no
   empezó a correr". */
const RESULTADO_ENTREGA = {
  [ID_ESTADO.NOTIF_PENDIENTE]: null,
  [ID_ESTADO.NOTIF_GENERANDO]: null,
  [ID_ESTADO.NOTIF_GENERADA]: null,
  [ID_ESTADO.NOTIF_ENTREGADA]: 'ENTREGADA',
  [ID_ESTADO.NOTIF_SIN_FIRMA]: 'SIN_FIRMA',
  [ID_ESTADO.NOTIF_FIJADA]: 'FIJADA',
  [ID_ESTADO.NOTIF_NO_ENTREGADA]: 'NO_ENTREGADA',
};

/* El camino inverso: el front manda 'SIN_FIRMA', la base guarda 14. */
export const ESTADO_POR_RESULTADO = {
  ENTREGADA: ID_ESTADO.NOTIF_ENTREGADA,
  SIN_FIRMA: ID_ESTADO.NOTIF_SIN_FIRMA,
  FIJADA: ID_ESTADO.NOTIF_FIJADA,
  NO_ENTREGADA: ID_ESTADO.NOTIF_NO_ENTREGADA,
};

/* Clasificación que dejó el relevamiento de campo (objeto 3). */
const CLASIFICACION_RELEVAMIENTO = {
  [ID_ESTADO.GRAN_GENERADOR]: 'GRAN_GENERADOR',
  [ID_ESTADO.GENERADOR_MENOR]: 'GENERADOR_MENOR',
  [ID_ESTADO.RELEVAMIENTO_INACTIVO]: 'INACTIVO_CERRADO',
};

/* Tipo de documento (tabla tipo_documentacion) -> tipo de actuación del front. */
const TIPO_DOCUMENTO = {
  [ID_TDOC.DDJJ]: 'DDJJ',
  [ID_TDOC.CONTRATO]: 'CONTRATO',
  [ID_TDOC.DDJJ_RECICLAJE]: 'DDJJ_RECICLAJE',
};


/* ---------------------------------------------------------------------------
   3. AYUDANTES DE FECHA
   ---------------------------------------------------------------------------
   El pool usa dateStrings: true, así que un DATETIME llega como el texto
   '2026-03-15 09:30:00'. El dominio del front trabaja con 'AAAA-MM-DD' a secas
   (ver el encabezado de src/dominio/fechas.js), así que hay que recortar.
   --------------------------------------------------------------------------- */

/* '2026-03-15 09:30:00' -> '2026-03-15'. Null si no hay fecha. */
export function soloFecha(valor) {
  if (!valor) return null;
  return String(valor).slice(0, 10);
}

/* '2026-03-15 09:30:00' -> '2026-03-15T09:30:00'. Para los campos que el front
   muestra con hora (fechaHora de un relevamiento, momento de auditoría). */
export function fechaHora(valor) {
  if (!valor) return null;
  return String(valor).replace(' ', 'T');
}

/* La base guarda los booleanos como int(1). */
const aBool = (valor) => valor === 1 || valor === true;

/* ---------------------------------------------------------------------------
   4. TRADUCTORES DE FILA
   --------------------------------------------------------------------------- */

/* Fila de `local` -> el objeto que esperan las pantallas del front.
   `rubro` llega como texto (el JOIN con la tabla rubro lo trae en nombreRubro)
   porque el front compara y muestra el nombre, no el id. */
export function aLocalFront(fila) {
  return {
    id: fila.idLocal,
    idLegacy: fila.idOriginal ?? null,
    cuit: fila.cuit ?? '',
    razonSocial: fila.razonSocial ?? '',
    nombreLocal: fila.nombreLocal ?? '',
    rubro: fila.nombreRubro ?? '',
    rubroId: fila.idRubro ?? null,
    direccion: fila.direccionLocal ?? '',
    domicilioFiscal: fila.domicilioFiscal ?? '',
    email: fila.emailLocal ?? '',
    telefono: fila.telefonoLocal ?? '',
    // Columna opcional (sql/12): sin ella llega vacío y el formulario no deja escribirlo.
    titularCuil: fila.titularCuil ?? '',
    observaciones: fila.observacion ?? '',
    // Las coordenadas vienen como DECIMAL, que mysql2 entrega como string para
    // no perder precisión. El front las usa como número (mapa, cálculos).
    latitud: fila.latitudLocal === null || fila.latitudLocal === undefined ? null : Number(fila.latitudLocal),
    longitud: fila.longitudLocal === null || fila.longitudLocal === undefined ? null : Number(fila.longitudLocal),
    bloqueado: aBool(fila.bloqueado),
    bloqueadoMotivo: fila.bloqueadoMotivo ?? '',
    bloqueadoPor: fila.idUsuarioBloqueado ?? null,
    // El estado guardado del local. El estado que finalmente muestra el front
    // sale de estadoDeLocal(), que además mira los trámites.
    estadoInicial: ESTADO_LOCAL_A_CODIGO[fila.idEstado] ?? 'REVISION_DATOS',
    idEstado: fila.idEstado,
  };
}

/* Fila de `tramite` -> una ACTUACIÓN del front.
   Una sola tabla de la base se abre en los seis tipos de actuación que el
   front conoce, porque cada tipo usa campos distintos de las mismas columnas:
   `numero_referencia` es el número de cédula en una notificación y el número
   de expediente en un expediente de multa. */
export function aActuacionFront(fila, documentoPorTramite = new Map()) {
  const comun = {
    id: fila.idTramite,
    localId: fila.idLocal,
    /* La fecha del acto. Se devuelve como cadena vacía y NO como null cuando
       falta, porque el front la trata como texto ISO y la compara y recorta:
       un null ahí tumba la pantalla entera. En el padrón real hay actuaciones
       sin fecha (ocho presentaciones de documentación), así que no es un caso
       hipotético. Vacío significa "no se sabe cuándo", que es la verdad. */
    fecha: soloFecha(fila.fechaInicio) ?? '',
    ciclo: fila.nroCiclo,
    observaciones: fila.observaciones ?? '',
    usuario: fila.nombreUsuario ?? null,
    // El id de quien lo registró: lo usa la corrección en el día del
    // relevamiento (solo el autor puede corregir su carga).
    idUsuario: fila.idUsuario ?? null,
    idEstado: fila.idEstado,
    estadoNombre: fila.nombreEstado ?? null,
  };

  switch (fila.idTtramite) {
    case ID_TTRAMITE.PRIMERA_NOTIFICACION:
    case ID_TTRAMITE.SEGUNDA_NOTIFICACION:
      return {
        ...comun,
        tipo: 'NOTIFICACION',
        instancia: fila.idTtramite === ID_TTRAMITE.PRIMERA_NOTIFICACION ? 1 : 2,
        numeroCedula: fila.numeroReferencia ?? null,
        notificadorId: fila.idUsuarioAsignado ?? null,
        domicilioNotificacion: fila.domicilioNotificacion ?? '',
        plazoDias: fila.plazoDias ?? null,
        fechaEntrega: soloFecha(fila.fechaEntrega),
        fechaVencimiento: soloFecha(fila.fechaVencimiento),
        resultado: RESULTADO_ENTREGA[fila.idEstado] ?? null,
        evidencia: null,
        // La constancia de impresión (sección 9.6) usa las columnas
        // tramite.impresa_por e impresa_en de sql/04-columnas-opcionales.sql.
        // `SELECT t.*` las trae solas cuando existen; si no se corrió el
        // script, quedan en null y la pantalla no muestra "Sin imprimir".
        impresaPor: fila.impresaPor ?? null,
        impresaEn: fechaHora(fila.impresaEn),
      };

    case ID_TTRAMITE.PRESENTACION_DOCUMENTACION: {
      // Los datos del documento viven en la tabla `documentacion`, que cuelga
      // del trámite. Si el trámite no tiene fila de documentación todavía, se
      // devuelve como DDJJ sin número: es una presentación anunciada y no
      // detallada, que es como está la mayoría de los 670 registros actuales.
      const doc = documentoPorTramite.get(fila.idTramite) ?? null;
      const tipo = TIPO_DOCUMENTO[doc?.idTdocumentacion] ?? 'DDJJ';
      return {
        ...comun,
        tipo,
        numero: doc?.numero ?? fila.numeroReferencia ?? null,
        fechaEmision: soloFecha(doc?.fechaEmision ?? fila.fechaInicio),
        fechaVencimiento: soloFecha(doc?.fechaVencimiento ?? fila.fechaVencimiento),
        origen: doc?.origen ?? 'PRESENTADO_TITULAR',
        expedienteTramite: fila.numeroReferencia ?? null,
        archivo: null,
        // Sin validar hasta que un agente la apruebe: una carga del portal no
        // puede suspender un plazo por sí sola (sección 6.3).
        validado: fila.idEstado !== ID_ESTADO.DOC_PENDIENTE_REVISION,
      };
    }

    case ID_TTRAMITE.PRORROGA:
      return {
        ...comun,
        tipo: 'PRORROGA',
        diasOtorgados: fila.plazoDias ?? null,
        fechaVencimiento: soloFecha(fila.fechaVencimiento),
        motivo: fila.observaciones ?? '',
      };

    case ID_TTRAMITE.EXPEDIENTE_MULTA:
      return {
        ...comun,
        tipo: 'EXPEDIENTE',
        numeroExpediente: fila.numeroReferencia ?? null,
        // Con fecha de cierre, el expediente QUEDÓ ATRÁS: coordinación
        // reingresó el comercio al circuito y la intimación arrancó de nuevo.
        // La ficha lo dice con todas las letras para que expediente y
        // notificación nueva no parezcan un error del sistema.
        quedoAtras: Boolean(fila.fechaCierre),
      };

    case ID_TTRAMITE.RELEVAMIENTO:
      return {
        ...comun,
        tipo: 'RELEVAMIENTO',
        clasificacion: CLASIFICACION_RELEVAMIENTO[fila.idEstado] ?? null,
        direccionRelevada: fila.direccionRelevada ?? '',
        latitud: fila.latitudRelevamiento === null ? null : Number(fila.latitudRelevamiento),
        longitud: fila.longitudRelevamiento === null ? null : Number(fila.longitudRelevamiento),
        fechaHora: fechaHora(fila.fechaInicio),
        revisadoEn: fechaHora(fila.fechaCierre),
      };

    default:
      return { ...comun, tipo: 'SIN_INFORMAR' };
  }
}

/* ---------------------------------------------------------------------------
   5. EL ESTADO DEL LOCAL
   ---------------------------------------------------------------------------
   Resuelve el código de estado que muestra el front. Implementa la tabla de la
   sección 4.3 del pliego, con su orden EXACTO: la primera condición que se
   cumple determina el resultado.

     0   bloqueo manual activo .................... no se modifica
     -   exención confirmada ...................... terminal
     1   contrato vigente ......................... CONTRATO_VIGENTE / CONTRATO_9DJ
     2   DDJJ de reciclaje vigente ................ DDJJ_RECICLAJE
     3   DDJJ vigente ............................. DDJJ_VIGENTE
     4   prórroga vigente ......................... PRORROGA_VIGENTE
     5   cédula emitida y no entregada ............ NOTIFn_GENERADA
     6   última cédula consta como no entregada ... NOTIFn_NO_ENTREGADA
     7   venció la 1ra y faltan datos registrales . COMPLETAR_DATOS
     8   venció la 1ra con datos completos ........ NOTIF2_PENDIENTE
     9   venció la 2da ............................ GENERAR_EXPEDIENTE
     10  venció la prórroga ....................... GENERAR_EXPEDIENTE
     11  historial documental sin nada vigente .... NOTIF1_PENDIENTE

   >>> LOS VENCIMIENTOS SE APLICAN ACÁ, NO ESPERAN A UN PROCESO NOCTURNO <<<
   El pliego pide recalcular el estado "una vez por día para detectar los
   vencimientos" (4.3 y 9.1). Este sistema lo resuelve al leer: el estado se
   deriva comparando con la fecha de hoy cada vez que se consulta, así que un
   plazo que vence a la medianoche ya se ve vencido a la mañana siguiente sin
   depender de que ningún proceso haya corrido.

   Es más robusto que un proceso programado: si el proceso falla una noche, con
   aquel esquema el padrón entero queda desactualizado y nadie se entera.

   >>> QUÉ SE LEE DE LA BASE Y QUÉ SE DEDUCE <<<
   De la base se lee lo que registró una persona: el resultado de una entrega,
   si un documento se aprobó, en qué estado quedó el local tras el control de
   coordinación. Eso no se recalcula nunca, porque es el trabajo del área.

   Lo que se deduce es únicamente el paso del tiempo: que un plazo venció, que
   un documento caducó, que una prórroga se terminó. Eso no lo registra nadie a
   mano y es exactamente lo que el pliego pide que el sistema resuelva solo.

   `tramites` son las actuaciones YA TRADUCIDAS (aActuacionFront), ordenadas
   cronológicamente. `hoy` se recibe para poder probar con fechas fijas.
   --------------------------------------------------------------------------- */

/* Un documento está vigente si todavía NO llegó el día de su vencimiento. El
   día del vencimiento ya no está vigente (sección 4.2 del pliego y criterio de
   aceptación: "una DDJJ emitida el 15 de marzo vence el 15 de marzo del año
   siguiente: ese día el local ya no está vigente"). */
function estaVigente(fechaVencimiento, hoy) {
  return Boolean(fechaVencimiento) && hoy < fechaVencimiento;
}

/* >>> LOS CONTRATOS DEL INFORME 9 DE JULIO NO SE RIGEN POR FECHA <<<
   El informe de la prestataria es una FOTO de su padrón de contratos (sección
   9.3 del pliego): lo que el área sabe de esos locales es que FIGURAN en el
   último informe, no cuándo vence cada contrato (el archivo muchas veces ni lo
   trae; los 260 cargados de la base histórica vienen sin fecha).

   Por eso un documento con origen INFORME_9DJ está vigente mientras la última
   foto lo sostenga —su trámite sigue en VIGENTE— y deja de estarlo cuando un
   informe posterior lo retira y el módulo lo pasa a VENCIDA. Eso no es deducir:
   es leer lo que el módulo del informe registró. Para el resto de la
   documentación la vigencia sigue siendo la fecha, como siempre. */
function documentoVigente(d, hoy) {
  if (d.origen === 'INFORME_9DJ') return d.idEstado === ID_ESTADO.DOC_VIGENTE;
  return estaVigente(d.fechaVencimiento, hoy);
}

/* Un plazo está vencido a partir del día SIGUIENTE al vencimiento: el día del
   vencimiento el interesado todavía puede presentar. */
function plazoVencido(fechaVencimiento, hoy) {
  return Boolean(fechaVencimiento) && hoy > fechaVencimiento;
}

/* CUIT, razón social y rubro. Sin los tres, la cédula no individualiza al
   sujeto obligado y la notificación es impugnable (sección 4.3).

   Se exporta porque las rutas tienen que usar ESTA versión: en la base el
   rubro "vacío" no es una cadena vacía sino la fila SIN INFORMAR del
   catálogo (id 1). Desde el 26/10/2026 la de src/dominio/reglas.js también
   lo cuenta como faltante; antes lo daba por bueno. */
export function datosRegistralesCompletos(local) {
  return faltantesRegistrales(local).length === 0;
}

export function faltantesRegistrales(local) {
  const faltan = [];
  if (!local?.cuit?.trim()) faltan.push('CUIT');
  if (!local?.razonSocial?.trim()) faltan.push('razón social');
  if (!local?.rubro?.trim() || local.rubro.trim().toUpperCase() === 'SIN INFORMAR') faltan.push('rubro');
  return faltan;
}

/* Lo que le falta a un local para emitirle la cédula `instancia`: la primera
   solo pide nombre y dirección, la segunda todo (src/dominio/reglas.js). */
export function faltantesParaEmitir(local, instancia) {
  return faltantesParaCedula(local, instancia, faltantesRegistrales(local));
}

export function estadoDeLocal(local, tramites = [], hoy = hoyISO()) {
  // ---- 0. Bloqueo manual (sección 3.4): coordinación excluyó el local del
  //         cálculo automático. Se queda con el estado que tenía.
  //         `estadoCongelado` es el estado que se anotó en la auditoría al
  //         bloquearlo (lo agrega consultas.js). Sin auditoría no hay forma de
  //         saberlo, y vale el estado guardado en local.id_estado, como antes.
  if (local.bloqueado) return local.estadoCongelado ?? local.estadoInicial;

  // ---- Terminal: la exención confirmada es el único final del recorrido.
  if (local.estadoInicial === 'EXENTO_CONFIRMADO') return 'EXENTO_CONFIRMADO';
  if (local.estadoInicial === 'INACTIVO_CERRADO') return 'INACTIVO_CERRADO';

  // ---- 1 a 3. Documentación VIGENTE: prioridad absoluta. Un local que
  //      acreditó sale del circuito sancionatorio, esté donde esté.
  //      Se recorre al revés para quedarse con la más reciente de cada tipo.
  const documentos = tramites.filter((t) => ['DDJJ', 'DDJJ_RECICLAJE', 'CONTRATO'].includes(t.tipo));
  const vigente = (tipo) =>
    documentos.some(
      (d) =>
        d.tipo === tipo &&
        // Una presentación del portal sin aprobar NO cuenta: no puede suspender
        // un plazo por sí sola (sección 6.3).
        d.idEstado !== ID_ESTADO.DOC_PENDIENTE_REVISION &&
        documentoVigente(d, hoy),
    );

  if (vigente('CONTRATO')) {
    const contrato = [...documentos]
      .reverse()
      .find((d) => d.tipo === 'CONTRATO' && documentoVigente(d, hoy));
    return contrato?.origen === 'INFORME_9DJ' ? 'CONTRATO_9DJ' : 'CONTRATO_VIGENTE';
  }
  if (vigente('DDJJ_RECICLAJE')) return 'DDJJ_RECICLAJE';
  if (vigente('DDJJ')) return 'DDJJ_VIGENTE';

  // ---- 4 a 10. El último trámite del circuito sancionatorio.
  const circuito = tramites.filter((t) => ['NOTIFICACION', 'PRORROGA', 'EXPEDIENTE'].includes(t.tipo));
  const ultimo = circuito.length ? circuito[circuito.length - 1] : null;

  // ---- 11 (adelantada). Si el último acto del local fue presentar
  //      documentación y esa documentación ya venció (si estuviera vigente no
  //      llegaríamos acá), el local vuelve al inicio del circuito sin
  //      intervención humana: es la etapa 7 del pliego.
  //      Va ANTES del bloque de notificaciones a propósito: un local que
  //      presentó una DDJJ después de una segunda notificación y la dejó
  //      vencer arranca de nuevo en la PRIMERA, no en la segunda.
  //      Cuenta el último documento APROBADO. Una presentación del portal que
  //      todavía espera validación no existe para el circuito: si se la tomara
  //      como "último documento", taparía a una DDJJ aprobada que ya venció y
  //      el local saltearía esta regla (es lo que pasaba antes).
  const aprobados = documentos.filter((d) => d.idEstado !== ID_ESTADO.DOC_PENDIENTE_REVISION);
  const ultimoDoc = aprobados.length ? aprobados[aprobados.length - 1] : null;
  if (ultimoDoc) {
    const posterior = !ultimo || (ultimoDoc.fecha ?? '') > (ultimo.fecha ?? '') ||
      ((ultimoDoc.fecha ?? '') === (ultimo.fecha ?? '') && ultimoDoc.id > ultimo.id);
    // Solo reingresa si el documento TENÍA una vigencia que ya se cumplió. Los
    // 670 registros históricos sin fecha no disparan nada. El contrato del
    // informe 9DJ reingresa por su propio motivo: fue retirado de la foto
    // (VENCIDA sin fecha, lo marca el módulo del informe), no venció solo.
    const perdido =
      ultimoDoc.origen === 'INFORME_9DJ'
        ? ultimoDoc.idEstado === ID_ESTADO.DOC_VENCIDA
        : Boolean(ultimoDoc.fechaVencimiento);
    if (posterior && perdido) return 'NOTIF1_PENDIENTE';
  }

  if (ultimo?.tipo === 'PRORROGA') {
    // ---- 4 y 10. Vigente suspende el expediente; vencida lo habilita.
    return estaVigente(ultimo.fechaVencimiento, hoy) ? 'PRORROGA_VIGENTE' : 'GENERAR_EXPEDIENTE';
  }

  if (ultimo?.tipo === 'EXPEDIENTE') {
    // No es terminal: coordinación puede reingresar el local (etapa 6).
    //
    // SOLICITADO se distingue a propósito de GENERAR_EXPEDIENTE: el primero lo
    // decidió una persona (pidió el número a la otra dependencia) y el segundo
    // lo decide el sistema al recalcular. Si se unificaran, nunca se sabría
    // cuántos expedientes están habilitados y nadie pidió todavía.
    if (ultimo.idEstado === ID_ESTADO.EXPEDIENTE_SOLICITADO) return 'EXPEDIENTE_SOLICITADO';
    // Generado, en trámite o cerrado: el local tiene su expediente. El detalle
    // del recorrido vive en la bitácora, no en el estado del local.
    if ([ID_ESTADO.EXPEDIENTE_GENERADO, ID_ESTADO.EXPEDIENTE_EN_TRAMITE, ID_ESTADO.EXPEDIENTE_CERRADO].includes(ultimo.idEstado)) {
      return 'EXPEDIENTE';
    }
    return 'GENERAR_EXPEDIENTE';
  }

  if (ultimo?.tipo === 'NOTIFICACION') {
    /* >>> PRESENTÓ EN TÉRMINO Y LA OFICINA TODAVÍA NO RESOLVIÓ <<<
       Los días del plazo son para que el local presente la documentación. Si
       presentó DENTRO del plazo y la presentación espera validación, el
       circuito no avanza por la demora de la oficina: el local se muestra "en
       revisión" y el vencimiento no se ejecuta. No es que la presentación
       acredite por sí sola (sección 6.3: eso recién pasa al aprobarse): solo
       congela el avance sancionatorio hasta que una persona resuelva. Si la
       oficina rechaza, el documento se da de baja y el estado vuelve a
       calcularse solo, con el plazo vencido si venció. Presentar FUERA de
       término no congela nada. */
    const presentoEnTermino = documentos.some(
      (d) =>
        d.idEstado === ID_ESTADO.DOC_PENDIENTE_REVISION &&
        (d.fecha ?? '') >= (ultimo.fecha ?? '') &&
        (!ultimo.fechaVencimiento || (d.fecha ?? '') <= ultimo.fechaVencimiento),
    );
    if (presentoEnTermino) return 'PRESENTACION_EN_REVISION';

    const n = ultimo.instancia;
    const sufijo = SUFIJO_NOTIFICACION[ultimo.idEstado];

    // ---- 5. Emitida y todavía no entregada. El plazo NO corre: protege el
    //      acto que la oficina inició pero que no produjo efecto jurídico.
    if (['PENDIENTE', 'GENERANDO', 'GENERADA'].includes(sufijo)) return `NOTIF${n}_${sufijo}`;

    // ---- 6. Consta como no entregada: el circuito se detiene. Sin
    //      notificación fehaciente no hay avance (debido proceso).
    if (sufijo === 'NO_ENTREGADA') return `NOTIF${n}_NO_ENTREGADA`;

    // Estado de notificación que este sistema no conoce (en el padrón hay
    // trámites con estado SIN INFORMAR). Si tampoco tiene fecha de entrega, no
    // consta ninguna entrega efectiva: se trata como emitida y no entregada,
    // que es lo que protege al contribuyente (condición 5). Antes caía al
    // bloque de abajo y podía avanzar, o mostrar el código "NOTIF1_undefined".
    if (!sufijo && !ultimo.fechaEntrega) return `NOTIF${n}_GENERADA`;

    // Entregada de alguna de las tres formas que hacen correr el plazo.
    // Mientras el plazo no venció, se muestra el resultado de la entrega.
    if (!plazoVencido(ultimo.fechaVencimiento, hoy)) return `NOTIF${n}_${sufijo ?? 'ENTREGADA'}`;

    // ---- 7 a 9. El plazo venció sin presentación.
    if (n === 1) {
      return datosRegistralesCompletos(local) ? 'NOTIF2_PENDIENTE' : 'COMPLETAR_DATOS';
    }
    return 'GENERAR_EXPEDIENTE';
  }

  // ---- Nada del circuito todavía: vale el punto de partida del control.
  return local.estadoInicial;
}

/* ---------------------------------------------------------------------------
   6. EL NÚMERO DE CÉDULA
   ---------------------------------------------------------------------------
   Las cédulas de esta base se numeran '0001-675': una SERIE de cuatro dígitos
   y un correlativo. NO usan el formato 'CED-001275' de src/dominio/actuaciones.js,
   que era el que se había inventado para la maqueta.

   Manda el formato de la base: hay 340 notificaciones ya emitidas con ese
   número, impresas y entregadas en papel a un contribuyente. El número que
   figura en la cédula que alguien tiene en la mano es el que vale.

   Si el área abre una serie nueva (por ejemplo al cambiar de talonario), se
   cambia SERIE_CEDULA y los números nuevos salen con la serie nueva sin tocar
   los viejos.
   --------------------------------------------------------------------------- */
export const SERIE_CEDULA = '0001';

/* 696 -> '0001-696' */
export function numeroDeCedula(correlativo, serie = SERIE_CEDULA) {
  return `${serie}-${correlativo}`;
}

/* El id_estado que hay que guardar en `tramite` cuando se crea una notificación
   nueva, según en qué punto esté. Lo usa rutas/notificaciones.js. */
export const ESTADO_INICIAL_TRAMITE = {
  [ID_TTRAMITE.PRIMERA_NOTIFICACION]: ID_ESTADO.NOTIF_GENERADA,
  [ID_TTRAMITE.SEGUNDA_NOTIFICACION]: ID_ESTADO.NOTIF_GENERADA,
  [ID_TTRAMITE.PRESENTACION_DOCUMENTACION]: ID_ESTADO.DOC_PENDIENTE_REVISION,
  [ID_TTRAMITE.PRORROGA]: ID_ESTADO.PRORROGA_VIGENTE,
  [ID_TTRAMITE.EXPEDIENTE_MULTA]: ID_ESTADO.EXPEDIENTE_GENERADO,
  [ID_TTRAMITE.RELEVAMIENTO]: ID_ESTADO.GRAN_GENERADOR,
};
