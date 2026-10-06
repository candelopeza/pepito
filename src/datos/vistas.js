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

import { diasEntre, hoyISO, sumarDias } from '../dominio/fechas.js';
import { colorEstado, etiquetaEstado, grupoEstado } from '../dominio/estados.js';
import { ACCIONES, accionesDisponibles, documentacionVigente, plazoEnCurso, resolverEstado } from '../dominio/reglas.js';
import { deLocal } from '../dominio/actuaciones.js';

/* Enriquece cada local con todo lo derivado. Es lo que consumen las grillas.
   Ojo: devuelve objetos NUEVOS, no toca los del store. */
export function conEstado(base, refISO = hoyISO()) {
  const ctx = { hoy: refISO };

  /* Las actuaciones de cada local, agrupadas UNA vez. Antes cada cálculo de
     abajo recorría las 2.400 actuaciones del padrón por cada uno de los 2.200
     locales (varias veces). Con el grupo armado, cada local mira solo las
     suyas. El resultado es el mismo: las funciones del dominio filtran por
     local igual. */
  const porLocal = new Map();
  for (const a of base.actuaciones) {
    if (!porLocal.has(a.localId)) porLocal.set(a.localId, []);
    porLocal.get(a.localId).push(a);
  }

  // Lo que el titular pidió por el portal y coordinación todavía no resolvió
  // (ver backend: GET /locales/solicitudes-prorroga).
  const solicitudes = new Map((base.solicitudesProrroga ?? []).map((s) => [s.localId, s]));

  return base.locales.map((l) => {
    const propias = porLocal.get(l.id) ?? [];
    /* EL ESTADO LO MANDA EL BACKEND. Cada local viene de GET /locales con su
       `estado` ya resuelto a partir de lo que hay GUARDADO en la base
       (local.id_estado y el último trámite del circuito, ver backend/mapeo.js).

       Se recalcula con resolverEstado() solo si no vino, que hoy pasa cuando
       estas funciones se usan con datos armados a mano: las pruebas de
       pruebas/criterios.mjs y cualquier cálculo sobre un local que todavía no
       se guardó.

       POR QUÉ NO SE RECALCULA SIEMPRE: la base tiene 2.441 trámites cargados
       por el área, y su estado es el resultado de ese trabajo. Recalcularlo
       acá podría mostrar en pantalla algo distinto de lo que el área registró
       a mano, y en ese caso la pantalla estaría mintiendo sobre el expediente. */
    const codigo = l.estado ?? resolverEstado(l, propias, ctx);
    const plazo = plazoEnCurso(l, propias, refISO);
    const ordenadas = deLocal(propias, l.id);
    // La cédula en curso: la última emitida (con número). De ahí sale a quién
    // está asignada, para las bandejas del notificador y de coordinación.
    const cedulas = ordenadas.filter((a) => a.tipo === 'NOTIFICACION' && a.numeroCedula);
    return {
      ...l,
      estado: codigo,
      estadoEtiqueta: etiquetaEstado(codigo),
      estadoColor: colorEstado(codigo),
      estadoGrupo: grupoEstado(codigo),
      plazo,
      diasRestantes: plazo ? diasEntre(refISO, plazo.vencimiento) : null,
      vigente: documentacionVigente(propias, l.id, refISO),
      cantidadActuaciones: ordenadas.length,
      sinGeo: l.latitud === null || l.longitud === null,
      cedulaEnCurso: cedulas.length ? cedulas[cedulas.length - 1] : null,
      solicitudProrroga: solicitudes.get(l.id) ?? null,
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
    rutaPorRol: { notificador: '/campo/entregas', relevador: '/campo/entregas' },
    color: 'azul',
    // El relevador las ve solo si le asignaron cédulas (esTrabajoDe).
    roles: ['administrativo', 'coordinacion', 'notificador', 'relevador', 'direccion'],
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
    rutaPorRol: { notificador: '/campo/entregas', relevador: '/campo/entregas' },
    color: 'rojo',
    // El relevador las ve solo si le asignaron cédulas (esTrabajoDe).
    roles: ['administrativo', 'coordinacion', 'notificador', 'relevador', 'direccion'],
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
    // Informativa: nadie tiene que hacer nada hasta que venza. Se muestra
    // entera aunque se pida "solo lo que me toca" (ver bandejas()).
    informativa: true,
  },

  /* >>> LAS TRES QUE SIGUEN SE AGREGARON PARA COORDINACIÓN (2026-10-02) <<<
     No dependen solo del estado: llevan `condicion`, una pregunta extra sobre
     el local que bandejas() aplica además de `estados`. */
  {
    id: 'sin-notificador',
    prioridad: 3.5,
    titulo: 'Cédulas sin notificador',
    descripcion: 'Emitidas y sin agente asignado: no van a salir a la calle hasta que se asignen.',
    estados: ['NOTIF1_GENERADA', 'NOTIF2_GENERADA', 'NOTIF1_NO_ENTREGADA', 'NOTIF2_NO_ENTREGADA'],
    condicion: (l) => Boolean(l.cedulaEnCurso) && !l.cedulaEnCurso.notificadorId,
    ruta: '/tablero',
    color: 'naranja',
    roles: ['coordinacion'],
  },
  {
    id: 'solicitudes-prorroga',
    prioridad: 4.5,
    titulo: 'Prórrogas pedidas por el titular',
    descripcion: 'Pedidos del portal que esperan que coordinación decida los días.',
    estados: ['NOTIF2_ENTREGADA', 'NOTIF2_SIN_FIRMA', 'NOTIF2_FIJADA', 'GENERAR_EXPEDIENTE'],
    condicion: (l) => Boolean(l.solicitudProrroga),
    ruta: '/prorrogas',
    color: 'amarillo',
    roles: ['coordinacion'],
  },
  {
    id: 'bloqueados',
    prioridad: 8,
    titulo: 'Locales con bloqueo manual',
    descripcion: 'Excluidos del cálculo automático. Revisá si el bloqueo sigue haciendo falta.',
    estados: null,
    condicion: (l) => Boolean(l.bloqueado),
    // Llega al padrón ya filtrado por esta situación (pages/Local.jsx).
    ruta: '/locales?situacion=bloqueado',
    color: 'gris',
    roles: ['coordinacion'],
    informativa: true,
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

/* opciones.soloTrabajo: deja en cada bandeja solo los locales que ESTE usuario
   puede resolver (esTrabajoDe, más abajo). Lo piden el Inicio y el Tablero.
   Sin opciones devuelve todo, como antes. Las bandejas `informativa` se
   muestran enteras igual: no esperan un acto de nadie. */
export function bandejas(locales, rol, modo = 'prioridad', opciones = {}) {
  const { soloTrabajo = false, idUsuario = null } = opciones;
  const propias = DEFINICION_BANDEJAS
    // El administrador ve todas las bandejas: tiene acceso total.
    .filter((b) => rol === 'administrador' || b.roles.includes(rol))
    .map((b) => ({
      ...b,
      // `estados: null` = cualquier estado. `condicion` es opcional.
      locales: locales.filter(
        (l) =>
          (!b.estados || b.estados.includes(l.estado)) &&
          (!b.condicion || b.condicion(l)) &&
          (!soloTrabajo || b.informativa || esTrabajoDe(l, rol, idUsuario)),
      ),
    }));
  return ordenarBandejas(propias, modo);
}

/* ¿Este local es trabajo de ESTE usuario?

   Una bandeja agrupa por estado, pero no todo lo que hay en una bandeja lo
   puede resolver cualquiera que la ve: el administrativo ve los relevamientos
   pendientes de control, pero confirmar una exención es de coordinación. El
   Inicio y el Tablero cuentan como "esperando una acción tuya" solo lo que
   pasa esta prueba, que es la misma tabla de actos que dibuja los botones.

     direccion    lectura total: todo es "situación del área", no trabajo suyo
     notificador  solo las cédulas que tiene asignadas (sección 6.2)
     relevador    lo mismo, si le asignaron cédulas: "suele acumularse" con
                  el rol de notificador (sección 7.2)
     el resto     los locales donde tiene al menos un acto disponible

   Los actos que valen en CUALQUIER estado (registrar documentación, bloquear)
   y las correcciones no cuentan: con ellos todo el padrón sería "trabajo
   pendiente". */
const ESPERAN_ENTREGA = ACCIONES.find((a) => a.id === 'registrar-entrega')?.estados ?? [];

export function esTrabajoDe(local, rol, idUsuario = null) {
  if (rol === 'direccion' || rol === 'administrador') return true;
  if (rol === 'notificador' || rol === 'relevador') {
    return (
      Boolean(idUsuario) &&
      !local.bloqueado &&
      local.cedulaEnCurso?.notificadorId === idUsuario &&
      ESPERAN_ENTREGA.includes(local.estado)
    );
  }
  const propios = accionesDisponibles(local.estado, rol, local).filter((a) => !a.estados.includes('*') && !a.correccion);
  return propios.length > 0;
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

/* Cédulas emitidas: lo que necesita la pantalla de notificaciones.
   Solo las que tienen número. Una notificación PENDIENTE (la que crean la
   habilitación de coordinación y el reingreso) todavía no es una cédula: está
   en la cola de emisión, y en las listas de entrega aparecía como "Cédula
   null" sin nada que entregar. */
export function cedulas(base) {
  return base.actuaciones
    .filter((a) => a.tipo === 'NOTIFICACION' && a.numeroCedula)
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
/* Con qué se muestran los registros que no tienen agente cargado. Es una
   etiqueta de presentación: no existe ningún usuario que se llame así. */
const SIN_AGENTE = 'Sin agente registrado';

export function indicadores(base, locales, refISO = hoyISO()) {
  const desdeMes = `${refISO.slice(0, 7)}-01`;

  /* `fecha` puede venir vacía: en el padrón real hay actuaciones cargadas sin
     fecha (ocho presentaciones de documentación, al momento de escribir esto).
     Un registro sin fecha no pertenece a ningún mes, así que no cuenta — pero
     no puede tumbar la pantalla, que es lo que pasaba cuando esto hacía
     `fecha.slice(0, 10)` directo sobre un null.

     Se normaliza acá y no en cada llamada para que la regla sea una sola. */
  const delMes = (fecha) => {
    const dia = String(fecha ?? '').slice(0, 10);
    return Boolean(dia) && dia >= desdeMes && dia <= refISO;
  };

  // Emitidas = con número. Las pendientes de emisión no cuentan como cédula.
  const notificaciones = base.actuaciones.filter((a) => a.tipo === 'NOTIFICACION' && a.numeroCedula);
  const porInstancia = (n) => notificaciones.filter((a) => a.instancia === n);
  const entregadas = (lista) => lista.filter((a) => a.resultado && a.resultado !== 'NO_ENTREGADA');

  const relevamientosMes = base.relevamientos.filter((r) => delMes(r.fechaHora));

  /* Actuaciones del mes en curso. Se agregó para la sección "Indicadores del
     mes" del Inicio: ahí conviven con `relevamientosMes`, que ya estaba, y
     mezclar un número del mes con un total histórico en la misma franja da una
     lectura falsa. Los totales de abajo se dejaron intactos porque son los que
     usa pages/Reportes.jsx. */
  const actuacionesMes = base.actuaciones.filter((a) => delMes(a.fecha));

  /* El rendimiento por agente.

     >>> OJO CON LOS REGISTROS SIN AGENTE <<<
     En el padrón real casi todos los relevamientos vienen sin usuario: la tabla
     `usuario` de la base tiene tres filas y los trámites históricos no apuntan
     a ninguna. Esos registros se agrupan bajo una etiqueta legible en vez de
     quedar con el agente en null.

     No es cosmético: la grilla necesita una clave única por fila, y una fila
     con la clave en null tumbaba la pantalla de Reportes entera. */
  const porAgente = {};
  base.relevamientos.forEach((r) => {
    const agente = r.usuario || SIN_AGENTE;
    porAgente[agente] = porAgente[agente] ?? { agente, relevamientos: 0, entregas: 0 };
    porAgente[agente].relevamientos += 1;
  });
  notificaciones.forEach((a) => {
    if (!a.resultado) return;
    const u = base.usuarios.find((x) => x.id === a.notificadorId);
    const agente = u?.nombre || SIN_AGENTE;
    porAgente[agente] = porAgente[agente] ?? { agente, relevamientos: 0, entregas: 0 };
    porAgente[agente].entregas += 1;
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
    // Sin la constancia de impresión (sql/04) no se sabe: null, y la
    // pantalla no muestra un "todas sin imprimir" que no es cierto.
    sinImprimir: base.capacidades?.impresion === false ? null : notificaciones.filter((a) => !a.impresaEn).length,

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

/* ============================================================================
   INDICADORES DE UN PERÍODO  (sección 9.5 y Anexo A.4)
   ----------------------------------------------------------------------------
   Lo que PASÓ entre dos fechas, las dos inclusive: lo que se relevó, se
   emitió, se entregó, se presentó y se inició. Es la producción del área. La
   composición del padrón (cuántos locales hay en cada situación HOY) sigue
   saliendo de indicadores(): es una foto, no un período.

   Cada número cuenta por la fecha de SU acto: una cédula emitida en marzo y
   entregada en abril suma como emitida en marzo y como entregada en abril.

   "Ayer" es el reporte diario que hoy se manda por correo a las 7, con la
   producción de las 24 horas previas (Anexo A.4).
   ============================================================================ */
export const PERIODOS_REPORTE = [
  { id: 'mes', etiqueta: 'Mes en curso' },
  { id: 'ayer', etiqueta: 'Ayer' },
  { id: 'hoy', etiqueta: 'Hoy' },
  { id: 'mes-anterior', etiqueta: 'Mes anterior' },
  { id: 'todo', etiqueta: 'Todo' },
  { id: 'otro', etiqueta: 'Otro período' },
];

/* Las fechas de cada período, en ISO. 'otro' lo elige la pantalla. */
export function rangoDePeriodo(id, refISO = hoyISO()) {
  const primeroDelMes = `${refISO.slice(0, 7)}-01`;
  if (id === 'hoy') return { desde: refISO, hasta: refISO };
  if (id === 'ayer') {
    const ayer = sumarDias(refISO, -1);
    return { desde: ayer, hasta: ayer };
  }
  if (id === 'mes-anterior') {
    const ultimoDelAnterior = sumarDias(primeroDelMes, -1);
    return { desde: `${ultimoDelAnterior.slice(0, 7)}-01`, hasta: ultimoDelAnterior };
  }
  if (id === 'todo') return { desde: '0000-01-01', hasta: refISO };
  return { desde: primeroDelMes, hasta: refISO };
}

export function indicadoresDelPeriodo(base, desde, hasta) {
  // Igual que en indicadores(): un registro sin fecha no es de ningún período.
  const dentro = (fecha) => {
    const dia = String(fecha ?? '').slice(0, 10);
    return Boolean(dia) && dia >= desde && dia <= hasta;
  };

  const relevados = base.relevamientos.filter((r) => dentro(r.fechaHora));
  const cedulasEmitidas = base.actuaciones.filter((a) => a.tipo === 'NOTIFICACION' && a.numeroCedula);
  const emitidas = cedulasEmitidas.filter((a) => dentro(a.fecha));
  // Con resultado cargado en el período (la fecha de la visita; si no la
  // tiene, la de emisión).
  const conResultado = cedulasEmitidas.filter((a) => a.resultado && dentro(a.fechaEntrega ?? a.fecha));
  // Fehaciente: entregada, sin firma o fijada. La no entregada no hace correr plazo.
  const fehacientes = conResultado.filter((a) => a.resultado !== 'NO_ENTREGADA');
  const documentos = base.actuaciones.filter(
    (a) => ['DDJJ', 'DDJJ_RECICLAJE', 'CONTRATO'].includes(a.tipo) && a.validado !== false && dentro(a.fecha),
  );
  const deTipo = (tipo) => base.actuaciones.filter((a) => a.tipo === tipo && dentro(a.fecha)).length;
  const instancia = (lista, n) => lista.filter((a) => a.instancia === n).length;

  // La producción por agente, con la misma regla que indicadores().
  const porAgente = {};
  const sumar = (agente, campo) => {
    const clave = agente || SIN_AGENTE;
    porAgente[clave] = porAgente[clave] ?? { agente: clave, relevamientos: 0, entregas: 0 };
    porAgente[clave][campo] += 1;
  };
  relevados.forEach((r) => sumar(r.usuario, 'relevamientos'));
  conResultado.forEach((a) => sumar(base.usuarios.find((u) => u.id === a.notificadorId)?.nombre, 'entregas'));

  return {
    relevamientos: relevados.length,
    relevamientosGG: relevados.filter((r) => r.clasificacion === 'GRAN_GENERADOR').length,
    relevamientosGM: relevados.filter((r) => r.clasificacion === 'GENERADOR_MENOR').length,

    notif1Emitidas: instancia(emitidas, 1),
    notif1Entregadas: instancia(fehacientes, 1),
    notif2Emitidas: instancia(emitidas, 2),
    notif2Entregadas: instancia(fehacientes, 2),

    ddjj: documentos.filter((a) => a.tipo === 'DDJJ').length,
    ddjjReciclaje: documentos.filter((a) => a.tipo === 'DDJJ_RECICLAJE').length,
    contratos: documentos.filter((a) => a.tipo === 'CONTRATO').length,
    contratos9DJ: documentos.filter((a) => a.tipo === 'CONTRATO' && a.origen === 'INFORME_9DJ').length,

    expedientes: deTipo('EXPEDIENTE'),
    prorrogas: deTipo('PRORROGA'),

    porAgente: Object.values(porAgente).sort((a, b) => b.relevamientos + b.entregas - (a.relevamientos + a.entregas)),
  };
}
