/* ============================================================================
   config/catalogos.js  —  LISTAS CORTAS QUE NO SON TABLAS
   ----------------------------------------------------------------------------
   Acá quedan solo los enumerados que son parte del DOMINIO y no se administran
   desde ninguna pantalla: la clasificación de un relevamiento es Gran Generador
   o Generador Menor y no hay una tercera opción posible.

   >>> LO QUE ANTES ESTABA ACÁ Y AHORA NO <<<
     RUBROS          -> es una tabla administrable: sale del store (`rubros`),
                        se edita en Configuración → Rubros. El pliego lo pide
                        explícitamente (sección 5.2): hoy en el sistema viejo es
                        una lista desplegable definida en la interfaz.
     ESTADOS_LOCAL   -> son los 24 estados de la máquina: dominio/estados.js
     TIPOS_TRAMITE   -> las notificaciones no son un catálogo, son actuaciones
                        con instancia 1 o 2: dominio/actuaciones.js

   Si buscás una lista y no está acá, mirá esos tres lugares antes de agregarla.
   ============================================================================ */

/* Lo único que carga el relevador sobre el criterio de fondo. Sección 2.3. */
export const CLASIFICACIONES = [
  {
    id: 'GRAN_GENERADOR',
    etiqueta: 'Gran Generador',
    descripcion: 'Produce residuos en volumen suficiente como para quedar excluido de la recolección domiciliaria común.',
    color: 'naranja',
  },
  {
    id: 'GENERADOR_MENOR',
    etiqueta: 'Generador Menor',
    descripcion: 'No alcanza ese umbral. Queda exento del circuito, sujeto a confirmación de coordinación.',
    color: 'azul',
  },
];

export function etiquetaClasificacion(id) {
  return CLASIFICACIONES.find((c) => c.id === id)?.etiqueta ?? id ?? '—';
}

export function colorClasificacion(id) {
  return CLASIFICACIONES.find((c) => c.id === id)?.color ?? 'gris';
}

/* Alcance de un feriado (sección 4.1): el calendario tiene que contemplar los
   tres niveles, porque un asueto municipal también suspende plazos. */
export const ALCANCES_FERIADO = [
  { id: 'nacional', etiqueta: 'Nacional' },
  { id: 'provincial', etiqueta: 'Provincial (Tucumán)' },
  { id: 'municipal', etiqueta: 'Asueto municipal' },
];

/* Resultado del control administrativo de un relevamiento (etapa 2). */
export const RESULTADOS_CONTROL = [
  { id: 'EXENTO_CONFIRMADO', etiqueta: 'Confirmar exención', ayuda: 'Cierra el recorrido del local. Es el único estado terminal.' },
  { id: 'GRAN_GENERADOR', etiqueta: 'Corregir: sí es Gran Generador', ayuda: 'Pasa directo a la emisión de la primera notificación.' },
  { id: 'HABILITADO', etiqueta: 'Habilitar notificación', ayuda: 'Datos registrales validados: entra en la cola de emisión.' },
];
