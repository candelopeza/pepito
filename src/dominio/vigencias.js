/* ============================================================================
   dominio/vigencias.js  —  VIGENCIA DE LA DOCUMENTACIÓN
   ----------------------------------------------------------------------------
   Sección 4.2 del pliego.

     Contrato        vence en la fecha declarada en el propio contrato
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
