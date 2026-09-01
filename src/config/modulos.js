/* ============================================================================
   config/modulos.js  —  *** LA TABLA DE PERMISOS ***
   ----------------------------------------------------------------------------
   ESTE ES EL ARCHIVO MÁS IMPORTANTE PARA "SECTORIZAR" POR TIPO DE USUARIO.
   Es el ÚNICO lugar donde se define qué módulo ve cada rol.

   Todo lo demás se arma solo a partir de esta lista:
       - las tarjetas del Inicio      (pages/Home.jsx)
       - los ítems del menú lateral   (components/Sidebar.jsx)
       - el bloqueo por URL           (components/RutaProtegida.jsx)
   O sea: si sacás un rol del array `roles` de un módulo, ese rol deja de ver
   la tarjeta, deja de ver el ítem del menú Y no puede entrar escribiendo la
   URL a mano. Los tres a la vez, tocando un solo renglón.

   ---------------------------------------------------------------------------
   CÓMO AGREGAR UN MÓDULO NUEVO (2 pasos, antes eran 3):
     1. sumar un objeto a este array
     2. sumar su <Route> en App.jsx
   La tarjeta y el ítem del menú aparecen solos.
   ---------------------------------------------------------------------------

   CAMPOS DE CADA MÓDULO:
     id          identificador interno, no se muestra
     titulo      texto de la tarjeta y del menú
     descripcion bajada de la tarjeta del Inicio (el menú no la usa)
     ruta        tiene que coincidir EXACTO con el path de App.jsx
     grupo       'operativo' | 'configuracion'  -> en qué parte del menú va
     enInicio    si true, además sale como tarjeta en el Inicio
     roles       QUIÉNES LO VEN. Lista de ids de src/auth/roles.js
     rolesEdicion  QUIÉNES PUEDEN MODIFICAR (opcional). Ver o modificar son
                 dos permisos distintos: casi todos ven el padrón de locales,
                 pero no cualquiera debería poder cambiarlo.
                 Si el campo no está, NADIE edita: hay que declararlo a mano.
                 Tiene que ser un subconjunto de `roles` (no se puede editar
                 algo que no se ve); puedeEditar() lo verifica igual.

   ============================================================================
   >>> OJO: EL REPARTO DE ABAJO ES UNA PROPUESTA, NO ESTÁ CONFIRMADO <<<
   Lo armé según lo que sugiere el nombre de cada rol. HAY QUE VALIDARLO CON
   EL ÁREA antes de darlo por bueno. Para corregirlo no hace falta programar:
   se agrega o se saca el nombre del rol del array `roles`, y listo.

   Resumen de la propuesta:

     MÓDULO           ADMIN  INSPECTOR  RELEVADOR  NOTIFICADOR
     Locales            SI      SI         SI          SI
     Relevamientos      SI      SI         SI          --
     Trámites           SI      SI         --          SI
     Documentación      SI      SI         --          --
     Expedientes        SI      --         --          --
     Seguimiento        SI      SI         --          SI
     Config: Rubros     SI      --         --          --
     Config: Sedes      SI      --         --          --

   El criterio que usé:
     - Locales lo ven todos: es el padrón, todos necesitan ubicar el
       establecimiento con el que están trabajando.
     - El relevador es el más acotado: sale a la calle a cargar relevamientos,
       no interviene en el circuito administrativo posterior.
     - El notificador entrega notificaciones y controla plazos, por eso ve
       Trámites y Seguimiento, pero no la documentación ni los expedientes.
     - El inspector revisa documentación, pero NO ve expedientes: el
       expediente es la instancia formal y quedó como tarea del administrador.
       >>> ESTE ES EL PUNTO MÁS DUDOSO DE TODOS, PREGUNTARLO. <<<
     - Configuración es solo del administrador: son tablas maestras y tocarlas
       afecta a todo el sistema.
   ============================================================================ */

export const MODULOS = [

  /* ===================== GRUPO: OPERATIVO ===================== */

  {
    id: 'locales',
    titulo: 'Locales',
    descripcion: 'Consultar y administrar los establecimientos registrados',
    ruta: '/locales',
    grupo: 'operativo',
    enInicio: true,
    // Todos: es el padrón base del sistema.
    roles: ['administrador', 'inspector', 'relevador', 'notificador'],
    // >>> CONFIRMAR CON EL ÁREA <<<
    // Lo dejé solo para administrador porque el padrón es dato maestro: si un
    // relevador corrige un CUIT desde la calle, no queda registro de quién lo
    // cambió ni por qué. Si el área decide que el inspector también carga
    // datos, se agrega 'inspector' a esta línea y listo.
    rolesEdicion: ['administrador'],
  },
  {
    id: 'relevamientos',
    titulo: 'Relevamientos',
    descripcion: 'Registrar y consultar los relevamientos realizados',
    ruta: '/relevamientos',
    grupo: 'operativo',
    enInicio: true,
    // El notificador no releva: no le corresponde.
    roles: ['administrador', 'inspector', 'relevador'],
  },
  {
    id: 'tramites',
    titulo: 'Trámites',
    descripcion: 'Gestionar notificaciones, revisiones y actuaciones',
    ruta: '/tramites',
    grupo: 'operativo',
    enInicio: true,
    // El relevador queda afuera del circuito administrativo.
    roles: ['administrador', 'inspector', 'notificador'],
  },
  {
    id: 'documentacion',
    titulo: 'Documentación',
    descripcion: 'DDJJ, contratos y documentación presentada',
    ruta: '/documentacion',
    grupo: 'operativo',
    enInicio: true,
    // Solo quien revisa documentación.
    roles: ['administrador', 'inspector'],
  },
  {
    id: 'expedientes',
    titulo: 'Expedientes',
    descripcion: 'Consultar y seguir los expedientes generados',
    ruta: '/expedientes',
    grupo: 'operativo',
    enInicio: true,
    // PREGUNTAR: ¿el inspector debería ver los expedientes? Hoy no los ve.
    roles: ['administrador'],
  },
  {
    id: 'seguimiento',
    titulo: 'Seguimiento',
    descripcion: 'Pendientes, vencimientos y acciones que requieren intervención',
    ruta: '/seguimiento',
    grupo: 'operativo',
    enInicio: true,
    // Quienes tienen plazos que cumplir.
    roles: ['administrador', 'inspector', 'notificador'],
  },

  /* ===================== GRUPO: CONFIGURACIÓN =====================
     Tablas maestras. A propósito NO salen como tarjeta en el Inicio
     (enInicio: false): viven solo en el menú lateral. */

  {
    id: 'config-rubros',
    titulo: 'Rubros',
    descripcion: 'Rubros de los establecimientos',
    ruta: '/config/rubros',
    grupo: 'configuracion',
    enInicio: false,
    roles: ['administrador'],
  },
  {
    id: 'config-sedes',
    titulo: 'Sedes',
    descripcion: 'Sedes del sistema',
    ruta: '/config/sedes',
    grupo: 'configuracion',
    enInicio: false,
    roles: ['administrador'],
  },
];


/* ============================================================================
   AYUDAS  —  las usan Home, Sidebar y RutaProtegida. No hace falta tocarlas
   para cambiar permisos: para eso alcanza con el array de arriba.
   ============================================================================ */

// Todos los módulos que le corresponden a un rol.
export function modulosPorRol(rol) {
  return MODULOS.filter((m) => m.roles.includes(rol));
}

// Los módulos de un grupo ('operativo' | 'configuracion') para ese rol.
// El menú lateral llama a esto una vez por grupo.
export function modulosPorRolYGrupo(rol, grupo) {
  return MODULOS.filter((m) => m.grupo === grupo && m.roles.includes(rol));
}

// Las tarjetas del Inicio: solo las marcadas con enInicio.
export function modulosDeInicio(rol) {
  return MODULOS.filter((m) => m.enInicio && m.roles.includes(rol));
}

// ¿Este rol puede MODIFICAR los datos de este módulo?
// Lo usan las pantallas para mostrar u ocultar los botones de editar.
//
// Dos reglas defensivas:
//   1. Sin `rolesEdicion` declarado, nadie edita. Preferí que agregar un
//      módulo nuevo lo deje de solo lectura por olvido, y no editable por
//      todos por olvido.
//   2. Exige TAMBIÉN estar en `roles`: no se puede editar lo que no se ve,
//      aunque alguien se equivoque y ponga un rol de más en rolesEdicion.
export function puedeEditar(rol, idModulo) {
  const modulo = MODULOS.find((m) => m.id === idModulo);
  if (!modulo) return false;
  if (!modulo.roles.includes(rol)) return false;
  return (modulo.rolesEdicion || []).includes(rol);
}

// ¿Este rol puede entrar a esta URL? Lo usa RutaProtegida.
// El Inicio ('/') siempre está permitido: es la pantalla de aterrizaje y no
// muestra nada que el rol no pueda ver (sus tarjetas ya vienen filtradas).
export function puedeVerRuta(rol, ruta) {
  if (ruta === '/') return true;
  const modulo = MODULOS.find((m) => m.ruta === ruta);
  // Si la ruta no está en la tabla, no la bloqueamos: puede ser una pantalla
  // interna (un detalle, un formulario) que todavía no se registró acá.
  if (!modulo) return true;
  return modulo.roles.includes(rol);
}
