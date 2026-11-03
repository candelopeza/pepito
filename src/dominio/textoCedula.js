/* ============================================================================
   dominio/textoCedula.js  —  EL TEXTO DE UNA CÉDULA, LISTO PARA IMPRIMIR
   ----------------------------------------------------------------------------
   Toma la plantilla de Configuración → Plantilla de cédula y le pone los datos
   del local y de la notificación. Está acá, y no en la pantalla, porque lo
   usan dos lugares que tienen que imprimir exactamente lo mismo: la vista de
   una cédula (components/VistaCedula.jsx) y la impresión por lote
   (pages/Notificaciones.jsx).
   ============================================================================ */

import { fmtFecha } from './fechas.js';

/* Reemplaza {variable} por su valor. Si falta un dato deja el hueco marcado,
   así se ve en la vista previa antes de imprimir: un campo vacío en una cédula
   es un acto impugnable. */
function completar(plantilla, valores) {
  return plantilla.replace(/\{(\w+)\}/g, (_, clave) => {
    const v = valores[clave];
    return v === undefined || v === null || v === '' ? `«falta ${clave}»` : String(v);
  });
}

/* El texto de una cédula ya completado, y cuántos datos le faltan. Lo usan
   esta vista y la impresión por lote (pages/Notificaciones.jsx): las dos
   tienen que imprimir exactamente lo mismo. */
export function textoDeCedula(plantilla, cedula, local) {
  /* La PRIMERA cédula se emite con lo relevado en la calle: puede no tener
     todavía CUIT, razón social ni rubro (ver requiereDatosRegistrales en
     reglas.js). En esa instancia los huecos no la invalidan: van como "no
     informado" y se imprime igual. En la SEGUNDA sí son faltantes, porque esa
     cédula tiene que individualizar al sujeto obligado. */
  const primera = cedula.instancia === 1;
  const oNoInformado = (v) => (primera && (v === undefined || v === null || v === '') ? 'No informado' : v);
  const texto = completar(plantilla, {
    numeroCedula: cedula.numeroCedula,
    instanciaTexto: primera ? 'PRIMERA INTIMACIÓN' : 'SEGUNDA INTIMACIÓN',
    nombreLocal: local?.nombreLocal,
    razonSocial: oNoInformado(local?.razonSocial),
    cuit: oNoInformado(local?.cuit),
    direccion: local?.direccion,
    rubro: oNoInformado(local?.rubro),
    plazoDias: cedula.plazoDias,
    fechaEmision: fmtFecha(cedula.fecha),
  });
  return { texto, faltantes: (texto.match(/«falta \w+»/g) ?? []).length };
}
