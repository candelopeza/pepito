/* ============================================================================
   dominio/actuaciones.js  —  TIPOS DE ACTO ADMINISTRATIVO
   ----------------------------------------------------------------------------
   Una ACTUACIÓN es todo acto registrado sobre un local. Es la tabla de eventos
   del sistema (sección 5.1) y la fuente de verdad del estado: el estado NO se
   escribe a mano, se deduce del historial de actuaciones (ver reglas.js).

   [NO PORTAR] El sistema viejo guardaba todo en una única tabla de 44 columnas
   con seis bloques mutuamente excluyentes. Acá cada actuación lleva solo los
   campos de su tipo. La vista unificada del historial se arma en pantalla
   (pages/LocalFicha.jsx), que es donde corresponde.

   FORMA DE UNA ACTUACIÓN
     comunes:      id, localId, tipo, fecha (ISO), usuario, observaciones
     NOTIFICACION: instancia (1|2), numeroCedula, notificadorId, fechaEntrega,
                   plazoDias, fechaVencimiento, resultado, evidencia,
                   impresaPor, impresaEn
     DDJJ / DDJJ_RECICLAJE / CONTRATO:
                   numero, fechaEmision, fechaVencimiento, origen,
                   expedienteTramite, archivo, validado
     EXPEDIENTE:   numeroExpediente
     PRORROGA:     diasOtorgados, fechaVencimiento, motivo
   ============================================================================ */

export const TIPOS_ACTUACION = {
  NOTIFICACION:   { etiqueta: 'Notificación',    color: 'azul' },
  DDJJ:           { etiqueta: 'Declaración Jurada', color: 'verde' },
  DDJJ_RECICLAJE: { etiqueta: 'DDJJ Reciclaje',  color: 'verde' },
  CONTRATO:       { etiqueta: 'Contrato',        color: 'verde' },
  PRORROGA:       { etiqueta: 'Prórroga',        color: 'amarillo' },
  EXPEDIENTE:     { etiqueta: 'Expediente de multa', color: 'rojo' },
};

export const TIPOS_DOCUMENTO = ['DDJJ', 'DDJJ_RECICLAJE', 'CONTRATO'];

export const ETIQUETA_DOCUMENTO = {
  DDJJ: 'Declaración Jurada',
  DDJJ_RECICLAJE: 'DDJJ de Reciclaje',
  CONTRATO: 'Contrato de recolección',
};

/* Resultado de la entrega de una cédula. `corre` indica si hace correr el
   plazo: sin notificación fehaciente no hay avance (garantía de debido
   proceso, condición 6 de la sección 4.3). */
export const RESULTADOS_ENTREGA = [
  { id: 'ENTREGADA',     etiqueta: 'Entregada en mano con firma', corre: true,  color: 'verde' },
  { id: 'SIN_FIRMA',     etiqueta: 'Entregada sin firma',         corre: true,  color: 'verde' },
  { id: 'FIJADA',        etiqueta: 'Fijada en el domicilio',      corre: true,  color: 'verde' },
  { id: 'NO_ENTREGADA',  etiqueta: 'No entregada',                corre: false, color: 'rojo' },
];

export function resultadoEntrega(id) {
  return RESULTADOS_ENTREGA.find((r) => r.id === id) ?? null;
}

/* ¿Este resultado hace correr el plazo? */
export function correPlazo(resultado) {
  return Boolean(resultadoEntrega(resultado)?.corre);
}

/* ¿Constan las DOS notificaciones con entrega efectiva en el ciclo actual?
   Es la condición del debido proceso para el expediente de multa. Mismo
   criterio que constaEntrega() de backend/rutas/prorrogas-expedientes.js: una
   notificación sin resultado conocido pero con fecha de entrega también
   cuenta (datos que vienen de AppSheet). Si los dos dijeran cosas distintas,
   un local podría quedar sin expediente y sin "Volver a notificar". */
export function dosEntregasEfectivas(actuaciones) {
  const ciclo = Math.max(1, ...actuaciones.map((a) => Number(a.ciclo) || 1));
  const consta = (n) =>
    actuaciones.some(
      (a) =>
        a.tipo === 'NOTIFICACION' &&
        a.instancia === n &&
        (Number(a.ciclo) || 1) === ciclo &&
        (['ENTREGADA', 'SIN_FIRMA', 'FIJADA'].includes(a.resultado) || (!a.resultado && a.fechaEntrega)),
    );
  return consta(1) && consta(2);
}

/* ============================================================================
   NÚMERO DE CÉDULA
   ----------------------------------------------------------------------------
   Formato único y único lugar donde se arma: prefijo + 6 dígitos con ceros a
   la izquierda -> CED-001275. Lo necesitan tres partes del sistema (la emisión,
   la regeneración y el formulario de entrega), y si cada una lo armara por su
   cuenta bastaría un padStart distinto para que dejaran de coincidir.

   >>> EL NOTIFICADOR ESCRIBE SOLO EL NÚMERO <<<
   En el papel dice CED-001275; en el campo alcanza con escribir 1275. El
   prefijo y los ceros los completa el sistema (completarNumeroCedula). Pedirle
   tipear "CED-" y contar ceros en la calle, con el celular en una mano, es
   pedir errores de carga en el dato que después se usa para impugnar.
   ============================================================================ */

export const PREFIJO_CEDULA = 'CED-';
export const DIGITOS_CEDULA = 6;

/* 1275 -> 'CED-001275'. Es la forma oficial del número. */
export function numeroCedula(numero) {
  return `${PREFIJO_CEDULA}${String(numero).padStart(DIGITOS_CEDULA, '0')}`;
}

/* Se queda con los dígitos y descarta todo lo demás, así da igual si pegaron
   'CED-001275', escribieron 'ced 1275' o tipearon 1275. Recorta a los últimos
   DIGITOS_CEDULA para que un pegado con basura adelante no arme un número de
   ocho cifras que nunca va a coincidir con nada. */
export function digitosCedula(entrada) {
  return String(entrada ?? '').replace(/\D/g, '').slice(-DIGITOS_CEDULA);
}

/* '1275' -> 'CED-001275'. Cadena vacía si no vino ningún dígito. */
export function completarNumeroCedula(entrada) {
  const digitos = digitosCedula(entrada);
  return digitos ? numeroCedula(digitos) : '';
}

/* ¿Son el mismo número? Compara la parte numérica: '1275', '001275' y
   'CED-001275' son la misma cédula. Lo vacío no coincide con nada.

   Con el formato de la base del área (SERIE-CORRELATIVO, '0001-675') compara
   el CORRELATIVO, lo que va después del guion: '675' y '0001-675' son la
   misma cédula. Antes se juntaban todos los dígitos ('0001675' = 1675) y el
   notificador que escribía 675 recibía "no coincide". */
function correlativo(numero) {
  const texto = String(numero ?? '');
  const conSerie = texto.match(/-(\d+)\s*$/);
  return conSerie ? conSerie[1] : digitosCedula(texto);
}

export function mismoNumeroCedula(a, b) {
  const da = correlativo(a);
  const db = correlativo(b);
  return Boolean(da) && Boolean(db) && Number(da) === Number(db);
}

/* Lo que escribió el notificador, armado con el MISMO formato que la cédula
   de referencia, para mostrarle debajo del campo cómo quedó:
     referencia '0001-675', escribe 675  -> '0001-675'
     referencia 'CED-001275', escribe 1275 -> 'CED-001275'
   Cadena vacía si no escribió ningún dígito. */
export function armarNumeroCedula(entrada, referencia) {
  const digitos = String(entrada ?? '').replace(/\D/g, '');
  if (!digitos) return '';
  const serie = String(referencia ?? '').match(/^(\d+)-\d+$/);
  if (serie) return `${serie[1]}-${Number(digitos)}`;
  return completarNumeroCedula(entrada);
}

/* Quién cargó el documento. Lo decide el backend según el rol del que lo
   registra: el titular desde el portal, un agente desde Documentación o la
   ficha, o el módulo del informe de la prestataria. */
export const ORIGENES_DOCUMENTO = [
  { id: 'PRESENTADO_TITULAR', etiqueta: 'Presentado por el titular' },
  { id: 'CARGADO_OFICINA',    etiqueta: 'Cargado por la oficina' },
  { id: 'INFORME_9DJ',        etiqueta: 'Informado por 9 de Julio' },
];

export const ETIQUETA_ORIGEN = Object.fromEntries(ORIGENES_DOCUMENTO.map((o) => [o.id, o.etiqueta]));

/* La frecuencia de recolección del contrato (documentacion.frecuencia_semanal,
   sql/13): veces por semana que pasa la prestataria. La carga coordinación en
   Herramientas → Informe 9 de Julio. 7 es todos los días. */
export const FRECUENCIAS_SEMANALES = [1, 2, 3, 4, 5, 6, 7];
export function textoFrecuencia(n) {
  if (!n) return '';
  if (n === 7) return 'Todos los días';
  return n === 1 ? '1 vez por semana' : `${n} veces por semana`;
}

/* ---------------------------------------------------------------- consultas
   [NO PORTAR] El sistema viejo determinaba "la más reciente" por el orden
   físico de las filas de la planilla: cualquier inserción rompía el cálculo en
   silencio. Acá se ordena por fecha y, si empatan, por id (que es secuencial).
   -------------------------------------------------------------------------- */

export function ordenarCronologico(actuaciones) {
  return [...actuaciones].sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    return a.id - b.id;
  });
}

export function deLocal(actuaciones, localId) {
  return ordenarCronologico(actuaciones.filter((a) => a.localId === localId));
}

export function ultima(actuaciones, tipos) {
  const lista = ordenarCronologico(actuaciones.filter((a) => tipos.includes(a.tipo)));
  return lista.length ? lista[lista.length - 1] : null;
}

export function documentosDe(actuaciones, localId) {
  return deLocal(actuaciones, localId).filter((a) => TIPOS_DOCUMENTO.includes(a.tipo));
}

export function notificacionesDe(actuaciones, localId) {
  return deLocal(actuaciones, localId).filter((a) => a.tipo === 'NOTIFICACION');
}
