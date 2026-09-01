/* ============================================================================
   config/catalogos.js  —  LAS LISTAS FIJAS DEL SISTEMA (rubros, estados)
   ----------------------------------------------------------------------------
   Son los valores que se pueden elegir en los desplegables de los formularios.
   Antes estaban escritos a mano adentro de los datos de prueba de cada página;
   acá están en un solo lugar, así el formulario y la tabla no se desalinean.

   >>> PROVISORIO <<<
   Cuando existan de verdad las pantallas de Configuración (Rubros, Sedes),
   estas listas van a salir de la base de datos, no de este archivo. Este es el
   lugar exacto que hay que reemplazar por la llamada al backend.

   SI HAY PROBLEMA ACÁ:
     - "Falta un rubro en el desplegable": agregalo al array RUBROS.
     - "Un estado sale con el badge gris": ese texto no está en ESTADOS_LOCAL.
       Ojo que la comparación es por TEXTO EXACTO, con tilde y mayúsculas
       incluidas ('En trámite' no es lo mismo que 'En tramite').
     - "Agregué un estado y no tiene color": además de sumarlo acá, el color
       tiene que existir como clase .badge-<color> en App.css sección 9.
   ============================================================================ */

// ===== A. RUBROS =====
// Orden alfabético para que el desplegable se lea cómodo.
export const RUBROS = [
  'Comercial',
  'Industrial',
  'Servicios',
];

// ===== B. ESTADOS DE UN LOCAL =====
// `id` es el texto que se guarda y se muestra.
// `color` tiene que coincidir con una clase .badge-<color> de App.css.
export const ESTADOS_LOCAL = [
  { id: 'Activo', color: 'verde' },
  { id: 'En trámite', color: 'naranja' },
];

// ===== C. TIPOS DE TRÁMITE =====
// Es el circuito administrativo. OJO: el ORDEN significa algo (1ra
// notificación -> 2da notificación -> revisión). No los mezcles sin
// confirmar con el área.
// Antes esto eran las 4 tarjetas de la pantalla de Trámites; ahora son los
// valores del desplegable "Tipo" y del filtro de esa columna.
export const TIPOS_TRAMITE = [
  'Primera Notificación',
  'Segunda Notificación',
  'Revisión de Documentación',
];

// ===== D. ESTADOS DE UN TRÁMITE =====
// Misma forma que ESTADOS_LOCAL: `color` tiene que existir como clase
// .badge-<color> en App.css sección 9.
export const ESTADOS_TRAMITE = [
  { id: 'Pendiente', color: 'azul' },
  { id: 'En curso', color: 'amarillo' },
  { id: 'Vencido', color: 'rojo' },
  { id: 'Finalizado', color: 'verde' },
];

// ===== E. AYUDA =====
// Devuelven el color de badge de un estado.
// Si el estado no está en la lista devuelven 'gris', que es un color real
// (existe .badge-gris). Antes, un estado desconocido dejaba el badge sin
// ningún color de fondo y parecía un error de la pantalla.
export function colorEstado(estado) {
  const encontrado = ESTADOS_LOCAL.find((e) => e.id === estado);
  return encontrado ? encontrado.color : 'gris';
}

export function colorEstadoTramite(estado) {
  const encontrado = ESTADOS_TRAMITE.find((e) => e.id === estado);
  return encontrado ? encontrado.color : 'gris';
}
