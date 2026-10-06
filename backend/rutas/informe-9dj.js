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

   >>> LOS CONTRATOS DE ORIGEN INFORME_9DJ SON DE ESTE MÓDULO <<<
   Desde la ficha del local no se editan ni se dan de baja (lo rechaza
   rutas/documentacion.js): la foto la pisa la foto siguiente o la anulación
   de la carga, nunca una corrección manual suelta, porque ahí se pierde la
   trazabilidad de qué informe dijo qué.

   Necesita las tablas de backend/sql/05-tablas-informe-9dj.sql. Si no están,
   cada endpoint responde 503 diciendo qué correr.
   ============================================================================ */

import { Router } from 'express';
import { consultar, enTransaccion } from '../conexion-bd.js';
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
   El CUIT solo no alcanza: en el padrón hay 120 CUIT con más de un local (las
   sucursales). El criterio es CUIT + DIRECCIÓN:
     - CUIT inválido          ->  NO_ENCONTRADO (primero lo corrige el agente)
     - CUIT de ningún local   ->  NO_ENCONTRADO
     - CUIT de UN local       ->  ENCONTRADO
     - CUIT de varios locales ->  decide la dirección; si ninguna coincide,
                                  NO_ENCONTRADO con los candidatos a la vista,
                                  para que el agente vincule a mano.
   NUNCA "el primero que aparezca": confirmarle el contrato a la sucursal
   equivocada la saca del circuito de notificación sin que nadie lo decida.
   --------------------------------------------------------------------------- */
const soloDigitos = (t) => String(t ?? '').replace(/\D/g, '');
const normalizar = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/* Dos direcciones coinciden si tienen la misma altura y comparten la calle
   (los tokens no numéricos de una aparecen en la otra). "AV. SAN MARTIN 450"
   coincide con "San Martín 450", no con "SAN MARTIN 1200". */
function direccionesCoinciden(a, b) {
  const na = normalizar(a);
  const nb = normalizar(b);
  if (!na || !nb) return false;
  const alturaA = na.match(/\d+/)?.[0];
  const alturaB = nb.match(/\d+/)?.[0];
  if (alturaA !== alturaB) return false;
  const palabras = (t) => t.replace(/\d+/g, ' ').split(' ').filter((p) => p.length > 2);
  const pa = palabras(na);
  const pb = palabras(nb);
  if (!pa.length || !pb.length) return Boolean(alturaA);
  const [cortas, largas] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  return cortas.every((p) => largas.includes(p));
}

async function cruzarFila(fila, porCuit) {
  if (!fila.cuitValido) return { cruce: 'NO_ENCONTRADO', idLocal: null, candidatos: null };

  const candidatos = porCuit.get(fila.cuit) ?? [];
  if (!candidatos.length) return { cruce: 'NO_ENCONTRADO', idLocal: null, candidatos: null };
  if (candidatos.length === 1) return { cruce: 'ENCONTRADO', idLocal: candidatos[0].id, candidatos: null };

  const porDireccion = candidatos.find((l) => direccionesCoinciden(l.direccion, fila.direccion));
  if (porDireccion) return { cruce: 'ENCONTRADO', idLocal: porDireccion.id, candidatos: null };

  return { cruce: 'NO_ENCONTRADO', idLocal: null, candidatos: candidatos.map((l) => l.id).join(',') };
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

    // El cruce contra el padrón, con los locales agrupados por CUIT.
    const padron = await consultar(
      'SELECT id_local id, cuit, direccion_local direccion FROM local WHERE habilita = 1',
    );
    const porCuit = new Map();
    for (const l of padron) {
      const cuit = soloDigitos(l.cuit);
      if (cuit.length !== 11) continue;
      if (!porCuit.has(cuit)) porCuit.set(cuit, []);
      porCuit.get(cuit).push(l);
    }

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
        const { cruce, idLocal, candidatos } = await cruzarFila(fila, porCuit);
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

    // La decisión tiene que corresponder a lo que el cruce encontró.
    let idLocal = fila.idLocal;
    // Confirmar exige un local: una fila que no cruzó no tiene a quién
    // confirmarle el contrato. Rechazarla, en cambio, siempre se puede.
    if (decision === 'CONFIRMADA' && fila.cruce !== 'ENCONTRADO') {
      return res.status(400).json({ error: 'Esta fila no cruzó con ningún local: vinculala, dala de alta o dejala pendiente.' });
    }
    if (decision === 'VINCULADA') {
      idLocal = Number(req.body?.idLocal);
      const [existe] = await consultar('SELECT id_local FROM local WHERE id_local = ? AND habilita = 1', [idLocal]);
      if (!existe) return res.status(400).json({ error: 'Para vincular hace falta un local existente del padrón.' });
    }
    if (decision === 'ALTA' && fila.cruce === 'ENCONTRADO') {
      return res.status(400).json({ error: 'Esta fila ya cruzó con un local del padrón: no corresponde un alta.' });
    }
    if (['SIN_REVISAR', 'ALTA'].includes(decision)) idLocal = decision === 'ALTA' ? null : fila.idLocal;

    await consultar(
      `UPDATE informe_9dj_fila
          SET decision = ?, id_local = ?, usuario_decision = ?, fecha_decision = NOW()
        WHERE id_fila = ?`,
      [decision, idLocal, req.usuario.nombre, fila.idFila],
    );
    res.json({ ok: true, id: fila.idFila, decision, idLocal });
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
          // El local nuevo entra SIN coordenada: la geocodificación tarda un
          // segundo por dirección y acá puede haber decenas de altas. Después
          // se geocodifican por lotes desde Herramientas, como el resto.
          const [r] = await cx.execute(
            `INSERT INTO local
               (cuit, id_original, id_rubro, id_estado, razon_social, nombre_local, direccion_local,
                latitud_local, longitud_local, observacion, bloqueado, habilita)
             VALUES (?, NULL, 1, ?, ?, ?, ?, NULL, NULL, ?, 0, 1)`,
            [
              f.cuit,
              ID_ESTADO.REVISION_DATOS,
              f.razonSocial ?? null,
              f.razonSocial ?? 'SIN NOMBRE',
              f.direccion ?? '',
              recortarObservacion(`Creado desde el informe de la prestataria (carga N° ${informe.idInforme}).`),
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
        'Faltan las tablas del módulo Informe 9 de Julio. Correr backend/sql/05-tablas-informe-9dj.sql desde HeidiSQL y volver a intentar.',
    });
  }
  next(err);
});

export default router;
