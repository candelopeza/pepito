/* ============================================================================
   datos/vistas.js  —  LO QUE SE DERIVA DE LOS DATOS (nada se guarda acá)
   ----------------------------------------------------------------------------
   Funciones puras: reciben el contenido del store y devuelven lo que las
   pantallas necesitan mostrar. No modifican nada.

   POR QUÉ ESTÁ SEPARADO DEL PROVIDER: el provider se ocupa de MODIFICAR datos,
   este archivo de LEERLOS. Mezclar las dos cosas es lo que vuelve imposible de
   seguir un store cuando crece.

   LO MÁS IMPORTANTE DE ACÁ: `conEstado()`. El estado de cada local NO está
   guardado en ninguna columna: se calcula con dominio/reglas.js sobre el
   historial de actuaciones, cada vez. Eso es lo que hace que no pueda existir
   un local cuyo estado no se corresponda con sus actuaciones.
   ============================================================================ */

import { diasEntre, hoyISO } from '../dominio/fechas.js';
import { colorEstado, etiquetaEstado, grupoEstado } from '../dominio/estados.js';
import { documentacionVigente, plazoEnCurso, resolverEstado } from '../dominio/reglas.js';
import { deLocal } from '../dominio/actuaciones.js';

/* Enriquece cada local con todo lo derivado. Es lo que consumen las grillas.
   Ojo: devuelve objetos NUEVOS, no toca los del store. */
export function conEstado(base, refISO = hoyISO()) {
  const ctx = { hoy: refISO };
  return base.locales.map((l) => {
    const codigo = resolverEstado(l, base.actuaciones, ctx);
    const plazo = plazoEnCurso(l, base.actuaciones, refISO);
    return {
      ...l,
      estado: codigo,
      estadoEtiqueta: etiquetaEstado(codigo),
      estadoColor: colorEstado(codigo),
      estadoGrupo: grupoEstado(codigo),
      plazo,
      diasRestantes: plazo ? diasEntre(refISO, plazo.vencimiento) : null,
      vigente: documentacionVigente(base.actuaciones, l.id, refISO),
      cantidadActuaciones: deLocal(base.actuaciones, l.id).length,
      sinGeo: l.latitud === null || l.longitud === null,
    };
  });
}

/* ============================================================================
   BANDEJAS DE TRABAJO  (sección 6.1, "Tablero de control")
   ----------------------------------------------------------------------------
   Cada bandeja agrupa los locales que requieren UNA acción determinada, y el
   tablero permite ejecutarla sin salir de la vista. La idea del pliego es que
   el trabajo diario se organice por bandeja, no por búsqueda en el padrón.

   `ruta` es a dónde lleva "ver todos"; `accion` es el id de la acción que
   propone la bandeja (ver ACCIONES en dominio/reglas.js).

   >>> INVARIANTE DE `ruta`: TIENE QUE SER ALCANZABLE POR TODOS LOS `roles` <<<
   Si una bandeja la ve un rol que no tiene permiso sobre su `ruta`, el link
   muere en RutaProtegida. Pasa con las dos bandejas de entrega: las ve el
   notificador, pero el módulo 'notificaciones' (la pantalla de emisión) no es
   suyo. Para eso está `rutaPorRol`: la misma bandeja manda a cada rol a la
   pantalla donde ESE rol puede actuar. El notificador no emite cédulas, las
   entrega, y su pantalla es la de campo.

   El campo es opcional: sin él vale `ruta` para todos.

   >>> `prioridad` = EN QUÉ ORDEN SE ATIENDEN (1 = primero) <<<
   No es decorativa: es el orden en que el tablero muestra las bandejas cuando
   se ordena "por prioridad", que es el modo por defecto. El criterio es
   URGENCIA ADMINISTRATIVA, no cantidad:

     1-2  ROJO: el circuito está detenido. Mientras no se resuelva, esos
          locales no avanzan por más que pase el tiempo.
     3-4  NARANJA: hay un acto que la oficina tiene que emitir hoy.
     5    AMARILLO: hay que revisar algo antes de que produzca efectos.
     6-7  AZUL / informativas: el plazo corre o está suspendido solo, no hay
          nada que hacer todavía.

   SI EL ÁREA QUIERE OTRO ORDEN se cambian estos números y listo: no hay que
   tocar la pantalla. Y el usuario puede pasar a "por cantidad" desde el
   tablero cuando quiera atacar primero el montón más grande.
   ============================================================================ */
export const DEFINICION_BANDEJAS = [
  {
    id: 'control-relevamientos',
    prioridad: 5,
    titulo: 'Relevamientos pendientes de control',
    descripcion: 'Relevamientos que todavía no pasaron por coordinación.',
    estados: ['REVISION_DATOS', 'EXENTO_REVISION'],
    ruta: '/relevamientos',
    color: 'amarillo',
    roles: ['administrativo', 'coordinacion', 'direccion'],
  },
  {
    id: 'cola-emision',
    prioridad: 3,
    titulo: 'Cédulas para emitir',
    descripcion: 'Locales habilitados a los que hay que generar la notificación.',
    estados: ['NOTIF1_PENDIENTE', 'NOTIF2_PENDIENTE', 'NOTIF1_GENERANDO', 'NOTIF2_GENERANDO'],
    ruta: '/notificaciones',
    color: 'naranja',
    roles: ['administrativo', 'coordinacion', 'direccion'],
  },
  {
    id: 'para-entregar',
    prioridad: 6,
    titulo: 'Notificaciones para entregar',
    descripcion: 'Cédulas emitidas pendientes de entrega. El plazo todavía no corre.',
    estados: ['NOTIF1_GENERADA', 'NOTIF2_GENERADA'],
    ruta: '/notificaciones',
    rutaPorRol: { notificador: '/campo/entregas' },
    color: 'azul',
    roles: ['administrativo', 'coordinacion', 'notificador', 'direccion'],
  },
  {
    id: 'datos-incompletos',
    prioridad: 2,
    titulo: 'Locales con datos incompletos',
    descripcion: 'No pueden avanzar: falta CUIT, razón social o rubro.',
    estados: ['COMPLETAR_DATOS'],
    /* Es la única bandeja cuyo destino es una grilla de uso general: las demás
       caen en una pantalla que YA muestra nada más que sus pendientes. Sin el
       filtro, esta tarjeta dejaba al usuario frente al padrón completo y con la
       búsqueda por hacer. Lo entiende pages/Local.jsx. */
    ruta: '/locales?estado=COMPLETAR_DATOS',
    color: 'rojo',
    roles: ['administrativo', 'coordinacion', 'direccion'],
  },
  {
    id: 'circuito-detenido',
    prioridad: 1,
    titulo: 'Circuito detenido por falta de entrega',
    descripcion: 'La cédula consta como no entregada: sin notificación fehaciente no hay avance.',
    estados: ['NOTIF1_NO_ENTREGADA', 'NOTIF2_NO_ENTREGADA'],
    ruta: '/notificaciones',
    rutaPorRol: { notificador: '/campo/entregas' },
    color: 'rojo',
    roles: ['administrativo', 'coordinacion', 'notificador', 'direccion'],
  },
  {
    id: 'expedientes-generar',
    prioridad: 4,
    titulo: 'Expedientes para generar',
    descripcion: 'Ambas notificaciones vencidas sin presentación.',
    estados: ['GENERAR_EXPEDIENTE'],
    ruta: '/expedientes',
    color: 'naranja',
    roles: ['administrativo', 'coordinacion', 'direccion'],
  },
  {
    id: 'prorrogas',
    prioridad: 7,
    titulo: 'Prórrogas vigentes',
    descripcion: 'Locales con prórroga en curso y su fecha de vencimiento.',
    estados: ['PRORROGA_VIGENTE'],
    ruta: '/prorrogas',
    color: 'amarillo',
    roles: ['administrativo', 'coordinacion', 'direccion'],
  },
];

/* Los dos órdenes posibles del tablero. Están acá y no en la pantalla para
   que el día que se sume un tercero (por plazo más próximo, por ejemplo) no
   haya que buscarlo entre el JSX. */
export const ORDENES_BANDEJA = [
  { id: 'prioridad', etiqueta: 'Por prioridad' },
  { id: 'cantidad', etiqueta: 'Por cantidad' },
];

/* Ordena una lista de bandejas ya armadas (con su `locales` adentro).

   POR PRIORIDAD el orden es SIEMPRE EL MISMO, incluso con bandejas vacías: así
   cada bandeja queda donde el usuario ya sabe que está. POR CANTIDAD manda el
   número y las vacías caen solas al final; si dos empatan, desempata la
   prioridad, no el azar. */
export function ordenarBandejas(lista, modo = 'prioridad') {
  const porPrioridad = (a, b) => (a.prioridad ?? 99) - (b.prioridad ?? 99);
  const copia = [...lista];
  if (modo === 'cantidad') {
    return copia.sort((a, b) => b.locales.length - a.locales.length || porPrioridad(a, b));
  }
  return copia.sort(porPrioridad);
}

export function bandejas(locales, rol, modo = 'prioridad') {
  const propias = DEFINICION_BANDEJAS
    // El administrador ve todas las bandejas: tiene acceso total.
    .filter((b) => rol === 'administrador' || b.roles.includes(rol))
    .map((b) => ({ ...b, locales: locales.filter((l) => b.estados.includes(l.estado)) }));
  return ordenarBandejas(propias, modo);
}

/* Plazos que están por vencer. No es un estado: es un aviso. Un local con el
   plazo a punto de vencer sigue estando en "1° Notificación entregada". */
export function porVencer(locales, dias = 3) {
  return locales
    .filter((l) => l.plazo && !l.plazo.vencido && l.diasRestantes !== null && l.diasRestantes <= dias)
    .sort((a, b) => a.diasRestantes - b.diasRestantes);
}

/* Documentación vigente que caduca pronto: cuando venza, el local reingresa
   solo al circuito. Sirve para avisarle al titular antes de intimarlo. */
export function documentosPorVencer(base, locales, dias = 30, refISO = hoyISO()) {
  const salida = [];
  locales.forEach((l) => {
    ['contrato', 'reciclaje', 'ddjj'].forEach((k) => {
      const doc = l.vigente[k];
      if (!doc) return;
      const restan = diasEntre(refISO, doc.fechaVencimiento);
      if (restan !== null && restan <= dias) {
        salida.push({ id: `${l.id}-${doc.id}`, local: l, doc, restan });
      }
    });
  });
  return salida.sort((a, b) => a.restan - b.restan);
}

/* Presentaciones del portal esperando que un agente las apruebe. Hasta que eso
   pase NO suspenden ningún plazo (sección 6.3). */
export function presentacionesPendientes(base) {
  return base.actuaciones
    .filter((a) => a.validado === false)
    .map((a) => ({ ...a, local: base.locales.find((l) => l.id === a.localId) ?? null }));
}

/* Cédulas emitidas: lo que necesita la pantalla de notificaciones. */
export function cedulas(base) {
  return base.actuaciones
    .filter((a) => a.tipo === 'NOTIFICACION')
    .map((a) => ({
      ...a,
      local: base.locales.find((l) => l.id === a.localId) ?? null,
      notificador: base.usuarios.find((u) => u.id === a.notificadorId) ?? null,
    }));
}

/* ============================================================================
   INDICADORES  (sección 9.5)
   ----------------------------------------------------------------------------
   Es el conjunto que priorizó el área, no un listado cerrado: el diseño tiene
   que permitir sumar métricas nuevas sin rehacer la pantalla. Por eso todo
   sale de este objeto y pages/Reportes.jsx solo lo dibuja.
   ============================================================================ */
export function indicadores(base, locales, refISO = hoyISO()) {
  const desdeMes = `${refISO.slice(0, 7)}-01`;
  const delMes = (fecha) => fecha >= desdeMes && fecha <= refISO;

  const notificaciones = base.actuaciones.filter((a) => a.tipo === 'NOTIFICACION');
  const porInstancia = (n) => notificaciones.filter((a) => a.instancia === n);
  const entregadas = (lista) => lista.filter((a) => a.resultado && a.resultado !== 'NO_ENTREGADA');

  const relevamientosMes = base.relevamientos.filter((r) => delMes(r.fechaHora.slice(0, 10)));

  /* Actuaciones del mes en curso. Se agregó para la sección "Indicadores del
     mes" del Inicio: ahí conviven con `relevamientosMes`, que ya estaba, y
     mezclar un número del mes con un total histórico en la misma franja da una
     lectura falsa. Los totales de abajo se dejaron intactos porque son los que
     usa pages/Reportes.jsx. */
  const actuacionesMes = base.actuaciones.filter((a) => delMes(a.fecha.slice(0, 10)));

  const porAgente = {};
  base.relevamientos.forEach((r) => {
    porAgente[r.usuario] = porAgente[r.usuario] ?? { agente: r.usuario, relevamientos: 0, entregas: 0 };
    porAgente[r.usuario].relevamientos += 1;
  });
  notificaciones.forEach((a) => {
    if (!a.resultado) return;
    const u = base.usuarios.find((x) => x.id === a.notificadorId);
    if (!u) return;
    porAgente[u.nombre] = porAgente[u.nombre] ?? { agente: u.nombre, relevamientos: 0, entregas: 0 };
    porAgente[u.nombre].entregas += 1;
  });

  return {
    // --- padrón
    totalLocales: locales.length,
    exentos: locales.filter((l) => l.estado === 'EXENTO_CONFIRMADO').length,
    conDocumentacionVigente: locales.filter((l) => l.estadoGrupo === 'documental').length,
    enCircuito: locales.filter((l) => ['cola_emision', 'en_tramite', 'entrega', 'bloqueo'].includes(l.estadoGrupo)).length,
    datosIncompletos: locales.filter((l) => l.estado === 'COMPLETAR_DATOS').length,
    bloqueados: locales.filter((l) => l.bloqueado).length,
    sinGeo: locales.filter((l) => l.sinGeo).length,

    // --- relevamientos del período
    relevamientosMes: relevamientosMes.length,
    relevamientosGG: relevamientosMes.filter((r) => r.clasificacion === 'GRAN_GENERADOR').length,
    relevamientosGM: relevamientosMes.filter((r) => r.clasificacion === 'GENERADOR_MENOR').length,

    // --- actuaciones del período (las usa la franja del Inicio)
    actuacionesMes: actuacionesMes.length,
    notificacionesMes: actuacionesMes.filter((a) => a.tipo === 'NOTIFICACION').length,
    expedientesMes: actuacionesMes.filter((a) => a.tipo === 'EXPEDIENTE').length,

    // --- notificaciones por instancia
    notif1Emitidas: porInstancia(1).length,
    notif1Entregadas: entregadas(porInstancia(1)).length,
    notif2Emitidas: porInstancia(2).length,
    notif2Entregadas: entregadas(porInstancia(2)).length,
    sinImprimir: notificaciones.filter((a) => !a.impresaEn).length,

    // --- documentación por tipo
    ddjj: base.actuaciones.filter((a) => a.tipo === 'DDJJ' && a.validado !== false).length,
    ddjjReciclaje: base.actuaciones.filter((a) => a.tipo === 'DDJJ_RECICLAJE' && a.validado !== false).length,
    contratos: base.actuaciones.filter((a) => a.tipo === 'CONTRATO' && a.validado !== false).length,
    contratos9DJ: base.actuaciones.filter((a) => a.tipo === 'CONTRATO' && a.origen === 'INFORME_9DJ').length,

    // --- circuito sancionatorio
    expedientes: base.actuaciones.filter((a) => a.tipo === 'EXPEDIENTE').length,
    expedientesPendientes: locales.filter((l) => l.estado === 'GENERAR_EXPEDIENTE').length,
    prorrogasVigentes: locales.filter((l) => l.estado === 'PRORROGA_VIGENTE').length,

    // --- producción por agente
    porAgente: Object.values(porAgente).sort((a, b) => b.relevamientos + b.entregas - (a.relevamientos + a.entregas)),
  };
}
