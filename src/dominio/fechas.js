/* ============================================================================
   dominio/fechas.js  —  FECHAS Y CÓMPUTO DE DÍAS HÁBILES
   ----------------------------------------------------------------------------
   Sección 4.1 del pliego. Acá está la parte más delicada del sistema: de este
   cálculo depende que una intimación sea válida o impugnable.

   CONVENCIÓN DE TODO EL PROYECTO: las fechas se guardan y se pasan como TEXTO
   ISO corto 'AAAA-MM-DD'. Nada de objetos Date en el estado ni en el store.
   Motivos: se serializa sin sorpresas, se compara con < y >, y no arrastra
   husos horarios (el bug clásico de "se me corrió un día").
   Se convierte a Date solo para mostrar o para que la grilla ordene.

   PENDIENTE CON EL ÁREA LEGAL (Anexo B.2):
   si el día de la entrega cuenta como día uno o el plazo arranca al día
   siguiente. Está resuelto con el parámetro `contarDiaEntrega`, que sale de
   Configuración → Parámetros; hoy viene en false (arranca al día siguiente).
   ============================================================================ */

/* ------------------------------------------------------------------ básicos */

export function hoyISO() {
  return aISO(new Date());
}

/* Date -> 'AAAA-MM-DD'. Usa los getters locales, NO toISOString(): ese pasa a
   UTC y en Argentina (UTC-3) devuelve el día anterior antes de las 21 h. */
export function aISO(fecha) {
  if (!fecha) return '';
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return '';
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/* 'AAAA-MM-DD' -> Date local al mediodía. El mediodía evita que un cambio de
   horario de verano corra la fecha al día anterior. */
export function aFecha(iso) {
  if (!iso) return null;
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return null;
  return new Date(a, m - 1, d, 12, 0, 0);
}

/* Para mostrar en pantalla: 'AAAA-MM-DD' -> '15/03/2026' */
export function fmtFecha(iso) {
  const f = aFecha(iso);
  return f ? f.toLocaleDateString('es-AR') : '—';
}

export function fmtFechaHora(isoLargo) {
  if (!isoLargo) return '—';
  const d = new Date(isoLargo);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function sumarDias(iso, dias) {
  const f = aFecha(iso);
  if (!f) return '';
  f.setDate(f.getDate() + dias);
  return aISO(f);
}

/* Positivo = falta; 0 = es hoy; negativo = ya pasó. */
export function diasEntre(desdeISO, hastaISO) {
  const a = aFecha(desdeISO);
  const b = aFecha(hastaISO);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

/* --------------------------------------------------------------- calendario */

export function esFinDeSemana(iso) {
  const f = aFecha(iso);
  if (!f) return false;
  const dia = f.getDay();
  return dia === 0 || dia === 6;
}

/* `feriados` es la tabla administrable de Configuración → Feriados:
   [{ fecha: 'AAAA-MM-DD', motivo, alcance }] */
export function esFeriado(iso, feriados = []) {
  return feriados.some((f) => f.fecha === iso);
}

export function esHabil(iso, feriados = []) {
  return !esFinDeSemana(iso) && !esFeriado(iso, feriados);
}

/* ============================================================================
   EL CÁLCULO DEL PLAZO
   ----------------------------------------------------------------------------
   Devuelve la fecha de VENCIMIENTO: el último día hábil del plazo.

   desdeISO         fecha de ENTREGA EFECTIVA de la cédula (no la de emisión)
   dias             5 para la primera notificación, 3 para la segunda
   feriados         tabla de feriados
   contarDiaEntrega si es true, el día de la entrega es el día 1

   Ejemplo del criterio de aceptación (cap. 10): entregada un viernes con 5
   días hábiles y sin feriados en el medio -> vence el viernes siguiente.
   ============================================================================ */
export function vencimientoHabil(desdeISO, dias, feriados = [], contarDiaEntrega = false) {
  if (!desdeISO || !dias) return '';
  let cursor = desdeISO;
  let contados = 0;

  if (contarDiaEntrega && esHabil(cursor, feriados)) contados = 1;

  while (contados < dias) {
    cursor = sumarDias(cursor, 1);
    if (esHabil(cursor, feriados)) contados += 1;
  }
  return cursor;
}

/* El plazo se considera vencido a partir del día SIGUIENTE al vencimiento:
   el día del vencimiento el interesado todavía puede presentar. */
export function plazoVencido(vencimientoISO, refISO = hoyISO()) {
  if (!vencimientoISO) return false;
  return refISO > vencimientoISO;
}
