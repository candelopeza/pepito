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
    id: 'validaciones',
    titulo: 'Validar presentaciones',
    descripcion: 'Documentación que entró por el portal y espera aprobación',
    ruta: '/validaciones',
    grupo: 'operativo',
    roles: ['administrativo', 'coordinacion'],
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
  {
    id: 'geocodificacion',
    titulo: 'Geocodificación pendiente',
    descripcion: 'Locales sin ubicación: hay que corregir la dirección',
    ruta: '/herramientas/geocodificacion',
    grupo: 'herramientas',
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
    roles: ['direccion'],
    rolesEdicion: ['direccion'],
  },
  {
    id: 'config-rubros',
    titulo: 'Rubros',
    descripcion: 'Catálogo de rubros de los establecimientos',
    ruta: '/config/rubros',
    grupo: 'configuracion',
    roles: ['coordinacion', 'direccion'],
    rolesEdicion: ['coordinacion', 'direccion'],
  },
  {
    id: 'config-feriados',
    titulo: 'Feriados',
    descripcion: 'Calendario para el cómputo de días hábiles',
    ruta: '/config/feriados',
    grupo: 'configuracion',
    roles: ['coordinacion', 'direccion'],
    rolesEdicion: ['coordinacion', 'direccion'],
  },
  {
    id: 'config-plantilla',
    titulo: 'Plantilla de cédula',
    descripcion: 'Texto del documento de notificación',
    ruta: '/config/plantilla',
    grupo: 'configuracion',
    roles: ['coordinacion', 'direccion'],
    rolesEdicion: ['coordinacion', 'direccion'],
  },
  {
    id: 'config-parametros',
    titulo: 'Parámetros del sistema',
    descripcion: 'Plazos de notificación y criterios de cómputo',
    ruta: '/config/parametros',
    grupo: 'configuracion',
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
   AYUDAS  —  las usan Home, Sidebar y RutaProtegida. Para cambiar permisos no
   hace falta tocarlas: alcanza con los arrays de arriba.
   ============================================================================ */

export function modulosPorRol(rol) {
  return MODULOS.filter((m) => m.roles.includes(rol));
}

export function modulosPorRolYGrupo(rol, grupo) {
  return MODULOS.filter((m) => m.grupo === grupo && m.roles.includes(rol));
}

export function accionesRapidasPara(rol) {
  return ACCIONES_RAPIDAS.filter((a) => a.roles.includes(rol));
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
