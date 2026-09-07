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
    return 'EXPEDIENTE';
  }

  if (ult?.tipo === 'NOTIFICACION') {
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
   ============================================================================ */
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
  {
    id: 'regenerar-cedula',
    etiqueta: 'Regenerar cédula',
    ayuda: 'Se corrigieron datos del local: reemplaza el documento ya emitido.',
    estados: ['NOTIF1_GENERADA', 'NOTIF2_GENERADA'],
    roles: ['administrativo', 'coordinacion'],
  },
  {
    id: 'asignar-notificador',
    etiqueta: 'Asignar notificador',
    estados: ['NOTIF1_GENERADA', 'NOTIF2_GENERADA'],
    roles: ['coordinacion'],
  },
  {
    id: 'registrar-entrega',
    etiqueta: 'Registrar entrega',
    ayuda: 'El plazo empieza a correr desde la fecha de entrega efectiva.',
    estados: ['NOTIF1_GENERADA', 'NOTIF2_GENERADA'],
    roles: ['notificador', 'coordinacion'],
  },
  {
    id: 'registrar-documentacion',
    etiqueta: 'Registrar documentación',
    ayuda: 'DDJJ, DDJJ de reciclaje o contrato, con su expediente de trámite.',
    estados: ['*'],
    roles: ['administrativo', 'coordinacion'],
  },
  {
    id: 'otorgar-prorroga',
    etiqueta: 'Otorgar prórroga',
    ayuda: 'Solo con las dos notificaciones agotadas y antes del expediente.',
    estados: ['NOTIF2_ENTREGADA', 'NOTIF2_SIN_FIRMA', 'NOTIF2_FIJADA', 'GENERAR_EXPEDIENTE'],
    roles: ['coordinacion'],
  },
  {
    id: 'registrar-expediente',
    etiqueta: 'Registrar expediente de multa',
    estados: ['GENERAR_EXPEDIENTE'],
    roles: ['administrativo', 'coordinacion'],
  },
  {
    id: 'reingresar-circuito',
    etiqueta: 'Reingresar al circuito',
    ayuda: 'Genera una nueva primera notificación y reinicia la intimación.',
    estados: ['EXPEDIENTE'],
    roles: ['coordinacion'],
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
    if (!a.roles.includes(rol)) return false;
    if (local?.bloqueado && a.id !== 'bloquear') return false;
    if (a.estados.includes('*')) return codigoEstado !== 'EXENTO_CONFIRMADO';
    return a.estados.includes(codigoEstado);
  });
}

/* ¿Corresponde exigir datos registrales antes de este acto?
   El Anexo B.2 lo deja como decisión pendiente para el expediente y para la
   reentrada por vencimiento. Sale del parámetro `exigirDatosSiempre`. */
export function requiereDatosRegistrales(idAccion, exigirDatosSiempre) {
  if (idAccion === 'generar-cedula') return true;
  if (!exigirDatosSiempre) return false;
  return ['registrar-expediente', 'reingresar-circuito'].includes(idAccion);
}
