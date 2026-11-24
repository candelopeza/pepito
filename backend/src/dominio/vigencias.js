/* ============================================================================
   dominio/vigencias.js  —  VIGENCIA DE LA DOCUMENTACIÓN
   ----------------------------------------------------------------------------
   Sección 4.2 del pliego.

     Contrato cargado por la oficina
                     vence en la fecha declarada en el propio contrato
     Contrato informado por 9 de Julio
                     vence en la fecha que dice el informe
     Contrato presentado por el titular (portal)
                     UN MES desde que coordinación lo aprueba (pedido del
                     4/11/2026). Es un puente: a partir de ahí la prestataria
                     confirma mes a mes, con su informe, si el local sigue
                     teniendo contrato. Un contrato que el informe siguiente
                     no trae, no se renueva.
     DDJJ            un año calendario exacto desde la emisión
     DDJJ Reciclaje  ídem

   DOS REGLAS QUE NO SE PUEDEN CAMBIAR SIN HABLARLO:

   1. EL DÍA DEL VENCIMIENTO EL DOCUMENTO YA NO ESTÁ VIGENTE.
      Criterio de aceptación: "Una DDJJ emitida el 15 de marzo vence el 15 de
      marzo del año siguiente: ese día el local ya no está vigente."
      Por eso estaVigente() compara con < y no con <=.

   2. EL VENCIMIENTO SE CALCULA UNA VEZ Y SE GUARDA (vencimiento materializado,
      sección 5.2). Nunca se recalcula al consultar: si mañana cambia la regla,
      los documentos viejos tienen que seguir mostrando el plazo que se les
      aplicó cuando se registraron.

   PENDIENTE CON EL ÁREA LEGAL (Anexo B.2): el 29 de febrero. Una DDJJ emitida
   ese día, ¿vence el 28/02 o el 01/03? Está resuelto con el parámetro
   `modoBisiesto` de Configuración → Parámetros. El sistema viejo devolvía una
   fecha inválida que el motor corregía solo, de forma impredecible.
   ============================================================================ */

import { aFecha, aISO, hoyISO } from './fechas.js';

/* Un año calendario exacto. modoBisiesto: '28-feb' | '01-mar' */
export function vencimientoAnual(fechaEmisionISO, modoBisiesto = '01-mar') {
  const f = aFecha(fechaEmisionISO);
  if (!f) return '';

  const dia = f.getDate();
  const mes = f.getMonth();

  // Caso 29 de febrero: el año siguiente no existe ese día.
  if (mes === 1 && dia === 29) {
    const anio = f.getFullYear() + 1;
    return modoBisiesto === '28-feb' ? `${anio}-02-28` : `${anio}-03-01`;
  }

  return aISO(new Date(f.getFullYear() + 1, mes, dia, 12, 0, 0));
}

/* Un mes calendario: el mismo día del mes siguiente. Si ese día no existe
   (31/01 → febrero), el último día del mes siguiente. Aprobado el 4/11 vence
   el 4/12; aprobado el 31/01 vence el 28/02 (29 en bisiesto). Ese día, como
   siempre, ya no está vigente (regla 1). */
export function vencimientoMensual(fechaISO) {
  const f = aFecha(fechaISO);
  if (!f) return '';
  const anio = f.getFullYear();
  const mes = f.getMonth() + 1; // el mes siguiente, en base 0
  const ultimoDiaDelSiguiente = new Date(anio, mes + 1, 0, 12, 0, 0).getDate();
  return aISO(new Date(anio, mes, Math.min(f.getDate(), ultimoDiaDelSiguiente), 12, 0, 0));
}

/* Vigente = todavía NO llegó el día del vencimiento. Ver regla 1 de arriba. */
export function estaVigente(fechaVencimientoISO, refISO = hoyISO()) {
  if (!fechaVencimientoISO) return false;
  return refISO < fechaVencimientoISO;
}

/* Calcula el vencimiento según el tipo de documento.
   El contrato es el único que trae su fecha de afuera. */
export function vencimientoDocumento({ tipo, fechaEmision, fechaVencimiento }, modoBisiesto) {
  if (tipo === 'CONTRATO') return fechaVencimiento || '';
  return vencimientoAnual(fechaEmision, modoBisiesto);
}
