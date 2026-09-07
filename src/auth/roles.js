/* ============================================================================
   auth/roles.js  —  LOS ROLES DEL SISTEMA
   ----------------------------------------------------------------------------
   Capítulo 7 del pliego. QUÉ VE CADA ROL no se define acá: está en
   src/config/modulos.js. Acá solo existen los roles y cómo se llaman.

   >>> CAMBIO RESPECTO DE LA PRIMERA VERSIÓN DE LA MAQUETA <<<
   Antes había cuatro roles inventados (administrador, inspector, relevador,
   notificador). Ahora son los del pliego, que no son los mismos:

     antes                  ahora
     administrador   ->     coordinacion (operativo) + direccion (gobierno)
     inspector       ->     administrativo
     relevador       ->     relevador   (igual, pero SIN facultades de inspector)
     notificador     ->     notificador (igual)
     —               ->     titular     (nuevo: el portal del contribuyente)
     —               ->     sistema     (nuevo: los procesos automáticos)

   La distinción entre coordinación y dirección importa: coordinación resuelve
   el día a día (confirma exenciones, otorga prórrogas), dirección tiene lectura
   total y administra usuarios y plazos, pero no interviene en el circuito.

   Y "relevador" no es "inspector": el relevador NO puede pedirle datos
   registrales al comerciante, no tiene esa facultad. Por eso el formulario de
   campo no pide CUIT (sección 6.2).

   >>>>>>>>>>>>>>>>>>>>>>>>  ESTO NO ES SEGURIDAD  <<<<<<<<<<<<<<<<<<<<<<<<<<<
   Es solo la interfaz. Ocultar una tarjeta no impide que alguien entre: el
   código viaja entero al navegador. La restricción DE VERDAD va en el backend:
   cada endpoint tiene que validar el rol antes de responder.
   >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
   ============================================================================ */

export const ROLES = {
  relevador: {
    id: 'relevador',
    etiqueta: 'Relevador de campo',
    descripcion: 'Releva locales en territorio y los clasifica. No pide datos registrales: no tiene facultades de inspector.',
  },
  notificador: {
    id: 'notificador',
    etiqueta: 'Notificador',
    descripcion: 'Entrega las cédulas asignadas y registra el resultado con evidencia fotográfica.',
  },
  administrativo: {
    id: 'administrativo',
    etiqueta: 'Administrativo',
    descripcion: 'Completa datos registrales, emite notificaciones, carga documentación y expedientes.',
  },
  coordinacion: {
    id: 'coordinacion',
    etiqueta: 'Coordinación',
    descripcion: 'Controla relevamientos, confirma exenciones, asigna notificadores, otorga prórrogas y bloquea locales.',
  },
  direccion: {
    id: 'direccion',
    etiqueta: 'Dirección de Ambiente',
    descripcion: 'Lectura total, indicadores y administración de usuarios, plazos y catálogos.',
  },
  titular: {
    id: 'titular',
    etiqueta: 'Titular del local',
    descripcion: 'Accede por CiDiTuc solo a sus locales. Consulta su situación y presenta documentación.',
  },
};

export const LISTA_ROLES = Object.values(ROLES);

/* Arranca en coordinación: es el rol que ve la mayor parte del circuito y el
   más útil para mostrarle el sistema al área. */
export const ROL_POR_DEFECTO = ROLES.coordinacion.id;

export function esRolValido(rol) {
  return Object.prototype.hasOwnProperty.call(ROLES, rol);
}

/* El actor no humano de los procesos automáticos (sección 7.2). No es un rol
   de login: se usa para firmar las escrituras del sistema en la auditoría, y
   por eso queda fuera de LISTA_ROLES y del selector. */
export const ROL_SISTEMA = 'sistema';
