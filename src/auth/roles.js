/* ============================================================================
   auth/roles.js  —  LOS 4 TIPOS DE USUARIO DEL SISTEMA
   ----------------------------------------------------------------------------
   Acá SOLO se definen los roles que existen y cómo se llaman en pantalla.
   QUÉ VE CADA ROL no se define acá -> eso está en src/config/modulos.js

   >>>>>>>>>>>>>>>>>>>>>>>>  LEER ESTO  <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
   ESTO NO ES SEGURIDAD. Es solo la interfaz.
   Ocultar una tarjeta en el navegador NO impide que alguien entre: basta con
   escribir la URL a mano o mirar el código, que viaja entero al navegador.
   La restricción DE VERDAD tiene que estar en el backend: cada endpoint debe
   validar el rol del usuario antes de responder. Mientras no haya backend,
   esto sirve para ordenar la pantalla y mostrar la idea al área, nada más.
   >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

   SI HAY PROBLEMA ACÁ:
     - "Agregué un rol y no aparece en el selector": tiene que estar en este
       objeto ROLES. El selector se arma solo a partir de acá.
     - "Agregué un rol y no ve NADA": falta sumarlo a los `roles` de cada
       módulo en src/config/modulos.js. Un rol nuevo arranca sin permisos.
   ============================================================================ */

// ===== A. LOS ROLES =====
// La clave (administrador, inspector, ...) es el ID que se usa en el código.
// `etiqueta` es lo único que ve el usuario en pantalla.
export const ROLES = {
  administrador: {
    id: 'administrador',
    etiqueta: 'Administrador',
    descripcion: 'Acceso total, incluida la configuración del sistema.',
  },
  inspector: {
    id: 'inspector',
    etiqueta: 'Inspector',
    descripcion: 'Inspecciona locales y revisa la documentación presentada.',
  },
  relevador: {
    id: 'relevador',
    etiqueta: 'Relevador',
    descripcion: 'Carga relevamientos en calle. Es el rol más acotado.',
  },
  notificador: {
    id: 'notificador',
    etiqueta: 'Notificador',
    descripcion: 'Entrega notificaciones y sigue los plazos de los trámites.',
  },
};

// ===== B. LISTA PARA RECORRER =====
// El selector de la navbar hace un .map() sobre esto.
export const LISTA_ROLES = Object.values(ROLES);

// ===== C. ROL POR DEFECTO =====
// Con qué rol arranca la app hasta que exista login.
// Está en 'administrador' para que nadie se quede sin ver nada por accidente.
export const ROL_POR_DEFECTO = ROLES.administrador.id;

// ===== D. AYUDA =====
// Devuelve true si el texto que le pasan es un rol que realmente existe.
// Sirve para no romper la app si llega un rol inventado (de una URL, de un
// localStorage viejo, o del backend el día de mañana).
export function esRolValido(rol) {
  return Object.prototype.hasOwnProperty.call(ROLES, rol);
}
