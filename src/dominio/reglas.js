/* ============================================================================
   dominio/reglas.js  —  *** EL NÚCLEO FUNCIONAL DEL SISTEMA ***
   ----------------------------------------------------------------------------
   Capítulo 4 del pliego. Cada regla de acá sostiene un acto administrativo con
   efectos sobre un contribuyente: un error no produce un dato mal, produce una
   intimación inválida. Antes de tocar algo, leé el capítulo.

   EL ESTADO ES UN VALOR CALCULADO, NO UN CAMPO QUE SE ESCRIBE.
   Se deduce del historial de actuaciones cada vez que se necesita. Eso hace
   imposible el bug más común del sistema viejo: un estado guardado que ya no
   se corresponde con las actuaciones del local.

   Lo único que se guarda a mano en el local es `estadoInicial`: el punto de
   partida que dejó el control de coordinación (revisión, exento, o habilitado
   para notificar). Desde ahí, todo lo demás lo mandan las actuaciones.

   ORDEN DE EVALUACIÓN (sección 4.3). Es ESTRICTO y la primera condición que se
   cumple determina el resultado:

     0  bloqueo manual activo ........... no se modifica
     -  exención confirmada ............. terminal, no se modifica
     1  contrato vigente ................ CONTRATO_VIGENTE / CONTRATO_9DJ
     2  DDJJ de reciclaje vigente ....... DDJJ_RECICLAJE
     3  DDJJ vigente .................... DDJJ_VIGENTE
     4-10  última actuación del circuito (prórroga / expediente / cédula)
     11 historial documental sin nada vigente .... NOTIF1_PENDIENTE
     -  si no aplica nada ............... queda el estado inicial
   ============================================================================ */

import { hoyISO, plazoVencido } from './fechas.js';
import { estaVigente } from './vigencias.js';
import { correPlazo, deLocal } from './actuaciones.js';
import { CODIGOS_ESTADO } from './estados.js';
import { LISTA_ESTADOS } from './estados.js';

/* ============================================================================
   DATOS REGISTRALES  (sección 4.3, "Datos registrales y debido proceso")
   ----------------------------------------------------------------------------
   La cédula tiene que individualizar correctamente al sujeto obligado. Sin
   CUIT, razón social y rubro, la notificación es impugnable.
   ============================================================================ */
export function datosRegistralesCompletos(local) {
  return Boolean(local?.cuit?.trim() && local?.razonSocial?.trim() && local?.rubro?.trim());
}

export function faltantesRegistrales(local) {
  const faltan = [];
  if (!local?.cuit?.trim()) faltan.push('CUIT');
  if (!local?.razonSocial?.trim()) faltan.push('razón social');
  if (!local?.rubro?.trim()) faltan.push('rubro');
  return faltan;
}

/* ============================================================================
   DOCUMENTACIÓN VIGENTE
   ----------------------------------------------------------------------------
   OJO CON `validado`: una presentación que entró por el portal del titular y
   todavía no aprobó un agente NO cuenta como vigente. Sección 6.3: "el sistema
   no debe permitir que una carga externa suspenda un plazo de forma
   automática". Si esto se rompe, cualquiera detiene una intimación subiendo un
   archivo.
   ============================================================================ */
function documentoCuenta(a, refISO) {
  return a.validado !== false && estaVigente(a.fechaVencimiento, refISO);
}

export function documentacionVigente(actuaciones, localId, refISO = hoyISO()) {
  const docs = deLocal(actuaciones, localId);
  return {
    contrato: docs.filter((a) => a.tipo === 'CONTRATO' && documentoCuenta(a, refISO)).pop() ?? null,
    reciclaje: docs.filter((a) => a.tipo === 'DDJJ_RECICLAJE' && documentoCuenta(a, refISO)).pop() ?? null,
    ddjj: docs.filter((a) => a.tipo === 'DDJJ' && documentoCuenta(a, refISO)).pop() ?? null,
  };
}

/* ============================================================================
   RESOLVER EL ESTADO
   ============================================================================ */
export function resolverEstado(local, actuaciones, ctx = {}) {
  const refISO = ctx.hoy ?? hoyISO();
  const inicial = local.estadoInicial ?? 'REVISION_DATOS';

  // ---- 0. Bloqueo manual (sección 3.4): coordinación excluyó el local del
  //         cálculo automático. Se congela el estado que tenía.
  if (local.bloqueado) return local.estadoCongelado ?? inicial;

  // ---- Terminal: la exención confirmada es el único final del circuito.
  if (inicial === 'EXENTO_CONFIRMADO') return 'EXENTO_CONFIRMADO';

  const propias = deLocal(actuaciones, local.id);

  // ---- 1 a 3. Documentación vigente: prioridad absoluta. Un local que
  //      acredita sale del circuito sancionatorio, esté donde esté.
  const vig = documentacionVigente(actuaciones, local.id, refISO);
  if (vig.contrato) return vig.contrato.origen === 'INFORME_9DJ' ? 'CONTRATO_9DJ' : 'CONTRATO_VIGENTE';
  if (vig.reciclaje) return 'DDJJ_RECICLAJE';
  if (vig.ddjj) return 'DDJJ_VIGENTE';

  // ---- 4 a 10. La última actuación del circuito sancionatorio manda.
  const circuito = propias.filter((a) => ['NOTIFICACION', 'PRORROGA', 'EXPEDIENTE', 'REINGRESO'].includes(a.tipo));
  const ult = circuito.length ? circuito[circuito.length - 1] : null;

  // ---- 11 (adelantada). Vencimiento documental y reentrada, etapa 7.
  //      Si el último acto del local fue presentar documentación y esa
  //      documentación ya venció (si estuviera vigente no llegaríamos acá),
  //      el local vuelve al inicio del circuito sin intervención humana.
  //      Va ANTES del bloque de notificaciones a propósito: un local que
  //      presentó una DDJJ después de una segunda notificación y la dejó
  //      vencer arranca de nuevo en la PRIMERA, no en la segunda.
  const documentos = propias.filter(
    (a) => ['DDJJ', 'DDJJ_RECICLAJE', 'CONTRATO'].includes(a.tipo) && a.validado !== false,
  );
  const ultDoc = documentos.length ? documentos[documentos.length - 1] : null;
  if (ultDoc && (!ult || ultDoc.fecha > ult.fecha || (ultDoc.fecha === ult.fecha && ultDoc.id > ult.id))) {
    return 'NOTIF1_PENDIENTE';
  }

  // Coordinación reingresó el local al circuito desde un expediente: la
  // intimación arranca de cero (etapa 6, "el expediente no es terminal").
  if (ult?.tipo === 'REINGRESO') return 'NOTIF1_PENDIENTE';

  if (ult?.tipo === 'PRORROGA') {
    // Mientras corre suspende el expediente; al vencer sin presentación, pasa.
    return estaVigente(ult.fechaVencimiento, refISO) ? 'PRORROGA_VIGENTE' : 'GENERAR_EXPEDIENTE';
  }

  if (ult?.tipo === 'EXPEDIENTE') {
    // No es terminal: coordinación puede reingresar el local al circuito, y
    // eso genera una notificación posterior que pasa a ser la última.
    // "Solicitado" se distingue: lo decidió una persona (pidió el número a la
    // dependencia), mientras que "generar expediente" lo decide el sistema.
    if (ult.idEstado === 25) return 'EXPEDIENTE_SOLICITADO';
    return 'EXPEDIENTE';
  }

  if (ult?.tipo === 'NOTIFICACION') {
    // >>> PRESENTÓ EN TÉRMINO Y LA OFICINA TODAVÍA NO RESOLVIÓ <<<
    // El plazo era para presentar: si el titular presentó dentro del plazo,
    // el circuito no puede avanzar por la demora de la oficina en validar.
    // Si la oficina rechaza, la presentación se da de baja y el estado vuelve
    // a calcularse solo (con el plazo vencido, si venció).
    const docs = propias.filter((a) => ['DDJJ', 'DDJJ_RECICLAJE', 'CONTRATO'].includes(a.tipo));
    const enTermino = docs.some(
      (d) =>
        d.validado === false &&
        (d.fecha ?? '') >= (ult.fecha ?? '') &&
        (!ult.fechaVencimiento || (d.fecha ?? '') <= ult.fechaVencimiento),
    );
    if (enTermino) return 'PRESENTACION_EN_REVISION';

    const n = ult.instancia;

    // Condición 5: cédula emitida y todavía no entregada. El plazo NO corre.
    // Protege el acto que la oficina ya inició pero que no produjo efecto.
    if (!ult.resultado) return `NOTIF${n}_GENERADA`;

    // Condición 6: consta como no entregada -> el circuito se detiene.
    if (!correPlazo(ult.resultado)) return `NOTIF${n}_NO_ENTREGADA`;

    // Entregada: el plazo corre desde la entrega efectiva.
    if (!plazoVencido(ult.fechaVencimiento, refISO)) return `NOTIF${n}_${ult.resultado}`;

    // Plazo vencido sin presentación.
    if (n === 1) {
      return datosRegistralesCompletos(local) ? 'NOTIF2_PENDIENTE' : 'COMPLETAR_DATOS';
    }
    return 'GENERAR_EXPEDIENTE';
  }

  // ---- Nada del circuito todavía: vale el punto de partida del control.
  return inicial;
}

/* ============================================================================
   PLAZO EN CURSO  —  lo que muestran las bandejas y la ficha
   ============================================================================ */
export function plazoEnCurso(local, actuaciones, refISO = hoyISO()) {
  const propias = deLocal(actuaciones, local.id);
  const circuito = propias.filter((a) => ['NOTIFICACION', 'PRORROGA'].includes(a.tipo));
  const ult = circuito.length ? circuito[circuito.length - 1] : null;
  if (!ult?.fechaVencimiento) return null;
  if (ult.tipo === 'NOTIFICACION' && !correPlazo(ult.resultado)) return null;

  return {
    tipo: ult.tipo,
    instancia: ult.instancia ?? null,
    vencimiento: ult.fechaVencimiento,
    vencido: plazoVencido(ult.fechaVencimiento, refISO),
  };
}

/* ============================================================================
   ACCIONES DISPONIBLES SEGÚN EL ESTADO
   ----------------------------------------------------------------------------
   Sección 6.1, "Registro de actuaciones": el formulario tiene que ofrecer SOLO
   los actos que corresponden. No se puede registrar una primera notificación
   en un local que ya tiene una segunda, ni una prórroga antes de agotadas las
   notificaciones.

   Cada acción declara:
     estados  en qué estados aparece ('*' = en cualquiera menos el terminal)
     roles    qué roles la pueden ejecutar
   y, si hace falta:
     condicion   (local) => bool, una pregunta extra sobre el local que el
                 estado no alcanza a decir. Solo la usan las pantallas: el
                 servidor hace su propio control en la ruta.
     correccion  arregla algo ya registrado: no es "trabajo pendiente" y no
                 cuenta en las bandejas (datos/vistas.js, esTrabajoDe).
   ============================================================================ */

/* Los resultados de entrega que hacen correr el plazo. */
const ENTREGA_EFECTIVA = ['ENTREGADA', 'SIN_FIRMA', 'FIJADA'];
/* Los estados en los que el local YA acredita, o tiene una presentación que
   espera validación: no corresponde registrarle otra documentación. */
export const ESTADOS_CON_DOCUMENTACION = [
  'DDJJ_VIGENTE',
  'DDJJ_RECICLAJE',
  'CONTRATO_VIGENTE',
  'CONTRATO_9DJ',
  'PRESENTACION_EN_REVISION',
];

export const ACCIONES = [
  {
    id: 'confirmar-exencion',
    etiqueta: 'Confirmar exención',
    ayuda: 'El local no alcanza el umbral de Gran Generador. Cierra su recorrido.',
    estados: ['EXENTO_REVISION'],
    roles: ['coordinacion'],
  },
  {
    id: 'corregir-clasificacion',
    etiqueta: 'Corregir: sí es Gran Generador',
    ayuda: 'Pasa directo a la emisión de la primera notificación.',
    estados: ['EXENTO_REVISION'],
    roles: ['coordinacion'],
  },
  {
    id: 'habilitar-notificacion',
    etiqueta: 'Habilitar notificación',
    ayuda: 'Datos registrales validados. Lo manda a la cola de emisión.',
    estados: ['REVISION_DATOS'],
    roles: ['coordinacion'],
  },
  {
    id: 'completar-datos',
    etiqueta: 'Completar datos registrales',
    ayuda: 'CUIT, razón social y rubro. Sin eso no se puede volver a notificar.',
    estados: ['COMPLETAR_DATOS', 'REVISION_DATOS'],
    roles: ['administrativo', 'coordinacion'],
  },
  {
    id: 'generar-cedula',
    etiqueta: 'Generar cédula',
    ayuda: 'Emite el documento y le asigna número correlativo.',
    estados: ['NOTIF1_PENDIENTE', 'NOTIF2_PENDIENTE', 'NOTIF1_GENERANDO', 'NOTIF2_GENERANDO'],
    roles: ['administrativo', 'coordinacion'],
  },
  /* Las tres que siguen también valen con la cédula NO ENTREGADA. La guía
     dice que en ese caso el circuito se detiene "hasta que la entrega se
     concrete" (sección 4.1): para que se concrete hay que poder volver a
     intentarla, mandar a otro notificador o reemitir la cédula si la
     dirección estaba mal. Sin esto, el local quedaba trabado sin ningún
     botón. El intento fallido no se pierde: queda en la auditoría. */
  {
    id: 'regenerar-cedula',
    etiqueta: 'Regenerar cédula',
    ayuda: 'Se corrigieron datos del local: reemplaza el documento ya emitido.',
    estados: ['NOTIF1_GENERADA', 'NOTIF2_GENERADA', 'NOTIF1_NO_ENTREGADA', 'NOTIF2_NO_ENTREGADA'],
    roles: ['administrativo', 'coordinacion'],
  },
  /* La cédula ya emitida se le manda al correo del local (sql/12 y
     CORREO_HOST en el backend). Sirve cuando al generar se eligió papel y
     después se quiere mandar también por correo, cuando el envío falló, o
     cuando la cédula se regeneró. Solo si el local tiene correo cargado; el
     front además la oculta si el servidor no tiene el correo configurado. */
  {
    id: 'enviar-cedula-correo',
    etiqueta: 'Enviar por correo',
    ayuda: 'Manda la cédula emitida al correo electrónico del local.',
    estados: ['NOTIF1_GENERADA', 'NOTIF2_GENERADA', 'NOTIF1_NO_ENTREGADA', 'NOTIF2_NO_ENTREGADA'],
    roles: ['administrativo', 'coordinacion'],
    condicion: (local) => Boolean(String(local?.email ?? '').trim()),
  },
  {
    id: 'asignar-notificador',
    etiqueta: 'Asignar notificador',
    estados: ['NOTIF1_GENERADA', 'NOTIF2_GENERADA', 'NOTIF1_NO_ENTREGADA', 'NOTIF2_NO_ENTREGADA'],
    roles: ['coordinacion'],
  },
  {
    id: 'registrar-entrega',
    etiqueta: 'Registrar entrega',
    ayuda: 'El plazo empieza a correr desde la fecha de entrega efectiva.',
    estados: ['NOTIF1_GENERADA', 'NOTIF2_GENERADA', 'NOTIF1_NO_ENTREGADA', 'NOTIF2_NO_ENTREGADA'],
    roles: ['notificador', 'coordinacion'],
  },
  /* Corregir una entrega mal cargada (sección 6.2, corrección de cargas).
     El agente de campo corrige la suya el mismo día: eso lo controla el
     servidor (PUT /notificaciones/:id/entrega). Después la corrige
     coordinación, con motivo. Vale mientras esa cédula sea lo último del
     circuito: en GENERAR_EXPEDIENTE, por ejemplo, la segunda cédula vencida
     todavía se puede corregir antes de iniciar el expediente. */
  {
    id: 'corregir-entrega',
    etiqueta: 'Corregir entrega',
    ayuda: 'Se cargó mal el resultado o la fecha. El plazo se recalcula y queda el motivo.',
    estados: [
      'NOTIF1_ENTREGADA',
      'NOTIF1_SIN_FIRMA',
      'NOTIF1_FIJADA',
      'NOTIF2_ENTREGADA',
      'NOTIF2_SIN_FIRMA',
      'NOTIF2_FIJADA',
      'NOTIF2_PENDIENTE',
      'COMPLETAR_DATOS',
      'GENERAR_EXPEDIENTE',
    ],
    roles: ['coordinacion'],
    condicion: (local) => ENTREGA_EFECTIVA.includes(local?.cedulaEnCurso?.resultado),
    correccion: true,
  },
  {
    id: 'registrar-documentacion',
    etiqueta: 'Registrar documentación',
    ayuda: 'DDJJ, DDJJ de reciclaje o contrato, con su expediente de trámite.',
    /* En cualquier estado SALVO cuando el local ya acredita (documentación
       vigente hoy) o tiene una presentación esperando validación: registrarle
       otra sería redundante o directamente contradictorio (una DDJJ encima
       de un contrato vigente). Cuando esa documentación venza, el local
       vuelve al circuito y la acción reaparece sola. */
    estados: LISTA_ESTADOS.map((e) => e.codigo).filter(
      (c) => !ESTADOS_CON_DOCUMENTACION.includes(c) && c !== 'EXENTO_CONFIRMADO',
    ),
    roles: ['administrativo', 'coordinacion'],
  },
  {
    id: 'otorgar-prorroga',
    etiqueta: 'Otorgar prórroga',
    // La ayuda decía "solo con las dos notificaciones agotadas", de cuando la
    // regla era esa; desde el 14/10 vale también con la primera (ver abajo).
    ayuda: 'Con una notificación entregada (la primera o la segunda) y antes de iniciar el expediente.',
    /* También con la PRIMERA entregada o ya vencida: el titular puede pedir
       más tiempo en cualquier punto del circuito de intimación, no solo al
       final. Vencido el plazo, la prórroga sigue siendo la alternativa antes
       del paso siguiente. */
    estados: [
      'NOTIF1_ENTREGADA', 'NOTIF1_SIN_FIRMA', 'NOTIF1_FIJADA',
      'NOTIF2_PENDIENTE', 'COMPLETAR_DATOS',
      'NOTIF2_ENTREGADA', 'NOTIF2_SIN_FIRMA', 'NOTIF2_FIJADA', 'GENERAR_EXPEDIENTE',
    ],
    roles: ['coordinacion'],
  },
  {
    id: 'solicitar-expediente',
    etiqueta: 'Solicitar N° de expediente',
    ayuda: 'Registra que se pidió el número a la dependencia que tramita las multas: fecha, agente y canal.',
    estados: ['GENERAR_EXPEDIENTE'],
    roles: ['administrativo', 'coordinacion'],
    // Sin las dos entregas efectivas no se puede iniciar: no se ofrece pedir
    // el número (el camino es "Volver a notificar").
    condicion: (local) => local?.sinDosEntregasEfectivas !== true,
  },
  {
    id: 'registrar-expediente',
    etiqueta: 'Registrar expediente de multa',
    // También desde "solicitado": cuando la dependencia responde, la carga del
    // número completa ese mismo expediente.
    estados: ['GENERAR_EXPEDIENTE', 'EXPEDIENTE_SOLICITADO'],
    roles: ['administrativo', 'coordinacion'],
    // El backend lo rechaza sin las dos entregas efectivas: no se ofrece.
    condicion: (local) => local?.sinDosEntregasEfectivas !== true,
  },
  {
    /* Para los locales que llegaron a "Generar expediente" SIN las dos
       notificaciones con entrega efectiva (casos que vienen de AppSheet, error
       B-1 del Anexo B). A esos no se les puede iniciar el expediente, y antes
       no había forma de sacarlos de ahí: quedaban trabados. Vuelven a 1°
       notificación pendiente con un ciclo nuevo, como el reingreso, y el
       motivo queda en el historial. Decidido con DITEC el 20/10/2026. */
    id: 'volver-a-notificar',
    etiqueta: 'Volver a notificar',
    ayuda: 'No constan las dos notificaciones entregadas: vuelve a 1° notificación pendiente para hacerlo bien.',
    estados: ['GENERAR_EXPEDIENTE', 'EXPEDIENTE_SOLICITADO'],
    roles: ['coordinacion'],
    condicion: (local) => Boolean(local?.sinDosEntregasEfectivas),
  },
  {
    id: 'reingresar-circuito',
    etiqueta: 'Reingresar al circuito',
    ayuda: 'Genera una nueva primera notificación y reinicia la intimación.',
    estados: ['EXPEDIENTE'],
    roles: ['coordinacion'],
  },
  {
    /* EL COMERCIO CERRÓ. Distinto de la baja (que es para un error de carga
       y oculta todo el historial) y del bloqueo (una pausa mientras se
       revisa algo): el local sale del padrón, del mapa, de las bandejas y de
       la emisión, pero conserva su historial y se puede reabrir. Usa el
       estado INACTIVO que la base del área ya tenía. Solo el administrador
       del sistema (roles vacío: el administrador puede todo), decidido con
       DITEC el 21/10/2026. */
    id: 'cerrar-local',
    etiqueta: 'Marcar como cerrado',
    ayuda: 'El comercio cerró: sale del padrón, del mapa y de las bandejas. Conserva su historial y se puede reabrir.',
    estados: CODIGOS_ESTADO.filter((c) => c !== 'INACTIVO_CERRADO'),
    roles: [],
  },
  {
    id: 'reabrir-local',
    etiqueta: 'Reabrir local',
    ayuda: 'Se marcó cerrado por error, o volvió a abrir: vuelve al estado que le corresponde por sus trámites.',
    estados: ['INACTIVO_CERRADO'],
    roles: [],
  },
  {
    id: 'bloquear',
    etiqueta: 'Bloqueo manual',
    ayuda: 'Excluye el local del recálculo automático. Queda registrado quién y por qué.',
    estados: ['*'],
    roles: ['coordinacion'],
  },
];

export function accionesDisponibles(codigoEstado, rol, local) {
  return ACCIONES.filter((a) => {
    // El administrador del sistema puede ejecutar cualquier acto: es el perfil
    // de control total. Los demás, solo los que tienen declarados.
    if (rol !== 'administrador' && !a.roles.includes(rol)) return false;
    if (local?.bloqueado && a.id !== 'bloquear') return false;
    if (a.condicion && !a.condicion(local)) return false;
    if (a.estados.includes('*')) return codigoEstado !== 'EXENTO_CONFIRMADO';
    return a.estados.includes(codigoEstado);
  });
}

/* ¿Corresponde exigir datos registrales (CUIT, razón social, rubro) antes de
   este acto?

   CÉDULAS: la PRIMERA se emite con lo que se relevó en la calle (nombre del
   local y dirección): es un aviso al comercio y no hace falta frenarla por
   un CUIT que todavía no se consiguió. La SEGUNDA es la previa al expediente
   de multa y tiene que individualizar al sujeto obligado: sin CUIT y razón
   social es impugnable. Por eso el circuito pasa por COMPLETAR_DATOS recién
   después de que vence la primera (resolverEstado), y acá se exige con
   `instancia` 2. `regenerar-cedula` sigue la misma regla que la cédula que
   reemplaza.

   EXPEDIENTE Y REINGRESO: el Anexo B.2 lo deja como decisión pendiente. Sale
   del parámetro `exigirDatosSiempre`. */
export function requiereDatosRegistrales(idAccion, exigirDatosSiempre, instancia = 1) {
  if (idAccion === 'generar-cedula' || idAccion === 'regenerar-cedula') return instancia === 2;
  if (!exigirDatosSiempre) return false;
  return ['registrar-expediente', 'reingresar-circuito'].includes(idAccion);
}
