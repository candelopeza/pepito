/* ============================================================================
   backend/rutas/informe-9dj.js  —  EL INFORME DE LA PRESTATARIA (MODELO FOTO)
   ----------------------------------------------------------------------------
   Sección 9.3 del pliego. El informe que manda 9 de Julio es una FOTO de su
   padrón de contratos: la primera carga produce altas; las siguientes dicen
   quién sigue, quién se suma y quién ya no está. El sistema PROPONE y una
   persona CONFIRMA, fila por fila, con avance guardado: nada toca el padrón
   hasta "aplicar".

   EL CICLO DE UNA CARGA
     POST   /informe-9dj/cargas            sube el archivo: se lee, se cruza
                                           contra el padrón y queda EN_REVISION
     GET    /informe-9dj/cargas            historial de informes
     GET    /informe-9dj/cargas/:id        detalle: filas, decisiones y las
                                           bajas que propone la foto
     PUT    /informe-9dj/cargas/:id/filas/:idFila   la decisión de una fila
                                           (es el "guardar avance": de a una)
     POST   /informe-9dj/cargas/:id/aplicar   produce los efectos en el padrón
     POST   /informe-9dj/cargas/:id/descartar  carga equivocada, sin efectos
     POST   /informe-9dj/cargas/:id/anular     revierte una carga APLICADA,
                                           con motivo y usuario (sección 5.2)
     GET    /informe-9dj/contratos          los locales con contrato vigente hoy
                                           (informe, titular u oficina) y su frecuencia
     PUT    /informe-9dj/contratos/:idTramite/frecuencia   { frecuencia }
                                           veces por semana (1 a 7, o null)

   >>> LOS CONTRATOS DE ORIGEN INFORME_9DJ SON DE ESTE MÓDULO <<<
   Desde la ficha del local no se editan ni se dan de baja (lo rechaza
   rutas/documentacion.js): la foto la pisa la foto siguiente o la anulación
   de la carga, nunca una corrección manual suelta, porque ahí se pierde la
   trazabilidad de qué informe dijo qué.

   Necesita las tablas de backend/sql/09-tablas-informe-9dj.sql. Si no están,
   cada endpoint responde 503 diciendo qué correr.
   ============================================================================ */

import { Router } from 'express';
import { consultar, ejecutar, enTransaccion } from '../conexion-bd.js';
import { tiene } from '../capacidades.js';
import { cicloActual, insertarTramite, recortarObservacion } from '../consultas.js';
import { ID_ESTADO, ID_TDOC, ID_TTRAMITE } from '../mapeo.js';
import { hoyISO } from '../../src/dominio/fechas.js';
import { ErrorDeLectura, huellaDeArchivo, leerInforme } from '../lector-informe-9dj.js';
import { requiereRol } from '../middlewares/usuario.js';

const router = Router();

/* Todo el módulo es de la oficina: el relevador y el titular no cargan
   informes de la prestataria. */
router.use(requiereRol('administrativo', 'coordinacion', 'direccion'));

/* ---------------------------------------------------------------------------
   TODO-DEFINICION: LA ALARMA DE INFORME INCOMPLETO
   ---------------------------------------------------------------------------
   La especificación pide avisar cuando un informe trae "muchas menos" filas
   que el anterior (una hoja que no se escaneó, un filtro que quedó puesto en
   el Excel), pero el margen no está definido por el área. Mientras tanto: 20%
   menos que el último informe aplicado dispara la alarma, y aplicar igual
   exige confirmarlo a propósito.
   --------------------------------------------------------------------------- */
const MARGEN_INFORME_INCOMPLETO = 0.8;

/* ---------------------------------------------------------------------------
   EL CRUCE CONTRA EL PADRÓN
   ---------------------------------------------------------------------------
   Tres resultados posibles, del más seguro al menos:

     ENCONTRADO     el CUIT es de UN local (o de varias sucursales y la
                    dirección desambigua). Lo único que se ata solo.
     PARECIDO       no cruzó por CUIT, pero HAY locales que se parecen: la
                    misma razón social en la misma dirección con otro CUIT
                    (error de tipeo, lectura de OCR, cambio de titularidad),
                    la misma dirección, o las sucursales de un CUIT que la
                    dirección no alcanzó a desambiguar. Los candidatos quedan
                    A LA VISTA y el agente elige: el sistema NUNCA vincula
                    solo una coincidencia parecida.
     NO_ENCONTRADO  nada razonablemente parecido en el padrón.

   El CUIT solo no alcanza (120 CUIT tienen más de un local) y el nombre solo
   tampoco (hay 11 locales que se llaman igual): toda similitud exige que la
   DIRECCIÓN participe, que es lo que el padrón ya enseñó con los duplicados.
   --------------------------------------------------------------------------- */
const soloDigitos = (t) => String(t ?? '').replace(/\D/g, '');
const normalizar = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/* La dirección partida en calle (palabras) y altura, UNA sola vez por local:
   el cruce compara cada fila contra todo el padrón y normalizar 2.200
   direcciones por fila sería pagar el mismo trabajo quinientas veces. */
function partirDireccion(texto) {
  const n = normalizar(texto);
  return {
    altura: n.match(/\d+/)?.[0] ?? null,
    calle: n.replace(/\d+/g, ' ').split(' ').filter((p) => p.length > 2),
  };
}

const palabrasDeNombre = (t) => normalizar(t).split(' ').filter((p) => p.length > 3);

/* ¿Es la misma calle? Los tokens de una aparecen en la otra: "AV. SAN MARTIN"
   es "San Martín", no "SAN LORENZO". */
function mismaCalle(a, b) {
  if (!a.calle.length || !b.calle.length) return false;
  const [cortas, largas] = a.calle.length <= b.calle.length ? [a.calle, b.calle] : [b.calle, a.calle];
  return cortas.every((p) => largas.includes(p));
}

/* Exacta: misma calle y la MISMA altura. */
function direccionExacta(a, b) {
  if (a.altura !== b.altura) return false;
  if (!a.calle.length || !b.calle.length) return Boolean(a.altura);
  return mismaCalle(a, b);
}

/* Cercana: misma calle con la altura corrida en pocos números ("San Martín
   1500" contra "San Martin 1502": el mismo local con dos entradas, o el
   número mal tipeado). Solo sirve para PROPONER, nunca para decidir. */
const TOLERANCIA_ALTURA = 10;
function direccionCercana(a, b) {
  if (!a.altura || !b.altura) return false;
  if (Math.abs(Number(a.altura) - Number(b.altura)) > TOLERANCIA_ALTURA) return false;
  return mismaCalle(a, b);
}

/* ¿Los nombres comparten alguna palabra con peso? "PANADERIA ALBERTUS" se
   parece a "ALBERTUS SRL"; los artículos y siglas cortas no cuentan. */
function nombresParecidos(palabrasFila, palabrasLocal) {
  if (!palabrasFila.length || !palabrasLocal.length) return false;
  return palabrasFila.some((p) => palabrasLocal.includes(p));
}

/* El padrón preparado para comparar: CUIT normalizado, dirección partida y
   las palabras del nombre comercial y la razón social juntas. */
function indexarPadron(padron) {
  const indexado = padron.map((l) => ({
    id: l.id,
    cuit: soloDigitos(l.cuit),
    dir: partirDireccion(l.direccion),
    nombre: palabrasDeNombre(`${l.nombreLocal ?? ''} ${l.razonSocial ?? ''}`),
  }));
  const porCuit = new Map();
  for (const l of indexado) {
    if (l.cuit.length !== 11) continue;
    if (!porCuit.has(l.cuit)) porCuit.set(l.cuit, []);
    porCuit.get(l.cuit).push(l);
  }
  return { indexado, porCuit };
}

/* Los parecidos de una fila, del más fuerte al más débil:
     1  misma dirección y el nombre se parece (el caso típico: la misma
        razón social en la misma dirección con otro CUIT)
     2  misma dirección
     3  misma calle con la altura corrida, y el nombre se parece
   Se devuelven a lo sumo cinco, ordenados. */
const MAXIMO_CANDIDATOS = 5;
function candidatosParecidos(filaDir, filaNombre, indexado) {
  const puntuados = [];
  for (const l of indexado) {
    const nombre = nombresParecidos(filaNombre, l.nombre);
    if (direccionExacta(filaDir, l.dir)) puntuados.push({ id: l.id, orden: nombre ? 1 : 2 });
    else if (nombre && direccionCercana(filaDir, l.dir)) puntuados.push({ id: l.id, orden: 3 });
  }
  return puntuados
    .sort((a, b) => a.orden - b.orden)
    .slice(0, MAXIMO_CANDIDATOS)
    .map((c) => c.id);
}

function cruzarFila(fila, { indexado, porCuit }) {
  const filaDir = partirDireccion(fila.direccion);
  const filaNombre = palabrasDeNombre(fila.razonSocial);

  // 1. Por CUIT, cuando el dígito verificador cierra.
  if (fila.cuitValido) {
    const mismos = porCuit.get(fila.cuit) ?? [];
    if (mismos.length === 1) return { cruce: 'ENCONTRADO', idLocal: mismos[0].id, candidatos: null };
    if (mismos.length > 1) {
      const porDireccion = mismos.find((l) => direccionExacta(filaDir, l.dir));
      if (porDireccion) return { cruce: 'ENCONTRADO', idLocal: porDireccion.id, candidatos: null };
      // Sucursales que la dirección no desambiguó: todas a la vista.
      return { cruce: 'PARECIDO', idLocal: null, candidatos: mismos.map((l) => l.id).join(',') };
    }
  }

  // 2. Por similitud: también para el CUIT que no cierra (el error de OCR es
  //    justamente cuando más sirve encontrar el local por otro camino).
  const parecidos = candidatosParecidos(filaDir, filaNombre, indexado);
  if (parecidos.length) return { cruce: 'PARECIDO', idLocal: null, candidatos: parecidos.join(',') };

  return { cruce: 'NO_ENCONTRADO', idLocal: null, candidatos: null };
}

/* Para corroborar un vínculo manual: la fila y el local elegido se parecen si
   coinciden en CUIT, en dirección (exacta o cercana) o en el nombre. Es una
   red contra el número equivocado, no un cruce automático. */
function seParecen(fila, local) {
  if (fila.cuit && soloDigitos(local.cuit) === fila.cuit) return true;
  const filaDir = partirDireccion(fila.direccion);
  const localDir = partirDireccion(local.direccion);
  if (direccionExacta(filaDir, localDir) || direccionCercana(filaDir, localDir)) return true;
  const filaNombre = palabrasDeNombre(fila.razonSocial);
  return nombresParecidos(filaNombre, palabrasDeNombre(`${local.nombreLocal ?? ''} ${local.razonSocial ?? ''}`));
}

/* ---------------------------------------------------------------------------
   CONSULTAS DEL MÓDULO
   --------------------------------------------------------------------------- */

/* Los locales que HOY tienen contrato de la prestataria sostenido por la foto:
   contra esto se calculan las bajas que propone un informe nuevo. */
async function localesConContrato9dj() {
  return consultar(`
    SELECT t.id_local id, t.id_tramite idTramite,
           /* El agente decide una baja leyendo el nombre: si la ficha no lo
              tiene, antes que un hueco va la razón social o el número. */
           COALESCE(NULLIF(l.nombre_local, ''), NULLIF(l.razon_social, ''), CONCAT('Local N° ', l.id_local)) nombreLocal,
           l.razon_social razonSocial, l.cuit, l.direccion_local direccion,
           d.numero numeroContrato, DATE_FORMAT(d.fecha_vencimiento, '%Y-%m-%d') vencimiento
      FROM documentacion d
      JOIN tramite t ON t.id_tramite = d.id_tramite AND t.habilita = 1
      JOIN local l   ON l.id_local = t.id_local AND l.habilita = 1
     WHERE d.habilita = 1 AND d.origen = 'INFORME_9DJ'
       AND d.id_tdocumentacion = ? AND t.id_estado = ?`,
    [ID_TDOC.CONTRATO, ID_ESTADO.DOC_VIGENTE],
  );
}

/* El rubro elegido en el formulario de alta, resuelto a su id. Si no existe
   en el catálogo, el local queda SIN INFORMAR (id 1), que es el valor con el
   que entra cualquier alta sin rubro. */
async function idDeRubro(cx, nombre) {
  const [filas] = await cx.query('SELECT id_rubro FROM rubro WHERE nombre_rubro = ? AND habilita = 1', [nombre]);
  return filas[0]?.id_rubro ?? 1;
}

async function informePorId(id) {
  const [informe] = await consultar('SELECT * FROM informe_9dj WHERE id_informe = ? AND habilita = 1', [id]);
  return informe ?? null;
}

async function filasDeInforme(id) {
  return consultar('SELECT * FROM informe_9dj_fila WHERE id_informe = ? AND habilita = 1 ORDER BY nro_fila', [id]);
}

/* Las bajas que propone la foto: tienen contrato sostenido y NO figuran en
   ninguna fila viva del informe (una fila RECHAZADA no cuenta: el agente dijo
   que esa fila no vale, así que no sostiene a nadie). */
function bajasPropuestas(conContrato, filas) {
  const sostenidos = new Set(
    filas.filter((f) => f.decision !== 'RECHAZADA' && f.idLocal).map((f) => f.idLocal),
  );
  return conContrato.filter((l) => !sostenidos.has(l.id));
}

/* La forma en que una carga viaja al front, con las filas y las cuentas. */
async function detalleDeCarga(informe) {
  const filas = await filasDeInforme(informe.idInforme);
  const conContrato = await localesConContrato9dj();

  const cuentas = { SIN_REVISAR: 0, CONFIRMADA: 0, RECHAZADA: 0, VINCULADA: 0, ALTA: 0, PENDIENTE: 0 };
  for (const f of filas) if (f.cruce !== 'BAJA') cuentas[f.decision] = (cuentas[f.decision] ?? 0) + 1;

  const [anterior] = await consultar(
    `SELECT i.id_informe, i.fecha_aplicacion, COUNT(f.id_fila) filas
       FROM informe_9dj i
       LEFT JOIN informe_9dj_fila f ON f.id_informe = i.id_informe AND f.habilita = 1 AND f.cruce <> 'BAJA'
      WHERE i.estado = 'APLICADO' AND i.habilita = 1 AND i.id_informe <> ?
      GROUP BY i.id_informe ORDER BY i.fecha_aplicacion DESC LIMIT 1`,
    [informe.idInforme],
  );

  const vivas = filas.filter((f) => f.cruce !== 'BAJA');
  const incompleto = Boolean(anterior && vivas.length < anterior.filas * MARGEN_INFORME_INCOMPLETO);

  return {
    id: informe.idInforme,
    nombreArchivo: informe.nombreArchivo,
    periodo: informe.periodo,
    formato: informe.formato,
    advertencia: informe.advertencia,
    estado: informe.estado,
    usuarioCarga: informe.usuarioCarga,
    fechaCarga: informe.fechaCarga,
    usuarioAplicacion: informe.usuarioAplicacion,
    fechaAplicacion: informe.fechaAplicacion,
    usuarioAnulacion: informe.usuarioAnulacion,
    motivoAnulacion: informe.motivoAnulacion,
    cuentas,
    /* La alarma de informe incompleto, con sus números a la vista. */
    informeAnterior: anterior ? { filas: Number(anterior.filas) } : null,
    incompleto,
    filas: vivas.map(aFilaFront),
    bajasEjecutadas: filas.filter((f) => f.cruce === 'BAJA').map(aFilaFront),
    /* Solo mientras se revisa: una carga aplicada ya ejecutó sus bajas. */
    bajasPropuestas: informe.estado === 'EN_REVISION' ? bajasPropuestas(conContrato, filas) : [],
  };
}

function aFilaFront(f) {
  return {
    id: f.idFila,
    numeroDeFila: f.nroFila,
    cuit: f.cuit,
    cuitValido: Boolean(f.cuitValido),
    motivoCuit: f.motivoCuit,
    razonSocial: f.razonSocial ?? '',
    direccion: f.direccion ?? '',
    numeroContrato: f.numeroContrato ?? '',
    vencimiento: f.fechaVencimiento ? String(f.fechaVencimiento).slice(0, 10) : null,
    crudo: f.crudo ?? '',
    cruce: f.cruce,
    idLocal: f.idLocal,
    candidatos: f.candidatos ? f.candidatos.split(',').map(Number) : [],
    decision: f.decision,
    usuarioDecision: f.usuarioDecision,
    datosAlta: f.datosAlta ? JSON.parse(f.datosAlta) : null,
    efecto: f.efecto,
  };
}

/* ===========================================================================
   GET /informe-9dj/cargas  ->  el historial
   =========================================================================== */
router.get('/cargas', async (_req, res, next) => {
  try {
    const cargas = await consultar(`
      SELECT i.id_informe id, i.nombre_archivo nombreArchivo, i.periodo, i.estado,
             i.usuario_carga usuarioCarga, i.fecha_carga fechaCarga,
             i.usuario_aplicacion usuarioAplicacion, i.fecha_aplicacion fechaAplicacion,
             i.motivo_anulacion motivoAnulacion,
             COUNT(f.id_fila) filas
        FROM informe_9dj i
        LEFT JOIN informe_9dj_fila f ON f.id_informe = i.id_informe AND f.habilita = 1 AND f.cruce <> 'BAJA'
       WHERE i.habilita = 1
       GROUP BY i.id_informe ORDER BY i.fecha_carga DESC`);
    res.json(cargas.map((c) => ({ ...c, filas: Number(c.filas) })));
  } catch (e) {
    next(e);
  }
});

/* ===========================================================================
   GET /informe-9dj/cargas/:id  ->  el detalle con filas y bajas propuestas
   =========================================================================== */
router.get('/cargas/:id', async (req, res, next) => {
  try {
    const informe = await informePorId(Number(req.params.id));
    if (!informe) return res.status(404).json({ error: 'No existe esa carga del informe' });
    res.json(await detalleDeCarga(informe));
  } catch (e) {
    next(e);
  }
});

/* ===========================================================================
   GET /informe-9dj/contratos  ->  los locales con contrato vigente hoy
   ---------------------------------------------------------------------------
   Pedido de coordinación (4/11/2026): el informe de 9 de Julio no dice con
   qué frecuencia pasa la prestataria por cada local; ese dato lo tiene
   coordinación y lo carga acá, contrato por contrato. Se listan TODOS los
   contratos vigentes hoy, vengan de donde vengan:
     - los del último informe aplicado (los de informes anteriores que el
       último no trajo ya fueron retirados, así que no están vigentes);
     - los que presentó un titular por el portal y coordinación aprobó (valen
       un mes, después los confirma el informe);
     - los que cargó la oficina.
   Un contrato vencido no aparece: ya no es un contrato vigente. `informe` es
   el último aplicado, para el encabezado de la tabla.
   =========================================================================== */
router.get('/contratos', async (_req, res, next) => {
  try {
    const [ultimo] = await consultar(
      `SELECT id_informe idInforme, periodo, fecha_aplicacion fechaAplicacion, usuario_aplicacion usuarioAplicacion
         FROM informe_9dj WHERE habilita = 1 AND estado = 'APLICADO'
        ORDER BY fecha_aplicacion DESC, id_informe DESC LIMIT 1`,
    );
    // Sin la columna (sql/13) la lista sale igual, con la frecuencia vacía.
    const columnaFrecuencia = tiene('frecuencia') ? 'd.frecuencia_semanal' : 'NULL';
    const contratos = await consultar(
      `SELECT t.id_tramite id, l.id_local localId, l.nombre_local nombreLocal, l.razon_social razonSocial,
              l.cuit, l.direccion_local direccion, d.numero numeroContrato, d.origen,
              DATE_FORMAT(d.fecha_vencimiento, '%Y-%m-%d') vencimiento, ${columnaFrecuencia} frecuenciaSemanal,
              (SELECT MAX(f.id_informe) FROM informe_9dj_fila f WHERE f.id_tramite = t.id_tramite AND f.habilita = 1) idInforme
         FROM tramite t
         JOIN documentacion d ON d.id_tramite = t.id_tramite AND d.habilita = 1 AND d.id_tdocumentacion = ?
         JOIN local l ON l.id_local = t.id_local AND l.habilita = 1
        WHERE t.habilita = 1 AND t.id_estado = ?
          AND (d.fecha_vencimiento IS NULL OR d.fecha_vencimiento > ?)
        ORDER BY l.nombre_local`,
      [ID_TDOC.CONTRATO, ID_ESTADO.DOC_VIGENTE, hoyISO()],
    );
    res.json({
      informe: ultimo
        ? { id: ultimo.idInforme, periodo: ultimo.periodo, fechaAplicacion: ultimo.fechaAplicacion, usuarioAplicacion: ultimo.usuarioAplicacion }
        : null,
      contratos: contratos.map((c) => ({
        ...c,
        idInforme: c.idInforme === null ? null : Number(c.idInforme),
        frecuenciaSemanal: c.frecuenciaSemanal === null ? null : Number(c.frecuenciaSemanal),
      })),
    });
  } catch (e) {
    next(e);
  }
});

/* PUT /informe-9dj/contratos/:idTramite/frecuencia  { frecuencia }
   Veces por semana, de 1 a 7 (7 = todos los días); null la borra. Lo carga
   coordinación o la Dirección. Es un dato del área, no de la foto de la
   prestataria: por eso sí se edita aunque el contrato venga del informe. */
router.put('/contratos/:idTramite/frecuencia', requiereRol('coordinacion', 'direccion'), async (req, res, next) => {
  try {
    if (!tiene('frecuencia')) {
      return res.status(503).json({
        error: 'La base todavía no guarda la frecuencia de recolección. Correr backend/sql/13-frecuencia-recoleccion.sql desde HeidiSQL.',
      });
    }
    const crudo = req.body?.frecuencia;
    const frecuencia = crudo === null || crudo === undefined || crudo === '' ? null : Number(crudo);
    if (frecuencia !== null && (!Number.isInteger(frecuencia) || frecuencia < 1 || frecuencia > 7)) {
      return res.status(400).json({ error: 'La frecuencia es la cantidad de veces por semana: un entero de 1 a 7.' });
    }
    const idTramite = Number(req.params.idTramite);
    const [doc] = await consultar(
      `SELECT d.id_documentacion id FROM documentacion d
         JOIN tramite t ON t.id_tramite = d.id_tramite AND t.habilita = 1
        WHERE d.id_tramite = ? AND d.habilita = 1 AND d.id_tdocumentacion = ?`,
      [idTramite, ID_TDOC.CONTRATO],
    );
    if (!doc) return res.status(404).json({ error: 'Ese trámite no es un contrato' });
    await ejecutar('UPDATE documentacion SET frecuencia_semanal = ? WHERE id_documentacion = ?', [frecuencia, doc.id]);
    res.json({ id: idTramite, frecuenciaSemanal: frecuencia });
  } catch (e) {
    next(e);
  }
});

/* ===========================================================================
   POST /informe-9dj/cargas  ->  subir un archivo
   ---------------------------------------------------------------------------
   { nombreArchivo, contenidoBase64, periodo? }

   El archivo viaja en base64 dentro del JSON: una planilla de trescientas
   filas pesa decenas de KB y así no hace falta otro mecanismo de subida.
   Acá SOLO se lee y se cruza: no se toca el padrón.
   =========================================================================== */
router.post('/cargas', async (req, res, next) => {
  try {
    const { nombreArchivo, contenidoBase64, periodo } = req.body ?? {};
    if (!contenidoBase64) return res.status(400).json({ error: 'No llegó el archivo' });

    const buffer = Buffer.from(String(contenidoBase64), 'base64');
    const huella = huellaDeArchivo(buffer);

    // ¿Este archivo ya se cargó? La huella lo reconoce aunque lo renombren.
    // Una carga descartada o anulada no cuenta: volver a cargarla es legítimo.
    const [repetida] = await consultar(
      `SELECT id_informe, nombre_archivo, fecha_carga, usuario_carga, estado FROM informe_9dj
        WHERE huella = ? AND estado IN ('EN_REVISION', 'APLICADO') AND habilita = 1`,
      [huella],
    );
    if (repetida) {
      return res.status(409).json({
        error:
          `Este archivo ya se cargó: es "${repetida.nombreArchivo}", subido por ${repetida.usuarioCarga} ` +
          `(carga N° ${repetida.idInforme}, estado ${repetida.estado}).`,
      });
    }

    // Una revisión a la vez: dos fotos a medio decidir se contradicen entre sí.
    const [abierta] = await consultar(
      "SELECT id_informe FROM informe_9dj WHERE estado = 'EN_REVISION' AND habilita = 1",
    );
    if (abierta) {
      return res.status(409).json({
        error: `Ya hay un informe en revisión (carga N° ${abierta.idInforme}). Aplicalo o descartalo antes de subir otro.`,
      });
    }

    let lectura;
    try {
      lectura = await leerInforme(buffer, String(nombreArchivo ?? ''));
    } catch (e) {
      if (e instanceof ErrorDeLectura) return res.status(400).json({ error: e.message });
      throw e;
    }
    if (!lectura.filas.length) return res.status(400).json({ error: 'El archivo se leyó pero no tiene ninguna fila con datos.' });

    /* >>> UN VENCIMIENTO QUE NO SE ENTIENDE FRENA LA CARGA <<<
       No se guarda nada: se devuelve fila por fila qué tiene de malo, para
       que corrijan el archivo y lo vuelvan a subir. Guardarlo vacío sería
       inventar que el contrato no tiene vencimiento, y la base rechazaría
       una fecha como 31/11 con un error que nadie entiende. */
    const malLeidas = lectura.filas.filter((f) => f.motivoVencimiento);
    if (malLeidas.length) {
      const detalle = malLeidas
        .slice(0, 10)
        .map((f) => `fila ${f.numeroDeFila}${f.razonSocial ? ` (${f.razonSocial})` : ''}: ${f.motivoVencimiento}`)
        .join(' · ');
      return res.status(400).json({
        error:
          `No se cargó el informe: ${malLeidas.length} fila(s) tienen un vencimiento que no se puede leer. ` +
          `${detalle}${malLeidas.length > 10 ? ' · …' : ''}. Corregí el archivo y volvé a subirlo.`,
      });
    }

    // El cruce contra el padrón: por CUIT y, si no cruza, por similitud de
    // dirección y nombre (las coincidencias parecidas quedan como candidatos).
    const padron = await consultar(
      'SELECT id_local id, cuit, direccion_local direccion, nombre_local nombreLocal, razon_social razonSocial FROM local WHERE habilita = 1',
    );
    const indice = indexarPadron(padron);

    const id = await enTransaccion(async (cx) => {
      const [r] = await cx.execute(
        `INSERT INTO informe_9dj (nombre_archivo, huella, periodo, formato, advertencia, usuario_carga)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          String(nombreArchivo ?? 'informe'),
          huella,
          periodo ? String(periodo).slice(0, 30) : null,
          lectura.formato,
          lectura.advertencia ?? null,
          req.usuario.nombre,
        ],
      );
      for (const fila of lectura.filas) {
        const { cruce, idLocal, candidatos } = cruzarFila(fila, indice);
        await cx.execute(
          `INSERT INTO informe_9dj_fila
             (id_informe, nro_fila, cuit, cuit_valido, motivo_cuit, razon_social, direccion,
              numero_contrato, fecha_vencimiento, crudo, cruce, id_local, candidatos)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            r.insertId,
            fila.numeroDeFila,
            fila.cuit,
            fila.cuitValido ? 1 : 0,
            fila.motivoCuit,
            fila.razonSocial.slice(0, 255) || null,
            fila.direccion.slice(0, 255) || null,
            fila.numeroContrato.slice(0, 50) || null,
            fila.vencimiento,
            fila.crudo.slice(0, 500),
            cruce,
            idLocal,
            candidatos,
          ],
        );
      }
      return r.insertId;
    });

    res.status(201).json(await detalleDeCarga(await informePorId(id)));
  } catch (e) {
    next(e);
  }
});

/* ===========================================================================
   PUT /informe-9dj/cargas/:id/filas/:idFila  ->  la decisión de una fila
   ---------------------------------------------------------------------------
   { decision, idLocal? }   Es el guardado de avance: cada decisión queda en el
   momento, con quién y cuándo. Cerrar la pantalla no pierde nada.
   =========================================================================== */
const DECISIONES = ['SIN_REVISAR', 'CONFIRMADA', 'RECHAZADA', 'VINCULADA', 'ALTA', 'PENDIENTE'];

router.put('/cargas/:id/filas/:idFila', async (req, res, next) => {
  try {
    const informe = await informePorId(Number(req.params.id));
    if (!informe) return res.status(404).json({ error: 'No existe esa carga del informe' });
    if (informe.estado !== 'EN_REVISION') {
      return res.status(409).json({ error: `La carga está ${informe.estado}: ya no se revisa.` });
    }

    const [fila] = await consultar(
      'SELECT * FROM informe_9dj_fila WHERE id_fila = ? AND id_informe = ? AND habilita = 1',
      [Number(req.params.idFila), informe.idInforme],
    );
    if (!fila) return res.status(404).json({ error: 'No existe esa fila del informe' });

    const { decision } = req.body ?? {};
    if (!DECISIONES.includes(decision)) {
      return res.status(400).json({ error: `Decisión inválida. Valores posibles: ${DECISIONES.join(', ')}` });
    }

    /* >>> UN CONTRATO QUE YA VIENE VENCIDO NO SE CARGA <<<
       Si el informe trae un vencimiento pasado, confirmar esa fila metería al
       padrón un contrato que nació vencido: el local saldría del circuito de
       notificación sin ningún respaldo vigente. Se rechaza, queda pendiente, y
       se le pide la aclaración a la prestataria. */
    const vencimientoFila = fila.fechaVencimiento ? String(fila.fechaVencimiento).slice(0, 10) : null;
    if (['CONFIRMADA', 'VINCULADA', 'ALTA'].includes(decision) && vencimientoFila && vencimientoFila < hoyISO()) {
      return res.status(409).json({
        error:
          `El contrato de esta fila ya viene vencido (${vencimientoFila}): no se puede cargar. ` +
          'Rechazala o dejala pendiente y pedí la aclaración a la prestataria.',
      });
    }

    // La decisión tiene que corresponder a lo que el cruce encontró.
    let idLocal = fila.idLocal;
    let datosAlta = fila.datosAlta ?? null;

    // Confirmar exige un local: el que encontró el cruce o el que el agente
    // vinculó a mano antes. Rechazar, en cambio, siempre se puede.
    if (decision === 'CONFIRMADA' && !fila.idLocal) {
      return res.status(400).json({ error: 'Esta fila no cruzó con ningún local: vinculala, dala de alta o dejala pendiente.' });
    }

    if (decision === 'VINCULADA') {
      idLocal = Number(req.body?.idLocal);
      const [local] = await consultar(
        `SELECT id_local id, cuit, nombre_local nombreLocal, razon_social razonSocial, direccion_local direccion
           FROM local WHERE id_local = ? AND habilita = 1`,
        [idLocal],
      );
      if (!local) return res.status(400).json({ error: 'Para vincular hace falta un local existente del padrón.' });

      /* >>> EL VÍNCULO SE CORROBORA, NO SE CREE <<<
         Vincular ata el contrato de la prestataria a una ficha del padrón. Si
         ni el CUIT, ni la dirección, ni el nombre se parecen, lo más probable
         es un número equivocado: se avisa mostrando los dos lados, y solo se
         vincula si el agente lo confirma a propósito (forzar). */
      if (!seParecen(fila, local) && req.body?.forzar !== true) {
        return res.status(409).json({
          error:
            'El local elegido no se parece en nada a la fila del informe: ni el CUIT, ni la dirección, ni el nombre coinciden. ' +
            'Revisá que sea el correcto; si estás segura, confirmá el vínculo igual.',
          comparacion: {
            fila: { cuit: fila.cuit, razonSocial: fila.razonSocial, direccion: fila.direccion },
            local: { id: local.id, cuit: local.cuit, nombreLocal: local.nombreLocal, razonSocial: local.razonSocial, direccion: local.direccion },
          },
        });
      }
    }

    if (decision === 'ALTA') {
      if (fila.cruce === 'ENCONTRADO') {
        return res.status(400).json({ error: 'Esta fila ya cruzó con un local del padrón: no corresponde un alta.' });
      }
      idLocal = null;
      // Los datos revisados por el agente en el formulario de alta. El local
      // NO se crea ahora: se crea al aplicar el informe, con estos datos.
      if (req.body?.datosAlta && typeof req.body.datosAlta === 'object') {
        const d = req.body.datosAlta;
        if (!String(d.nombreLocal ?? '').trim() || !String(d.direccion ?? '').trim()) {
          return res.status(400).json({ error: 'El alta necesita al menos el nombre del local y la dirección.' });
        }
        datosAlta = JSON.stringify({
          nombreLocal: String(d.nombreLocal).trim(),
          razonSocial: String(d.razonSocial ?? '').trim(),
          cuit: soloDigitos(d.cuit) || null,
          direccion: String(d.direccion).trim(),
          domicilioFiscal: String(d.domicilioFiscal ?? '').trim() || null,
          rubro: String(d.rubro ?? '').trim() || null,
          email: String(d.email ?? '').trim() || null,
          telefono: String(d.telefono ?? '').trim() || null,
          observaciones: String(d.observaciones ?? '').trim() || null,
        });
      }
    }
    if (decision === 'SIN_REVISAR') idLocal = fila.idLocal;

    await consultar(
      `UPDATE informe_9dj_fila
          SET decision = ?, id_local = ?, datos_alta = ?, usuario_decision = ?, fecha_decision = NOW()
        WHERE id_fila = ?`,
      [decision, idLocal, datosAlta, req.usuario.nombre, fila.idFila],
    );
    res.json({ ok: true, id: fila.idFila, decision, idLocal, datosAlta: datosAlta ? JSON.parse(datosAlta) : null });
  } catch (e) {
    next(e);
  }
});

/* ===========================================================================
   POST /informe-9dj/cargas/:id/aplicar  ->  los efectos en el padrón
   ---------------------------------------------------------------------------
   { bajas: [idLocal...], confirmarIncompleto? }

   `bajas` es la CONFIRMACIÓN LISTADA: el agente vio la lista de los locales
   que perderían el contrato y marcó cuáles sí. El que no está en la lista
   conserva el contrato (quizás la prestataria se lo olvidó: se decide con el
   informe siguiente).

   Todo corre en UNA transacción: o la foto se aplica entera o no se aplica.
   =========================================================================== */
router.post('/cargas/:id/aplicar', async (req, res, next) => {
  try {
    const informe = await informePorId(Number(req.params.id));
    if (!informe) return res.status(404).json({ error: 'No existe esa carga del informe' });
    if (informe.estado !== 'EN_REVISION') {
      return res.status(409).json({ error: `La carga está ${informe.estado}: no se puede aplicar.` });
    }

    const filas = await filasDeInforme(informe.idInforme);
    const sinRevisar = filas.filter((f) => f.decision === 'SIN_REVISAR').length;
    if (sinRevisar) {
      return res.status(400).json({
        error: `Quedan ${sinRevisar} fila(s) sin revisar. Confirmá, rechazá o dejá pendiente cada una antes de aplicar.`,
      });
    }

    /* Defensa en profundidad del bloqueo de contratos vencidos: la decisión
       ya no se puede tomar (lo rechaza el PUT), pero una fila decidida antes
       de esa regla podría haber quedado. Acá no pasa. */
    const vencidas = filas.filter(
      (f) =>
        f.cruce !== 'BAJA' &&
        ['CONFIRMADA', 'VINCULADA', 'ALTA'].includes(f.decision) &&
        f.fechaVencimiento &&
        String(f.fechaVencimiento).slice(0, 10) < hoyISO(),
    );
    if (vencidas.length) {
      return res.status(400).json({
        error:
          `Hay ${vencidas.length} fila(s) confirmadas cuyo contrato ya viene vencido ` +
          `(filas ${vencidas.map((f) => f.nroFila).join(', ')}): rechazalas o dejalas pendientes antes de aplicar.`,
      });
    }

    const detalle = await detalleDeCarga(informe);
    if (detalle.incompleto && req.body?.confirmarIncompleto !== true) {
      return res.status(400).json({
        error:
          `El informe trae ${detalle.filas.length} fila(s) y el anterior traía ${detalle.informeAnterior.filas}: ` +
          'puede estar incompleto (una hoja sin escanear, un filtro en el Excel). Revisalo y, si es correcto, confirmá aplicar igual.',
      });
    }

    // Las bajas confirmadas tienen que ser de las propuestas: no se da de baja
    // por esta vía nada que la foto no haya dejado afuera.
    const bajas = Array.isArray(req.body?.bajas) ? req.body.bajas.map(Number) : [];
    const propuestas = new Map(detalle.bajasPropuestas.map((b) => [b.id, b]));
    const noPropuesta = bajas.find((id) => !propuestas.has(id));
    if (noPropuesta !== undefined) {
      return res.status(400).json({ error: `El local ${noPropuesta} no está entre las bajas que propone este informe.` });
    }

    const hoy = hoyISO();
    const resumen = { confirmados: 0, completados: 0, creados: 0, altas: 0, retirados: 0, pendientes: 0, rechazadas: 0 };

    await enTransaccion(async (cx) => {
      const marcarFila = (f, efecto, idTramite, idLocal = f.idLocal) =>
        cx.execute('UPDATE informe_9dj_fila SET efecto = ?, id_tramite = ?, id_local = ? WHERE id_fila = ?', [
          efecto,
          idTramite,
          idLocal,
          f.idFila,
        ]);

      /* Asegura que el local tenga SU contrato de la prestataria vigente.
         Si ya lo tiene, solo se COMPLETAN los campos vacíos (número y
         vencimiento): completar es reversible al anular, pisar no. */
      const sostenerContrato = async (f, idLocal) => {
        const [candidatas] = await cx.query(
          `SELECT d.id_tramite idTramite, d.numero, d.fecha_vencimiento vencimiento
             FROM documentacion d JOIN tramite t ON t.id_tramite = d.id_tramite AND t.habilita = 1
            WHERE d.habilita = 1 AND d.origen = 'INFORME_9DJ' AND d.id_tdocumentacion = ?
              AND t.id_local = ? AND t.id_estado = ?`,
          [ID_TDOC.CONTRATO, idLocal, ID_ESTADO.DOC_VIGENTE],
        );
        const existente = candidatas[0];

        if (existente?.idTramite) {
          const completaNumero = !existente.numero && f.numeroContrato;
          const completaFecha = !existente.vencimiento && f.fechaVencimiento;
          if (completaNumero || completaFecha) {
            await cx.execute(
              `UPDATE documentacion SET numero = COALESCE(numero, ?), fecha_vencimiento = COALESCE(fecha_vencimiento, ?)
                WHERE id_tramite = ?`,
              [f.numeroContrato ?? null, f.fechaVencimiento ?? null, existente.idTramite],
            );
            resumen.completados += 1;
            return marcarFila(f, 'CONTRATO_COMPLETADO', existente.idTramite, idLocal);
          }
          resumen.confirmados += 1;
          return marcarFila(f, 'CONTRATO_CONFIRMADO', existente.idTramite, idLocal);
        }

        const ciclo = await cicloActual(idLocal);
        const idTramite = await insertarTramite(cx, {
          idLocal,
          idEstado: ID_ESTADO.DOC_VIGENTE,
          idTtramite: ID_TTRAMITE.PRESENTACION_DOCUMENTACION,
          idUsuario: req.usuario?.id ?? null,
          nroCiclo: ciclo,
          fechaInicio: hoy,
          fechaVencimiento: f.fechaVencimiento ?? null,
          observaciones: recortarObservacion(`Informe 9 de Julio, carga N° ${informe.idInforme}.`),
        });
        await cx.execute(
          `INSERT INTO documentacion (id_tramite, id_tdocumentacion, numero, origen, fecha_emision, fecha_vencimiento, habilita)
           VALUES (?, ?, ?, 'INFORME_9DJ', ?, ?, 1)`,
          [idTramite, ID_TDOC.CONTRATO, f.numeroContrato ?? null, hoy, f.fechaVencimiento ?? null],
        );
        resumen.creados += 1;
        return marcarFila(f, 'CONTRATO_CREADO', idTramite, idLocal);
      };

      for (const f of filas) {
        if (f.cruce === 'BAJA') continue;
        if (f.decision === 'RECHAZADA') {
          resumen.rechazadas += 1;
          continue;
        }
        if (f.decision === 'PENDIENTE') {
          resumen.pendientes += 1;
          continue;
        }
        if (f.decision === 'CONFIRMADA' || f.decision === 'VINCULADA') {
          await sostenerContrato(f, f.idLocal);
          continue;
        }
        if (f.decision === 'ALTA') {
          /* Si el agente revisó el alta en el formulario, mandan sus datos;
             si no, los crudos de la fila, como siempre. El local entra SIN
             coordenada: la geocodificación tarda un segundo por dirección y
             acá puede haber decenas de altas. Después se geocodifican por
             lotes desde Herramientas, como el resto. */
          const alta = f.datosAlta ? JSON.parse(f.datosAlta) : {};
          const idRubro = alta.rubro ? await idDeRubro(cx, alta.rubro) : 1;
          const [r] = await cx.execute(
            `INSERT INTO local
               (cuit, id_original, id_rubro, id_estado, razon_social, nombre_local, direccion_local,
                domicilio_fiscal, email_local, telefono_local,
                latitud_local, longitud_local, observacion, bloqueado, habilita)
             VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, 0, 1)`,
            [
              alta.cuit ?? f.cuit,
              idRubro,
              ID_ESTADO.REVISION_DATOS,
              alta.razonSocial || (f.razonSocial ?? null),
              alta.nombreLocal || f.razonSocial || 'SIN NOMBRE',
              alta.direccion || (f.direccion ?? ''),
              alta.domicilioFiscal ?? null,
              alta.email ?? null,
              alta.telefono ?? null,
              recortarObservacion(
                `${alta.observaciones ? `${alta.observaciones} · ` : ''}Creado desde el informe de la prestataria (carga N° ${informe.idInforme}).`,
              ),
            ],
          );
          const idLocal = r.insertId;
          // El prefijo CON en el id original dice de dónde salió la ficha,
          // igual que en el sistema heredado.
          await cx.execute('UPDATE local SET id_original = ? WHERE id_local = ?', [
            `CON-${String(idLocal).padStart(4, '0')}`,
            idLocal,
          ]);
          const idTramite = await insertarTramite(cx, {
            idLocal,
            idEstado: ID_ESTADO.DOC_VIGENTE,
            idTtramite: ID_TTRAMITE.PRESENTACION_DOCUMENTACION,
            idUsuario: req.usuario?.id ?? null,
            nroCiclo: 1,
            fechaInicio: hoy,
            fechaVencimiento: f.fechaVencimiento ?? null,
            observaciones: recortarObservacion(`Informe 9 de Julio, carga N° ${informe.idInforme}.`),
          });
          await cx.execute(
            `INSERT INTO documentacion (id_tramite, id_tdocumentacion, numero, origen, fecha_emision, fecha_vencimiento, habilita)
             VALUES (?, ?, ?, 'INFORME_9DJ', ?, ?, 1)`,
            [idTramite, ID_TDOC.CONTRATO, f.numeroContrato ?? null, hoy, f.fechaVencimiento ?? null],
          );
          resumen.altas += 1;
          await marcarFila(f, 'LOCAL_Y_CONTRATO_CREADOS', idTramite, idLocal);
        }
      }

      // Las bajas confirmadas: el contrato deja de estar sostenido por la foto.
      // Queda una fila sintética con TODO el rastro: qué local, qué trámite,
      // quién lo confirmó y en qué carga.
      for (const idLocal of bajas) {
        const baja = propuestas.get(idLocal);
        await cx.execute('UPDATE tramite SET id_estado = ? WHERE id_tramite = ?', [
          ID_ESTADO.DOC_VENCIDA,
          baja.idTramite,
        ]);
        await cx.execute(
          `INSERT INTO informe_9dj_fila
             (id_informe, nro_fila, cuit, razon_social, direccion, cruce, id_local, decision,
              usuario_decision, fecha_decision, id_tramite, efecto)
           VALUES (?, 0, ?, ?, ?, 'BAJA', ?, 'CONFIRMADA', ?, NOW(), ?, 'CONTRATO_RETIRADO')`,
          [
            informe.idInforme,
            soloDigitos(baja.cuit) || null,
            baja.nombreLocal,
            baja.direccion,
            idLocal,
            req.usuario.nombre,
            baja.idTramite,
          ],
        );
        resumen.retirados += 1;
      }

      await cx.execute(
        "UPDATE informe_9dj SET estado = 'APLICADO', usuario_aplicacion = ?, fecha_aplicacion = NOW() WHERE id_informe = ?",
        [req.usuario.nombre, informe.idInforme],
      );
    });

    res.json({ ok: true, resumen });
  } catch (e) {
    next(e);
  }
});

/* ===========================================================================
   POST /informe-9dj/cargas/:id/descartar  ->  la carga equivocada
   ---------------------------------------------------------------------------
   Solo EN_REVISION: todavía no produjo nada, así que descartar es solo cerrar
   la revisión. La huella queda libre para volver a cargar el archivo.
   =========================================================================== */
router.post('/cargas/:id/descartar', async (req, res, next) => {
  try {
    const informe = await informePorId(Number(req.params.id));
    if (!informe) return res.status(404).json({ error: 'No existe esa carga del informe' });
    if (informe.estado !== 'EN_REVISION') {
      return res.status(409).json({ error: `La carga está ${informe.estado}: solo se descarta la que está en revisión.` });
    }
    await consultar("UPDATE informe_9dj SET estado = 'DESCARTADO' WHERE id_informe = ?", [informe.idInforme]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/* ===========================================================================
   POST /informe-9dj/cargas/:id/anular  ->  revertir una carga APLICADA
   ---------------------------------------------------------------------------
   { motivo }  obligatorio, con el usuario que anula: es la única puerta para
   deshacer lo que una carga equivocada produjo (sección 5.2: los contratos de
   origen INFORME_9DJ no se corrigen desde la ficha).

   Cada fila guardó su `efecto` al aplicarse, así que la anulación es leer y
   deshacer exactamente eso, nada más:
     CONTRATO_CREADO / LOCAL_Y_CONTRATO_CREADOS -> baja lógica de lo creado
     CONTRATO_COMPLETADO -> los campos completados vuelven a vacío
     CONTRATO_CONFIRMADO -> no tocó nada, no hay nada que deshacer
     CONTRATO_RETIRADO   -> el contrato vuelve a VIGENTE
   =========================================================================== */
router.post('/cargas/:id/anular', requiereRol('coordinacion', 'direccion'), async (req, res, next) => {
  try {
    const informe = await informePorId(Number(req.params.id));
    if (!informe) return res.status(404).json({ error: 'No existe esa carga del informe' });
    if (informe.estado !== 'APLICADO') {
      return res.status(409).json({ error: `La carga está ${informe.estado}: solo se anula una carga aplicada.` });
    }
    const motivo = String(req.body?.motivo ?? '').trim();
    if (!motivo) return res.status(400).json({ error: 'La anulación exige el motivo.' });

    const filas = await filasDeInforme(informe.idInforme);

    await enTransaccion(async (cx) => {
      for (const f of filas) {
        if (!f.efecto) continue;
        if (f.efecto === 'CONTRATO_CREADO' || f.efecto === 'LOCAL_Y_CONTRATO_CREADOS') {
          await cx.execute('UPDATE tramite SET habilita = 0 WHERE id_tramite = ?', [f.idTramite]);
          await cx.execute('UPDATE documentacion SET habilita = 0 WHERE id_tramite = ?', [f.idTramite]);
          if (f.efecto === 'LOCAL_Y_CONTRATO_CREADOS') {
            await cx.execute('UPDATE local SET habilita = 0 WHERE id_local = ?', [f.idLocal]);
          }
        } else if (f.efecto === 'CONTRATO_COMPLETADO') {
          // Solo se completaron campos que estaban vacíos: vuelven a vacío si
          // todavía tienen exactamente lo que esta carga puso.
          await cx.execute('UPDATE documentacion SET numero = NULL WHERE id_tramite = ? AND numero <=> ?', [
            f.idTramite,
            f.numeroContrato,
          ]);
          await cx.execute(
            'UPDATE documentacion SET fecha_vencimiento = NULL WHERE id_tramite = ? AND fecha_vencimiento <=> ?',
            [f.idTramite, f.fechaVencimiento],
          );
        } else if (f.efecto === 'CONTRATO_RETIRADO') {
          await cx.execute('UPDATE tramite SET id_estado = ? WHERE id_tramite = ?', [
            ID_ESTADO.DOC_VIGENTE,
            f.idTramite,
          ]);
        }
      }
      await cx.execute(
        `UPDATE informe_9dj SET estado = 'ANULADO', usuario_anulacion = ?, fecha_anulacion = NOW(), motivo_anulacion = ?
          WHERE id_informe = ?`,
        [req.usuario.nombre, motivo.slice(0, 255), informe.idInforme],
      );
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/* ---------------------------------------------------------------------------
   Si las tablas del módulo no existen todavía, cada pedido cae acá con el
   error 1146 de MariaDB. La respuesta dice exactamente qué correr.
   --------------------------------------------------------------------------- */
router.use((err, _req, res, next) => {
  if (err?.errno === 1146 && /informe_9dj/.test(err.message ?? '')) {
    return res.status(503).json({
      error:
        'Faltan las tablas del módulo Informe 9 de Julio. Correr backend/sql/09-tablas-informe-9dj.sql desde HeidiSQL y volver a intentar.',
    });
  }
  next(err);
});

export default router;
