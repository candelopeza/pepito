/* ============================================================================
   config/modulos.js  —  *** LA TABLA DE PERMISOS ***
   ----------------------------------------------------------------------------
   ES EL ÚNICO LUGAR donde se define qué módulo ve cada rol. Todo lo demás se
   arma solo a partir de esta lista:
       - los ítems del menú lateral   (components/Sidebar.jsx)
       - el bloqueo por URL           (components/RutaProtegida.jsx)

   >>> EL INICIO YA NO DIBUJA UNA TARJETA POR MÓDULO <<<
   Antes había un campo `enInicio` y Home.jsx pintaba una tarjeta por cada
   módulo del rol. Eso convertía al Inicio en una copia del menú lateral: las
   mismas diez opciones, dos veces en la misma pantalla. Se quitó.

   El Inicio ahora responde otras dos preguntas —"qué puedo iniciar" y "qué
   requiere mi atención"— y para eso usa:
       - ACCIONES_RAPIDAS de este archivo   (qué puedo iniciar)
       - las bandejas de datos/vistas.js    (qué requiere mi atención)
   La NAVEGACIÓN GENERAL es el menú lateral, y solo el menú lateral.

   Si sacás un rol del array `roles` de un módulo, ese rol deja de ver la
   tarjeta, deja de ver el ítem del menú Y no puede entrar escribiendo la URL.
   Los tres a la vez, tocando un renglón.

   AGREGAR UN MÓDULO NUEVO = 2 pasos: sumarlo acá + sumar su <Route> en App.jsx.

   CAMPOS
     id            identificador interno
     titulo        texto de la tarjeta y del menú
     descripcion   bajada de la tarjeta del Inicio
     ruta          tiene que coincidir EXACTO con el path de App.jsx
     grupo         en qué sección del menú va (ver SECCIONES en Sidebar.jsx)
     roles         QUIÉNES LO VEN
     rolesEdicion  QUIÉNES PUEDEN MODIFICAR. Ver y modificar son permisos
                   distintos: casi todos ven el padrón, no cualquiera lo cambia.
                   Si el campo no está, NADIE edita.

   ============================================================================
   EL REPARTO SIGUE EL CAPÍTULO 7 DEL PLIEGO. Igual conviene validarlo con el
   área antes de darlo por cerrado: corregirlo no requiere programar, se agrega
   o se saca el nombre del rol del array.

     MÓDULO                  RELEV  NOTIF  ADMIN  COORD  DIREC  TITULAR
     Tablero                    ·      ·      SI     SI     SI      ·
     Padrón de locales          SI     SI     SI     SI     SI      ·
     Relevamientos              SI     ·      SI     SI     SI      ·
     Notificaciones (emisión)   ·      ·      SI     SI     SI      ·
     Mis entregas (campo)       ·      SI     ·      SI     ·       ·
     Documentación              ·      ·      SI     SI     SI      ·
     Validar presentaciones     ·      ·      SI     SI     ·       ·
     Prórrogas                  ·      ·      SI     SI     SI      ·
     Expedientes                ·      ·      SI     SI     SI      ·
     Mapa                       SI     SI     SI     SI     SI      ·
     Reportes                   ·      ·      ·      SI     SI      ·
     Duplicados                 ·      ·      ·      SI     ·       ·
     Informe 9 de Julio         ·      ·      SI     SI     ·       ·
     Geocodificación pendiente  ·      ·      SI     SI     ·       ·
     Accesos: tipos de usuario  ·      ·      ·      ·      ·       ·      (solo administrador)
     Accesos: usuarios          ·      ·      ·      ·      SI      ·      (y administrador)
     Config: rubros             ·      ·      ·      SI     SI      ·
     Config: feriados           ·      ·      ·      SI     SI      ·
     Config: plantilla cédula   ·      ·      ·      SI     SI      ·
     Config: parámetros         ·      ·      ·      ·      SI      ·
     Portal del titular         ·      ·      ·      ·      ·       SI

   EL ADMINISTRADOR DEL SISTEMA no figura en la tabla: TIENE TODO. Ve y
   modifica cada módulo de los demás roles (menos el Portal del titular, que
   es la vista del contribuyente) y además la sección Accesos. Es el perfil de
   DITEC para controlar el sistema. Está resuelto en nivelPorDefecto(), no en
   los arrays: así no hay que agregarlo módulo por módulo.

   >>> LO QUE TRAE ESTE ARCHIVO ES EL REPARTO POR DEFECTO <<<
   Desde Accesos → Tipos de usuario, el administrador puede habilitar o quitar
   módulos a cada rol, y apagar un rol entero, sin programar. Eso se guarda en
   el store como
       permisos.modulos[idModulo][rol] = 'no' | 'ver' | 'editar'
       permisos.rolesDeshabilitados    = ['relevador', ...]
   y las ayudas de acá abajo lo miran primero: lo guardado gana, lo que no
   está guardado sale de `roles` / `rolesEdicion`. Por eso un módulo nuevo
   aparece con su reparto por defecto aunque nadie haya tocado Accesos.

   DOS DECISIONES QUE VALE LA PENA DISCUTIR:
     - Los PLAZOS (5 y 3 días hábiles) solo los toca Dirección. Es explícito en
       la sección 4.1: se pide que un cambio de criterio no requiera desarrollo,
       pero tampoco quede al alcance del uso diario.
     - EXPEDIENTES lo ve el administrativo, no solo coordinación. En la versión
       anterior de la maqueta estaba restringido; el pliego pone "registrar
       documentación y expedientes" entre las tareas del administrativo (7.2).
   ============================================================================ */

export const MODULOS = [
  /* ===================== OPERATIVO ===================== */
  {
    id: 'tablero',
    titulo: 'Tablero de control',
    descripcion: 'Bandejas de trabajo: qué hay que hacer hoy y con qué locales',
    ruta: '/tablero',
    grupo: 'operativo',
    roles: ['administrativo', 'coordinacion', 'direccion'],
  },
  {
    id: 'locales',
    titulo: 'Padrón de locales',
    descripcion: 'Consultar y administrar los establecimientos registrados',
    ruta: '/locales',
    grupo: 'operativo',
    roles: ['relevador', 'notificador', 'administrativo', 'coordinacion', 'direccion'],
    rolesEdicion: ['administrativo', 'coordinacion'],
  },
  {
    id: 'relevamientos',
    titulo: 'Relevamientos',
    descripcion: 'Cargar relevamientos de campo y controlar los pendientes',
    ruta: '/relevamientos',
    grupo: 'operativo',
    roles: ['relevador', 'administrativo', 'coordinacion', 'direccion'],
    rolesEdicion: ['relevador', 'coordinacion'],
  },
  {
    id: 'notificaciones',
    titulo: 'Notificaciones',
    descripcion: 'Emitir cédulas, asignar notificadores y armar la hoja de ruta',
    ruta: '/notificaciones',
    grupo: 'operativo',
    roles: ['administrativo', 'coordinacion', 'direccion'],
    rolesEdicion: ['administrativo', 'coordinacion'],
  },
  {
    id: 'documentacion',
    titulo: 'Documentación',
    descripcion: 'DDJJ, DDJJ de reciclaje y contratos presentados',
    ruta: '/documentacion',
    grupo: 'operativo',
    roles: ['administrativo', 'coordinacion', 'direccion'],
    rolesEdicion: ['administrativo', 'coordinacion'],
  },
  {
    id: 'prorrogas',
    titulo: 'Prórrogas',
    descripcion: 'Prórrogas otorgadas y solicitudes pendientes',
    ruta: '/prorrogas',
    grupo: 'operativo',
    roles: ['administrativo', 'coordinacion', 'direccion'],
    rolesEdicion: ['coordinacion'],
  },
  {
    id: 'expedientes',
    titulo: 'Expedientes',
    descripcion: 'Expedientes de multa: generación y seguimiento',
    ruta: '/expedientes',
    grupo: 'operativo',
    roles: ['administrativo', 'coordinacion', 'direccion'],
    rolesEdicion: ['administrativo', 'coordinacion'],
  },
  {
    id: 'mapa',
    titulo: 'Mapa',
    descripcion: 'Los locales del padrón en el territorio, por estado',
    ruta: '/mapa',
    grupo: 'operativo',
    roles: ['relevador', 'notificador', 'administrativo', 'coordinacion', 'direccion'],
  },
  {
    id: 'reportes',
    titulo: 'Reportes e indicadores',
    descripcion: 'Métricas de gestión y producción por agente',
    ruta: '/reportes',
    grupo: 'operativo',
    roles: ['coordinacion', 'direccion'],
  },

  /* ===================== CAMPO ===================== */
  {
    id: 'relevar',
    titulo: 'Relevar un local',
    descripcion: 'Formulario de campo. Funciona sin conexión.',
    ruta: '/campo/relevar',
    grupo: 'campo',
    roles: ['relevador', 'coordinacion'],
    rolesEdicion: ['relevador', 'coordinacion'],
  },
  {
    id: 'entregas',
    titulo: 'Mis entregas',
    descripcion: 'Cédulas asignadas y registro del resultado de la entrega',
    ruta: '/campo/entregas',
    grupo: 'campo',
    // El relevador también: coordinación le puede asignar cédulas, y la guía
    // dice que suele ser el mismo agente (sección 7.2).
    roles: ['notificador', 'relevador', 'coordinacion'],
    rolesEdicion: ['notificador', 'relevador', 'coordinacion'],
  },

  /* ===================== ACCESOS ===================== */
  {
    id: 'accesos',
    titulo: 'Accesos',
    descripcion: 'Usuarios (por id_persona) y qué puede hacer cada tipo',
    ruta: '/accesos',
    grupo: 'accesos',
    roles: ['administrador', 'direccion'],
    rolesEdicion: ['administrador', 'direccion'],
  },

  /* ===================== HERRAMIENTAS ===================== */
  {
    id: 'duplicados',
    titulo: 'Duplicados',
    descripcion: 'Detectar y unificar locales cargados más de una vez',
    ruta: '/herramientas/duplicados',
    grupo: 'herramientas',
    roles: ['coordinacion'],
    rolesEdicion: ['coordinacion'],
  },
  {
    id: 'informe-9dj',
    titulo: 'Informe 9 de Julio',
    descripcion: 'Carga asistida del listado de contratos de la prestataria',
    ruta: '/herramientas/informe-9dj',
    grupo: 'herramientas',
    roles: ['administrativo', 'coordinacion'],
    rolesEdicion: ['administrativo', 'coordinacion'],
  },

  /* ===================== CONFIGURACIÓN ===================== */
  {
    id: 'configuracion',
    titulo: 'Configuración',
    descripcion: 'Rubros, feriados, plantilla de cédula y parámetros, en una sola pantalla',
    ruta: '/configuracion',
    grupo: 'configuracion',
    roles: ['coordinacion', 'direccion'],
    rolesEdicion: ['coordinacion', 'direccion'],
  },

  /* ===================== PORTAL DEL TITULAR ===================== */
  {
    id: 'portal',
    titulo: 'Mis locales',
    descripcion: 'Situación de tus establecimientos y presentación de documentación',
    ruta: '/portal',
    grupo: 'portal',
    roles: ['titular'],
    rolesEdicion: ['titular'],
  },
];

/* ============================================================================
   ACCIONES RÁPIDAS DEL INICIO  —  "¿QUÉ PUEDO INICIAR?"
   ----------------------------------------------------------------------------
   La franja de arriba del Inicio (pages/Home.jsx). Son los puntos de ENTRADA
   al circuito: dan de alta algo nuevo o abren la pantalla donde ese rol
   trabaja todos los días.

   >>> LA DIFERENCIA CON MODULOS <<<
   Un módulo es un LUGAR ("Padrón de locales"). Una acción rápida es algo que
   se EMPIEZA ("Nuevo local"). Por eso una acción puede llevar a una ruta con
   parámetros, y por eso el mismo destino puede aparecer con otro nombre según
   el rol: el notificador no entra a "Mis entregas" para consultar, entra para
   registrar el resultado de la entrega del día.

   ACCESOS NO TIENE ACCIÓN RÁPIDA a propósito: usuarios y tipos de usuario se
   administran desde el menú lateral, no son algo que se "inicia" todos los
   días. El administrador ve en el Inicio las mismas acciones que los demás.

   NO ES UNA TABLA DE PERMISOS NUEVA. El acceso real lo sigue gobernando
   MODULOS a través de RutaProtegida: si alguien llegara acá con un rol que no
   puede ver el destino, la ruta lo rebota igual. Este `roles` decide QUÉ SE
   OFRECE, no qué se permite; conviene que sea un subconjunto de los `roles`
   (o de los `rolesEdicion`) del módulo de destino.

   CAMPOS
     id           identificador interno
     titulo       texto de la tarjeta
     descripcion  la bajada, una línea
     ruta         a dónde va. Puede llevar query string (ver `?nuevo=1`).
     roles        a qué roles se les ofrece

   >>> POR QUÉ 'Nuevo local' APUNTA A /locales?nuevo=1 <<<
   El alta de un local es un modal que vive DENTRO del padrón (pages/Local.jsx),
   no una pantalla con URL propia. Para no duplicar ese formulario, Local.jsx
   aprendió a abrir su propio modal cuando la URL trae `?nuevo=1`. Así el Inicio
   inicia el alta de verdad, y sigue habiendo un solo formulario de local.
   ============================================================================ */
export const ACCIONES_RAPIDAS = [
  {
    id: 'nuevo-local',
    titulo: 'Nuevo local',
    descripcion: 'Dar de alta un establecimiento en el padrón',
    ruta: '/locales?nuevo=1',
    roles: ['administrativo', 'coordinacion'],
  },
  {
    id: 'nuevo-relevamiento',
    titulo: 'Nuevo relevamiento',
    descripcion: 'Relevar un local en territorio. Funciona sin conexión.',
    ruta: '/campo/relevar',
    roles: ['relevador', 'coordinacion'],
  },
  {
    id: 'registrar-entrega',
    titulo: 'Registrar una entrega',
    descripcion: 'Cédulas asignadas y resultado de la entrega',
    ruta: '/campo/entregas',
    roles: ['notificador', 'coordinacion'],
  },
  {
    id: 'emitir-cedulas',
    titulo: 'Emitir cédulas',
    descripcion: 'Generar notificaciones y armar la hoja de ruta',
    ruta: '/notificaciones',
    roles: ['administrativo', 'coordinacion'],
  },
  {
    id: 'registrar-documentacion',
    titulo: 'Registrar documentación',
    descripcion: 'Cargar una DDJJ, una DDJJ de reciclaje o un contrato',
    ruta: '/documentacion',
    roles: ['administrativo', 'coordinacion'],
  },
  {
    id: 'mis-relevamientos',
    titulo: 'Mis relevamientos',
    descripcion: 'Los relevamientos cargados y en qué quedó cada uno',
    ruta: '/relevamientos',
    roles: ['relevador'],
  },
  {
    id: 'consultar-padron',
    titulo: 'Consultar el padrón',
    descripcion: 'Buscar un establecimiento y ver su situación',
    ruta: '/locales',
    roles: ['relevador', 'notificador', 'direccion'],
  },
  {
    id: 'ver-reportes',
    titulo: 'Reportes e indicadores',
    descripcion: 'Métricas de gestión y producción por agente',
    ruta: '/reportes',
    roles: ['direccion', 'coordinacion'],
  },
  {
    // Dirección da de alta y de baja a los agentes (sección 7.2).
    id: 'gestionar-usuarios',
    titulo: 'Usuarios del sistema',
    descripcion: 'Alta, baja y rol de los agentes',
    ruta: '/accesos/usuarios',
    roles: ['direccion'],
  },
  {
    id: 'ver-mapa',
    titulo: 'Ver el mapa',
    descripcion: 'Los locales del padrón en el territorio, por estado',
    ruta: '/mapa',
    roles: ['relevador', 'notificador', 'direccion'],
  },
  {
    id: 'mis-locales',
    titulo: 'Mis locales',
    descripcion: 'Situación de tus establecimientos y presentación de documentación',
    ruta: '/portal',
    roles: ['titular'],
  },
];

/* ============================================================================
   GRUPOS DEL MENÚ  —  las secciones del menú lateral, en el orden en que se
   muestran. `id` es el campo `grupo` de cada módulo. Las usan Sidebar.jsx y la
   pantalla de Tipos de usuario, así las dos agrupan igual.
   ============================================================================ */
export const GRUPOS = [
  { id: 'operativo', titulo: 'Oficina' },
  { id: 'campo', titulo: 'Campo' },
  { id: 'accesos', titulo: 'Accesos' },
  { id: 'herramientas', titulo: 'Herramientas' },
  { id: 'configuracion', titulo: 'Configuración' },
  { id: 'portal', titulo: 'Portal del titular' },
];

/* ============================================================================
   NIVELES DE ACCESO Y AYUDAS
   ----------------------------------------------------------------------------
   Todas reciben `permisos` (el objeto del store, puede venir undefined): son
   las diferencias que el administrador guardó desde Accesos. Si para un módulo
   y un rol no hay nada guardado, vale lo que dicen `roles` / `rolesEdicion`.

   Para cambiar el reparto POR DEFECTO se tocan los arrays de arriba. Para
   cambiarlo EN USO, sin programar, se usa Accesos → Tipos de usuario.
   ============================================================================ */

export const NIVELES = ['no', 'ver', 'editar'];

/* La forma de `permisos` en el store. Vacío = todo como lo trae el código. */
export const PERMISOS_VACIOS = { modulos: {}, rolesDeshabilitados: [] };

/* El rol de control total. Se puede deshabilitar como cualquier otro, pero
   nunca pierde Tipos de usuario (ver FIJOS): así siempre hay una puerta para
   deshacer cualquier cambio, incluso apagarlo a él mismo por error. */
export const ROL_ADMINISTRADOR = 'administrador';

/* El módulo que ningún ajuste puede quitarle a un rol, ni siquiera apagar el
   rol entero. Por eso en nivelAcceso() se mira ANTES que rolHabilitado(). */
const FIJOS = { [ROL_ADMINISTRADOR]: ['accesos'] };

export function esPermisoFijo(idModulo, rol) {
  return (FIJOS[rol] || []).includes(idModulo);
}

/* Un rol deshabilitado desde Accesos no ve ningún módulo, tenga lo que tenga
   guardado (salvo los FIJOS). Sus usuarios siguen existiendo: es un apagón del
   tipo de usuario, no una baja de las personas. */
export function rolHabilitado(rol, permisos) {
  return !(permisos?.rolesDeshabilitados ?? []).includes(rol);
}

/* ¿Este módulo distingue entre ver y modificar? Tablero, mapa y reportes son
   de consulta: no tienen `rolesEdicion` y no tiene sentido ofrecer la llave. */
export function admiteEdicion(modulo) {
  return Array.isArray(modulo.rolesEdicion);
}

/* Lo que trae el código para un módulo y un rol. */
export function nivelPorDefecto(modulo, rol) {
  // El administrador tiene todo, salvo el portal: esa es la vista del titular.
  if (rol === ROL_ADMINISTRADOR) {
    if (modulo.grupo === 'portal') return 'no';
    return admiteEdicion(modulo) ? 'editar' : 'ver';
  }
  if (!modulo.roles.includes(rol)) return 'no';
  return (modulo.rolesEdicion || []).includes(rol) ? 'editar' : 'ver';
}

/* Lo que rige: lo guardado desde Accesos, y si no hay nada, el código. */
export function nivelAcceso(modulo, rol, permisos) {
  if (esPermisoFijo(modulo.id, rol)) return 'editar';
  if (!rolHabilitado(rol, permisos)) return 'no';
  const guardado = permisos?.modulos?.[modulo.id]?.[rol];
  return NIVELES.includes(guardado) ? guardado : nivelPorDefecto(modulo, rol);
}

export function modulosPorRol(rol, permisos) {
  return MODULOS.filter((m) => nivelAcceso(m, rol, permisos) !== 'no');
}

export function modulosPorRolYGrupo(rol, grupo, permisos) {
  return MODULOS.filter((m) => m.grupo === grupo && nivelAcceso(m, rol, permisos) !== 'no');
}

export function puedeEditar(rol, idModulo, permisos) {
  const modulo = MODULOS.find((m) => m.id === idModulo);
  if (!modulo) return false;
  return nivelAcceso(modulo, rol, permisos) === 'editar';
}

export function puedeVerRuta(rol, ruta, permisos) {
  if (ruta === '/') return true;
  const modulo = MODULOS.find((m) => m.ruta === ruta);
  // Ruta sin módulo declarado (por ejemplo la ficha de un local, que se abre
  // desde el padrón): la controla el módulo del que depende, no esta tabla.
  if (!modulo) return true;
  return nivelAcceso(modulo, rol, permisos) !== 'no';
}

/* Una acción rápida se ofrece solo si el rol la tiene declarada Y todavía
   puede ver la pantalla de destino: si desde Accesos le quitaron el módulo, la
   tarjeta del Inicio desaparece con él. */
export function accionesRapidasPara(rol, permisos) {
  // El administrador ve las mismas acciones que los demás (ver el comentario
  // de ACCIONES_RAPIDAS), menos la del portal, que es del titular. Antes no
  // aparecía en ningún `roles` y entraba a un Inicio sin acciones.
  const seLeOfrece = (a) => (rol === ROL_ADMINISTRADOR ? a.id !== 'mis-locales' : a.roles.includes(rol));
  return ACCIONES_RAPIDAS.filter((a) => seLeOfrece(a) && puedeVerRuta(rol, a.ruta.split('?')[0], permisos));
}
