/* ============================================================================
   backend/rutas/documentacion.js  —  DDJJ Y CONTRATOS (sección 4.5)
   ----------------------------------------------------------------------------
   Reemplaza estas funciones de src/datos/DatosProvider.jsx:

     presentacionesPendientes()  ->  GET  /documentacion/pendientes
     registrarDocumento          ->  POST /documentacion
                                     { localId, tipo, numero, fechaEmision, ... }
     validarPresentacion         ->  POST /documentacion/:id/validacion
                                     { aprobar, observaciones }

   CÓMO SE GUARDA: un documento son DOS filas. El trámite (tabla `tramite`, tipo
   PRESENTACION DE DOCUMENTACION) es el acto administrativo; la fila de
   `documentacion` son los datos del papel: tipo, número, emisión y vencimiento.
   Por eso las dos se escriben juntas, en una transacción.

   LA FECHA DEL TRÁMITE ES LA DE LA PRESENTACIÓN, NO LA DE EMISIÓN DEL PAPEL.
   La fecha de emisión vive en `documentacion.fecha_emision`. El trámite lleva
   el día en que se registró, porque con eso se decide qué pasó último en el
   local (sección 4.4). Antes llevaba la de emisión, y una DDJJ emitida antes
   de la segunda cédula pero presentada después quedaba "antes" en el
   historial: al vencer, el local saltaba a expediente en vez de volver a
   primera notificación.

   UNA CARGA DEL PORTAL NO SUSPENDE UN PLAZO POR SÍ SOLA (sección 6.3). Entra
   con estado PENDIENTE DE REVISION y no cuenta como documentación vigente
   hasta que un agente la aprueba. Si esto se rompe, cualquiera detiene una
   intimación subiendo un archivo.

   EL NÚMERO DE EXPEDIENTE DE TRÁMITE no es el expediente de multa: uno acredita
   cumplimiento y el otro inicia una sanción. Se guarda en
   `tramite.numero_referencia` de un trámite de presentación, y el de multa en
   el mismo campo de un trámite de expediente: el tipo de trámite los separa.

   EL ORIGEN "INFORME 9 DE JULIO" NO SE ACEPTA ACÁ. Ese contrato solo entra por
   Herramientas → Informe 9 de Julio (sección 4.6): tiene otro valor
   probatorio y su vigencia solo se modifica por esa vía.
   ============================================================================ */

import { Router } from 'express';
import { consultar, consultarEn } from '../conexion-bd.js';
import {
  insertarTramite,
  parametros,
  recortarObservacion,

  tramitePorId,
  tramitesPorTipo,
} from '../consultas.js';
import { ID_ESTADO, ID_TDOC, ID_TTRAMITE } from '../mapeo.js';
import { requiereRol, firmante } from '../middlewares/usuario.js';
import { ErrorActo, ejecutarActo } from '../actos.js';
import { archivosDisponibles, guardarImagen, leerDocumento } from '../archivos.js';
import { fmtFecha, hoyISO } from '../../src/dominio/fechas.js';
import { ETIQUETA_DOCUMENTO } from '../../src/dominio/actuaciones.js';
import { vencimientoDocumento } from '../../src/dominio/vigencias.js';
import {
  COORDINACION_COMPLETA_PRESENTACION,
  ESTADOS_CON_DOCUMENTACION,
  ROLES_QUE_VALIDAN,
  TIPO_PROVISORIO_PORTAL,
} from '../../src/dominio/reglas.js';
import { etiquetaEstado } from '../../src/dominio/estados.js';

const router = Router();

/* Tipo que manda el front -> id de la tabla tipo_documentacion. */
const TDOC_POR_TIPO = {
  DDJJ: ID_TDOC.DDJJ,
  CONTRATO: ID_TDOC.CONTRATO,
  DDJJ_RECICLAJE: ID_TDOC.DDJJ_RECICLAJE,
};

const esFechaISO = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/* EL NÚMERO NO SE REPITE (sección 5.4: numeraciones con significado legal,
   sin reutilización). Una DDJJ es de un solo local: su número no puede estar
   en otro. Un contrato con la prestataria puede cubrir varios locales del
   mismo titular, así que se controla dentro del local. Las presentaciones
   rechazadas (dadas de baja) no cuentan: el titular puede volver a presentar
   la misma. `excepto` deja afuera la presentación que se está aprobando.
   Devuelve el ErrorActo, o null si el número está libre. */
async function numeroRepetido(cx, { tipo, numero, idLocal, excepto = null }) {
  const idTdoc = TDOC_POR_TIPO[tipo];
  const etiqueta = ETIQUETA_DOCUMENTO[tipo] ?? tipo;
  const [repetido] = await consultarEn(
    cx,
    `SELECT t.id_local FROM documentacion d
       JOIN tramite t ON t.id_tramite = d.id_tramite
      WHERE d.id_tdocumentacion = ? AND d.numero = ? AND d.habilita = 1 AND t.habilita = 1
        ${tipo === 'CONTRATO' ? 'AND t.id_local = ?' : ''}
        ${excepto ? 'AND d.id_tramite <> ?' : ''}
      LIMIT 1`,
    [idTdoc, numero, ...(tipo === 'CONTRATO' ? [idLocal] : []), ...(excepto ? [excepto] : [])],
  );
  if (!repetido) return null;
  return new ErrorActo(
    409,
    Number(repetido.idLocal) === idLocal
      ? `${etiqueta} N° ${numero} ya está registrada en este local.`
      : `${etiqueta} N° ${numero} ya está registrada en el local N° ${repetido.idLocal}. Revisá el número.`,
  );
}

/* GET /documentacion/pendientes  ->  la bandeja de validación del portal. */
router.get('/pendientes', async (_req, res, next) => {
  try {
    const todos = await tramitesPorTipo([ID_TTRAMITE.PRESENTACION_DOCUMENTACION]);
    res.json(todos.filter((t) => t.idEstado === ID_ESTADO.DOC_PENDIENTE_REVISION));
  } catch (e) {
    next(e);
  }
});

/* GET /documentacion  ->  todas las presentaciones. */
router.get('/', async (_req, res, next) => {
  try {
    res.json(await tramitesPorTipo([ID_TTRAMITE.PRESENTACION_DOCUMENTACION]));
  } catch (e) {
    next(e);
  }
});

/* POST /documentacion  ->  registra una DDJJ, una DDJJ de reciclaje o un contrato.

   Con qué estado entra:
     - lo carga un agente de la oficina -> VIGENTE, cuenta ya
     - lo sube el titular por el portal -> PENDIENTE DE REVISION

   Quién puede: el titular (siempre queda pendiente) o un rol que tenga el acto
   "Registrar documentación" de src/dominio/reglas.js (administrativo,
   coordinación). Antes alcanzaba con estar identificado: un relevador podía
   cargar una DDJJ vigente y sacar un local del circuito.

   EL VENCIMIENTO SE CALCULA ACÁ Y SE GUARDA. La DDJJ vence al año exacto; el
   contrato trae su propia fecha. No se recalcula nunca al consultar: si mañana
   cambia la regla, los documentos viejos siguen mostrando el plazo que se les
   aplicó cuando se registraron (sección 5.2). */
router.post('/', async (req, res, next) => {
  try {
    if (!req.usuario) return res.status(401).json({ error: 'Falta identificar al usuario' });

    const esTitular = req.usuario.rol === 'titular';
    // El titular ya no indica tipo, número ni expediente: los completa
    // coordinación al aprobar (COORDINACION_COMPLETA_PRESENTACION,
    // src/dominio/reglas.js). Si los manda igual, se guardan.
    const completaCoordinacion = esTitular && COORDINACION_COMPLETA_PRESENTACION;
    const datos = { ...(req.body ?? {}) };
    if (completaCoordinacion && !datos.tipo) datos.tipo = TIPO_PROVISORIO_PORTAL;
    const idLocal = Number(datos.localId);
    const idTdoc = TDOC_POR_TIPO[datos.tipo];
    const hoy = hoyISO();

    if (!idTdoc) {
      return res.status(400).json({ error: `Tipo inválido. Valores posibles: ${Object.keys(TDOC_POR_TIPO).join(', ')}` });
    }
    const numero = String(datos.numero ?? '').trim();
    if (!numero && !completaCoordinacion) return res.status(400).json({ error: 'Falta el número del documento' });
    // documentacion.numero es varchar(50) en la base del área.
    if (numero.length > 50) {
      return res.status(400).json({ error: 'El número del documento es demasiado largo (máximo 50 caracteres).' });
    }
    if (!esFechaISO(datos.fechaEmision)) return res.status(400).json({ error: 'Falta la fecha de emisión del documento, o no es válida' });
    if (datos.fechaEmision > hoy) return res.status(400).json({ error: 'La fecha de emisión no puede ser futura' });
    if (datos.tipo === 'CONTRATO') {
      if (!esFechaISO(datos.fechaVencimiento)) {
        return res.status(400).json({ error: 'El contrato tiene que traer su fecha de vencimiento' });
      }
      if (datos.fechaVencimiento <= datos.fechaEmision) {
        return res.status(400).json({ error: 'El vencimiento del contrato tiene que ser posterior a su emisión' });
      }
    }
    /* >>> EL EXPEDIENTE DE TRÁMITE NO LO INVENTA ESTE SISTEMA <<<
       Presentar una DDJJ o un contrato inicia un trámite administrativo POR
       FUERA de este sistema, y ese trámite tiene su número. Acá solo se
       registra: sin él no se puede reconstruir qué trámite respalda la
       acreditación (si mañana el comercio impugna una sanción alegando que
       presentó, no habría forma de rastrearlo). Por eso es OBLIGATORIO, y por
       eso NO se autogenera: un número inventado para que el sistema deje
       guardar es un dato sin ningún sentido.

       Las presentaciones HISTÓRICAS sin número ya viven en la base con el
       campo vacío y el historial las muestra como "no registrado": no hace
       falta ninguna marca al cargar. A propósito NO existe una casilla para
       guardar sin número: sería la puerta para saltearse la obligatoriedad
       en una presentación nueva.

       TODO-DEFINICION (corrección al pliego 4.5): CiDiTuc NO asigna números de
       expediente ni interviene en el timbrado. Falta que la Dirección confirme
       qué pasa hoy realmente al presentar: quién asigna el número y dónde se
       abona el timbrado. Según la respuesta, cambia la etiqueta del campo, o
       pasa a opcional, o se evalúa un circuito de pago (hoy descartado: el
       sistema no cobra, no verifica pagos ni contempla presentaciones
       impagas).

       Desde el 28/10/2026 el titular presenta SIN expediente: el número
       existe recién cuando coordinación inicia el trámite, y lo carga al
       aprobar (la aprobación sí lo exige, ver /:id/validacion). La carga de
       la oficina lo sigue pidiendo acá. */
    const expedienteManual = String(datos.expedienteTramite ?? '').trim();
    // Los contratos del informe 9DJ no pasan por acá (los rechaza el guard de
    // abajo con su propio mensaje): no se les exige expediente de trámite.
    if (!expedienteManual && datos.origen !== 'INFORME_9DJ' && !completaCoordinacion) {
      return res.status(400).json({
        error: 'Falta el número de expediente del trámite: es el que se obtiene al iniciar la presentación en el municipio.',
      });
    }
    // El origen INFORME_9DJ lo pone únicamente el módulo del informe: es lo
    // que da fe de que ese contrato salió de una carga concreta y auditable.
    if (datos.origen === 'INFORME_9DJ') {
      return res.status(400).json({
        error: 'Los contratos informados por la prestataria se cargan desde Herramientas → Informe 9 de Julio, no desde acá.',
      });
    }

    /* EL DOCUMENTO RESPALDATORIO (sección 6.3: "adjuntando el documento"). Se
       guarda si la base tiene la tabla `archivo` (sql/08). Con la tabla, el
       titular no puede presentar sin adjuntarlo: la oficina tiene que poder
       ver qué está aprobando. La oficina sí puede registrar un papel que
       todavía no escaneó. */
    let adjunto = null;
    if (archivosDisponibles()) {
      if (typeof datos.adjunto === 'string' && datos.adjunto.startsWith('data:')) {
        adjunto = leerDocumento(datos.adjunto);
        if (adjunto.error) return res.status(400).json({ error: adjunto.error });
      } else if (esTitular) {
        return res.status(400).json({ error: 'Adjuntá el documento: la oficina tiene que poder verlo para aprobarlo' });
      }
    }
    // El titular sube por el portal: queda pendiente. Un agente lo carga: vale.
    const validado = datos.validado !== false && !esTitular;
    const params = await parametros();
    const vencimiento = vencimientoDocumento(datos, params.modoBisiesto);
    const etiqueta = ETIQUETA_DOCUMENTO[datos.tipo] ?? datos.tipo;

    const { idTramite } = await ejecutarActo(req, {
      idLocal,
      accion: esTitular ? null : 'registrar-documentacion',
      nombre: 'presentacion-portal',
      controlar: async ({ estado }, cx) => {
        if (esTitular && estado === 'EXENTO_CONFIRMADO') {
          return new ErrorActo(409, 'El local está exento: no tiene que presentar documentación.');
        }
        /* Con documentación vigente (o una presentación esperando validación)
           no se registra otra: sería redundante, o contradictoria (una DDJJ
           encima de un contrato vigente). Vale para la oficina y para el
           titular por igual. */
        if (ESTADOS_CON_DOCUMENTACION.includes(estado)) {
          return new ErrorActo(
            409,
            estado === 'PRESENTACION_EN_REVISION'
              ? 'Ya hay una presentación de este local esperando validación: primero hay que resolverla.'
              : `El local ya tiene documentación vigente (${etiquetaEstado(estado)}): no corresponde registrar otra hasta que venza.`,
          );
        }
        // El número no se repite (numeroRepetido, arriba). Se lee dentro de la
        // transacción y en fila, así dos cargas simultáneas no pasan las dos.
        // Sin número (portal), se controla al aprobar.
        return numero ? numeroRepetido(cx, { tipo: datos.tipo, numero, idLocal }) : null;
      },
      motivo: (r) =>
        `${etiqueta}${numero ? ` N° ${numero}` : ''} ${validado ? 'registrada' : 'presentada, pendiente de validación'}${vencimiento ? `; vence el ${fmtFecha(vencimiento)}` : ''} · ${r.expediente ? `expediente de trámite ${r.expediente}` : 'el expediente lo carga coordinación'}`,
      trabajo: async (cx, { actuaciones }) => {
        const ciclo = Math.max(1, ...actuaciones.map((a) => Number(a.ciclo) || 1));
        const expediente = expedienteManual;
        const id = await insertarTramite(cx, {
          idLocal,
          idEstado: validado ? ID_ESTADO.DOC_VIGENTE : ID_ESTADO.DOC_PENDIENTE_REVISION,
          idTtramite: ID_TTRAMITE.PRESENTACION_DOCUMENTACION,
          idUsuario: req.usuario?.id ?? null,
          nroCiclo: ciclo,
          numeroReferencia: expediente || null,
          fechaInicio: hoy,
          fechaVencimiento: vencimiento || null,
          observaciones: datos.observaciones ?? '',
        });

        // El origen dice QUIÉN cargó el documento: el titular desde el portal
        // o un agente de la oficina (que lo recibió en papel o por mail). El
        // tercer valor, INFORME_9DJ, lo pone el módulo del informe. Antes se
        // guardaba siempre "presentado por el titular", y en Documentación
        // no se podía distinguir una carga de la oficina.
        await cx.execute(
          `INSERT INTO documentacion
             (id_tramite, id_tdocumentacion, numero, origen, fecha_emision, fecha_vencimiento, habilita)
           VALUES (?, ?, ?, ?, ?, ?, 1)`,
          [id, idTdoc, numero || null, esTitular ? 'PRESENTADO_TITULAR' : 'CARGADO_OFICINA', datos.fechaEmision, vencimiento || null],
        );
        if (adjunto) {
          await guardarImagen(cx, req, { idTramite: id, imagen: adjunto, tipoArchivo: 'documento', nombreOriginal: datos.adjuntoNombre });
        }
        return { idTramite: id, expediente };
      },
    });

    res.status(201).json(await tramitePorId(idTramite));
  } catch (e) {
    next(e);
  }
});

/* POST /documentacion/:id/validacion  ->  un agente aprueba o rechaza.

   Aprobada pasa a VIGENTE y recién ahí saca al local del circuito.
   Rechazada se da de baja lógica: la presentación queda registrada, pero no
   cuenta. No se borra, porque haber presentado algo y que se lo rechacen es
   parte del expediente. Una presentación ya validada no se vuelve a validar.

   AL APROBAR, COORDINACIÓN COMPLETA LO QUE EL TITULAR YA NO CARGA
   (COORDINACION_COMPLETA_PRESENTACION): { tipo, numero, expedienteTramite,
   fechaVencimiento }. El expediente es obligatorio para aprobar: es el
   respaldo de la acreditación; el número del documento también (desde el
   30/10/2026 el titular no lo carga). El tipo, si no se manda, queda el
   presentado; si cambia, el vencimiento se calcula con el tipo nuevo (el
   contrato trae el suyo). Si cambia el tipo o el número, se vuelve a
   controlar que el número no esté repetido.

   Solo valida coordinación (ROLES_QUE_VALIDAN); hasta el 28/10/2026 también
   administrativo. */
router.post('/:id/validacion', requiereRol(...ROLES_QUE_VALIDAN), async (req, res, next) => {
  try {
    const tramite = await tramitePorId(Number(req.params.id));
    if (!tramite) return res.status(404).json({ error: 'No existe esa presentación' });
    if (!['DDJJ', 'DDJJ_RECICLAJE', 'CONTRATO'].includes(tramite.tipo)) {
      return res.status(400).json({ error: 'La actuación indicada no es una presentación de documentación' });
    }
    /* >>> LOS CONTRATOS DEL INFORME 9DJ NO SE TOCAN DESDE ACÁ <<<
       Lo que dijo la foto de la prestataria solo lo cambia la foto siguiente o
       la anulación de esa carga, desde el módulo del informe. Aprobarlo o
       rechazarlo a mano acá rompería la trazabilidad de qué informe dijo qué
       (especificación del módulo, regla de inmutabilidad). */
    if (tramite.origen === 'INFORME_9DJ') {
      return res.status(409).json({
        error:
          'Este contrato viene del informe de la prestataria 9 de Julio: no se valida ni se rechaza desde acá. ' +
          'Se modifica cargando el informe siguiente o anulando su carga, en Herramientas → Informe 9 de Julio.',
      });
    }

    if (tramite.validado !== false) {
      return res.status(409).json({ error: 'Esa presentación ya fue validada' });
    }

    const aprobar = req.body?.aprobar !== false;
    const observaciones = String(req.body?.observaciones ?? '').trim();
    // Un rechazo sin motivo deja al titular sin saber qué corregir y al
    // historial sin la razón del acto (el motivo se ve en el portal).
    if (!aprobar && !observaciones) {
      return res.status(400).json({ error: 'Para rechazar, escribí el motivo: el titular tiene que saber qué corregir' });
    }
    const etiquetaPresentada = ETIQUETA_DOCUMENTO[tramite.tipo] ?? tramite.tipo;

    // Lo que completa coordinación al aprobar. Lo que no manda queda como se presentó.
    let tipo = tramite.tipo;
    let numero = String(tramite.numero ?? '').trim();
    let expediente = String(tramite.expedienteTramite ?? '').trim();
    let vencimiento = tramite.fechaVencimiento;
    if (aprobar) {
      if (req.body?.tipo !== undefined) {
        if (!TDOC_POR_TIPO[req.body.tipo]) {
          return res.status(400).json({ error: `Tipo inválido. Valores posibles: ${Object.keys(TDOC_POR_TIPO).join(', ')}` });
        }
        tipo = req.body.tipo;
      }
      const numeroNuevo = String(req.body?.numero ?? '').trim();
      if (numeroNuevo) numero = numeroNuevo;
      if (!numero) {
        return res.status(400).json({ error: 'Para aprobar, cargá el número del documento.' });
      }
      // documentacion.numero es varchar(50) en la base del área.
      if (numero.length > 50) {
        return res.status(400).json({ error: 'El número del documento es demasiado largo (máximo 50 caracteres).' });
      }
      const expedienteNuevo = String(req.body?.expedienteTramite ?? '').trim();
      if (expedienteNuevo) expediente = expedienteNuevo;
      if (!expediente) {
        return res.status(400).json({ error: 'Para aprobar, cargá el número de expediente del trámite.' });
      }
      // tramite.numero_referencia es varchar(50) en la base del área.
      if (expediente.length > 50) {
        return res.status(400).json({ error: 'El número de expediente es demasiado largo (máximo 50 caracteres).' });
      }
      const cambiaTipo = tipo !== tramite.tipo;
      if (tipo === 'CONTRATO') {
        const fecha = req.body?.fechaVencimiento || (cambiaTipo ? '' : tramite.fechaVencimiento);
        if (!esFechaISO(fecha) || fecha <= tramite.fechaEmision) {
          return res.status(400).json({ error: 'Indicá el vencimiento del contrato: la fecha que declara, posterior a su emisión.' });
        }
        vencimiento = fecha;
      } else if (cambiaTipo) {
        vencimiento = vencimientoDocumento({ tipo, fechaEmision: tramite.fechaEmision }, (await parametros()).modoBisiesto);
      }
    }
    const etiqueta = ETIQUETA_DOCUMENTO[tipo] ?? tipo;

    await ejecutarActo(req, {
      idLocal: tramite.localId,
      nombre: aprobar ? 'aprobar-presentacion' : 'rechazar-presentacion',
      // Un número nuevo, o el mismo con otro tipo (otra numeración), puede estar repetido.
      controlar:
        aprobar && (tipo !== tramite.tipo || numero !== String(tramite.numero ?? '').trim())
          ? (_antes, cx) => numeroRepetido(cx, { tipo, numero, idLocal: tramite.localId, excepto: tramite.id })
          : undefined,
      motivo: aprobar
        ? `${etiqueta} N° ${numero} aprobada · expediente de trámite ${expediente}` +
          `${tipo !== tramite.tipo ? ` (presentada como ${etiquetaPresentada})` : ''}` +
          `${vencimiento ? `; vence el ${fmtFecha(vencimiento)}` : ''}${observaciones ? `: ${observaciones}` : ''}`
        : `${etiquetaPresentada}${tramite.numero ? ` N° ${tramite.numero}` : ''} rechazada${observaciones ? `: ${observaciones}` : ''}`,
      forzarRegistro: !aprobar,
      trabajo: async (cx) => {
        if (aprobar) {
          const nota = recortarObservacion(
            `${tramite.observaciones ? `${tramite.observaciones} · ` : ''}Aprobada por ${firmante(req)}.${observaciones ? ` ${observaciones}` : ''}`,
          );
          await cx.execute(
            `UPDATE tramite SET id_estado = ?, fecha_cierre = NOW(), observaciones = ?, numero_referencia = ?, fecha_vencimiento = ?
              WHERE id_tramite = ?`,
            [ID_ESTADO.DOC_VIGENTE, nota, expediente, vencimiento || null, tramite.id],
          );
          await cx.execute(
            'UPDATE documentacion SET id_tdocumentacion = ?, numero = ?, fecha_vencimiento = ? WHERE id_tramite = ?',
            [TDOC_POR_TIPO[tipo], numero, vencimiento || null, tramite.id],
          );
        } else {
          const nota = recortarObservacion(
            `${tramite.observaciones ? `${tramite.observaciones} · ` : ''}Rechazada por ${firmante(req)}.${observaciones ? ` ${observaciones}` : ''}`,
          );
          await cx.execute('UPDATE tramite SET habilita = 0, fecha_cierre = NOW(), observaciones = ? WHERE id_tramite = ?', [
            nota,
            tramite.id,
          ]);
          await cx.execute('UPDATE documentacion SET habilita = 0 WHERE id_tramite = ?', [tramite.id]);
        }
        return { idTramite: tramite.id };
      },
    });

    res.json(aprobar ? await tramitePorId(tramite.id) : { ok: true, rechazada: tramite.id });
  } catch (e) {
    next(e);
  }
});

/* GET /documentacion/tipos  ->  el catálogo, para los desplegables del front. */
router.get('/tipos', async (_req, res, next) => {
  try {
    const filas = await consultar('SELECT * FROM tipo_documentacion WHERE habilita = 1 ORDER BY id_tdocumentacion');
    res.json(filas.map((f) => ({ id: f.idTdocumentacion, nombre: f.nombreTdocumentacion })));
  } catch (e) {
    next(e);
  }
});

export default router;
