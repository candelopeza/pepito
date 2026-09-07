/* ============================================================================
   config/modulos.js  —  *** LA TABLA DE PERMISOS ***
   ----------------------------------------------------------------------------
   ES EL ÚNICO LUGAR donde se define qué módulo ve cada rol. Todo lo demás se
   arma solo a partir de esta lista:
       - las tarjetas del Inicio      (pages/Home.jsx)
       - los ítems del menú lateral   (components/Sidebar.jsx)
       - el bloqueo por URL           (components/RutaProtegida.jsx)

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
     enInicio      si además sale como tarjeta en el Inicio
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
     Config: usuarios           ·      ·      ·      ·      SI      ·
     Config: rubros             ·      ·      ·      SI     SI      ·
     Config: feriados           ·      ·      ·      SI     SI      ·
     Config: plantilla cédula   ·      ·      ·      SI     SI      ·
     Config: parámetros         ·      ·      ·      ·      SI      ·
     Portal del titular         ·      ·      ·      ·      ·       SI

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
    enInicio: true,
    roles: ['administrativo', 'coordinacion', 'direccion'],
  },
  {
    id: 'locales',
    titulo: 'Padrón de locales',
    descripcion: 'Consultar y administrar los establecimientos registrados',
    ruta: '/locales',
    grupo: 'operativo',
    enInicio: true,
    roles: ['relevador', 'notificador', 'administrativo', 'coordinacion', 'direccion'],
    rolesEdicion: ['administrativo', 'coordinacion'],
  },
  {
    id: 'relevamientos',
    titulo: 'Relevamientos',
    descripcion: 'Cargar relevamientos de campo y controlar los pendientes',
    ruta: '/relevamientos',
    grupo: 'operativo',
    enInicio: true,
    roles: ['relevador', 'administrativo', 'coordinacion', 'direccion'],
    rolesEdicion: ['relevador', 'coordinacion'],
  },
  {
    id: 'notificaciones',
    titulo: 'Notificaciones',
    descripcion: 'Emitir cédulas, asignar notificadores y armar la hoja de ruta',
    ruta: '/notificaciones',
    grupo: 'operativo',
    enInicio: true,
    roles: ['administrativo', 'coordinacion', 'direccion'],
    rolesEdicion: ['administrativo', 'coordinacion'],
  },
  {
    id: 'documentacion',
    titulo: 'Documentación',
    descripcion: 'DDJJ, DDJJ de reciclaje y contratos presentados',
    ruta: '/documentacion',
    grupo: 'operativo',
    enInicio: true,
    roles: ['administrativo', 'coordinacion', 'direccion'],
    rolesEdicion: ['administrativo', 'coordinacion'],
  },
  {
    id: 'validaciones',
    titulo: 'Validar presentaciones',
    descripcion: 'Documentación que entró por el portal y espera aprobación',
    ruta: '/validaciones',
    grupo: 'operativo',
    enInicio: true,
    roles: ['administrativo', 'coordinacion'],
    rolesEdicion: ['administrativo', 'coordinacion'],
  },
  {
    id: 'prorrogas',
    titulo: 'Prórrogas',
    descripcion: 'Prórrogas otorgadas y solicitudes pendientes',
    ruta: '/prorrogas',
    grupo: 'operativo',
    enInicio: true,
    roles: ['administrativo', 'coordinacion', 'direccion'],
    rolesEdicion: ['coordinacion'],
  },
  {
    id: 'expedientes',
    titulo: 'Expedientes',
    descripcion: 'Expedientes de multa: generación y seguimiento',
    ruta: '/expedientes',
    grupo: 'operativo',
    enInicio: true,
    roles: ['administrativo', 'coordinacion', 'direccion'],
    rolesEdicion: ['administrativo', 'coordinacion'],
  },
  {
    id: 'mapa',
    titulo: 'Mapa',
    descripcion: 'Los locales del padrón en el territorio, por estado',
    ruta: '/mapa',
    grupo: 'operativo',
    enInicio: true,
    roles: ['relevador', 'notificador', 'administrativo', 'coordinacion', 'direccion'],
  },
  {
    id: 'reportes',
    titulo: 'Reportes e indicadores',
    descripcion: 'Métricas de gestión y producción por agente',
    ruta: '/reportes',
    grupo: 'operativo',
    enInicio: true,
    roles: ['coordinacion', 'direccion'],
  },

  /* ===================== CAMPO ===================== */
  {
    id: 'relevar',
    titulo: 'Relevar un local',
    descripcion: 'Formulario de campo. Funciona sin conexión.',
    ruta: '/campo/relevar',
    grupo: 'campo',
    enInicio: true,
    roles: ['relevador', 'coordinacion'],
    rolesEdicion: ['relevador', 'coordinacion'],
  },
  {
    id: 'entregas',
    titulo: 'Mis entregas',
    descripcion: 'Cédulas asignadas y registro del resultado de la entrega',
    ruta: '/campo/entregas',
    grupo: 'campo',
    enInicio: true,
    roles: ['notificador', 'coordinacion'],
    rolesEdicion: ['notificador', 'coordinacion'],
  },

  /* ===================== HERRAMIENTAS ===================== */
  {
    id: 'duplicados',
    titulo: 'Duplicados',
    descripcion: 'Detectar y unificar locales cargados más de una vez',
    ruta: '/herramientas/duplicados',
    grupo: 'herramientas',
    enInicio: false,
    roles: ['coordinacion'],
    rolesEdicion: ['coordinacion'],
  },
  {
    id: 'informe-9dj',
    titulo: 'Informe 9 de Julio',
    descripcion: 'Carga asistida del listado de contratos de la prestataria',
    ruta: '/herramientas/informe-9dj',
    grupo: 'herramientas',
    enInicio: false,
    roles: ['administrativo', 'coordinacion'],
    rolesEdicion: ['administrativo', 'coordinacion'],
  },
  {
    id: 'geocodificacion',
    titulo: 'Geocodificación pendiente',
    descripcion: 'Locales sin ubicación: hay que corregir la dirección',
    ruta: '/herramientas/geocodificacion',
    grupo: 'herramientas',
    enInicio: false,
    roles: ['administrativo', 'coordinacion'],
    rolesEdicion: ['administrativo', 'coordinacion'],
  },

  /* ===================== CONFIGURACIÓN ===================== */
  {
    id: 'config-usuarios',
    titulo: 'Usuarios y roles',
    descripcion: 'Alta, baja y rol de los agentes',
    ruta: '/config/usuarios',
    grupo: 'configuracion',
    enInicio: false,
    roles: ['direccion'],
    rolesEdicion: ['direccion'],
  },
  {
    id: 'config-rubros',
    titulo: 'Rubros',
    descripcion: 'Catálogo de rubros de los establecimientos',
    ruta: '/config/rubros',
    grupo: 'configuracion',
    enInicio: false,
    roles: ['coordinacion', 'direccion'],
    rolesEdicion: ['coordinacion', 'direccion'],
  },
  {
    id: 'config-feriados',
    titulo: 'Feriados',
    descripcion: 'Calendario para el cómputo de días hábiles',
    ruta: '/config/feriados',
    grupo: 'configuracion',
    enInicio: false,
    roles: ['coordinacion', 'direccion'],
    rolesEdicion: ['coordinacion', 'direccion'],
  },
  {
    id: 'config-plantilla',
    titulo: 'Plantilla de cédula',
    descripcion: 'Texto del documento de notificación',
    ruta: '/config/plantilla',
    grupo: 'configuracion',
    enInicio: false,
    roles: ['coordinacion', 'direccion'],
    rolesEdicion: ['coordinacion', 'direccion'],
  },
  {
    id: 'config-parametros',
    titulo: 'Parámetros del sistema',
    descripcion: 'Plazos de notificación y criterios de cómputo',
    ruta: '/config/parametros',
    grupo: 'configuracion',
    enInicio: false,
    roles: ['direccion'],
    rolesEdicion: ['direccion'],
  },

  /* ===================== PORTAL DEL TITULAR ===================== */
  {
    id: 'portal',
    titulo: 'Mis locales',
    descripcion: 'Situación de tus establecimientos y presentación de documentación',
    ruta: '/portal',
    grupo: 'portal',
    enInicio: true,
    roles: ['titular'],
    rolesEdicion: ['titular'],
  },
];

/* ============================================================================
   AYUDAS  —  las usan Home, Sidebar y RutaProtegida. Para cambiar permisos no
   hace falta tocarlas: alcanza con el array de arriba.
   ============================================================================ */

export function modulosPorRol(rol) {
  return MODULOS.filter((m) => m.roles.includes(rol));
}

export function modulosPorRolYGrupo(rol, grupo) {
  return MODULOS.filter((m) => m.grupo === grupo && m.roles.includes(rol));
}

export function modulosDeInicio(rol) {
  return MODULOS.filter((m) => m.enInicio && m.roles.includes(rol));
}

export function puedeEditar(rol, idModulo) {
  const modulo = MODULOS.find((m) => m.id === idModulo);
  if (!modulo) return false;
  if (!modulo.roles.includes(rol)) return false;
  return (modulo.rolesEdicion || []).includes(rol);
}

export function puedeVerRuta(rol, ruta) {
  if (ruta === '/') return true;
  const modulo = MODULOS.find((m) => m.ruta === ruta);
  // Ruta sin módulo declarado (por ejemplo la ficha de un local, que se abre
  // desde el padrón): la controla el módulo del que depende, no esta tabla.
  if (!modulo) return true;
  return modulo.roles.includes(rol);
}
