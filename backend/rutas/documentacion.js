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

   UNA CARGA DEL PORTAL NO SUSPENDE UN PLAZO POR SÍ SOLA (sección 6.3). Entra
   con estado PENDIENTE DE REVISION y no cuenta como documentación vigente
   hasta que un agente la aprueba. Si esto se rompe, cualquiera detiene una
   intimación subiendo un archivo.

   EL NÚMERO DE EXPEDIENTE DE TRÁMITE no es el expediente de multa: uno acredita
   cumplimiento y el otro inicia una sanción. Se guarda en
   `tramite.numero_referencia` y no comparte campo con el otro.
   ============================================================================ */

import { Router } from 'express';
import { consultar, enTransaccion } from '../conexion-bd.js';
import {
  cicloActual,
  insertarTramite,
  localPorId,
  parametros,
  tramitePorId,
  tramitesPorTipo,
} from '../consultas.js';
import { ID_ESTADO, ID_TDOC, ID_TTRAMITE } from '../mapeo.js';
import { requiereRol, firmante } from '../middlewares/usuario.js';
import { hoyISO } from '../../src/dominio/fechas.js';
import { vencimientoDocumento } from '../../src/dominio/vigencias.js';

const router = Router();

/* Tipo que manda el front -> id de la tabla tipo_documentacion. */
const TDOC_POR_TIPO = {
  DDJJ: ID_TDOC.DDJJ,
  CONTRATO: ID_TDOC.CONTRATO,
  DDJJ_RECICLAJE: ID_TDOC.DDJJ_RECICLAJE,
};

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

   `validado` decide con qué estado entra:
     - lo carga un agente (validado distinto de false) -> VIGENTE, cuenta ya
     - lo sube el titular por el portal               -> PENDIENTE DE REVISION

   EL VENCIMIENTO SE CALCULA ACÁ Y SE GUARDA. La DDJJ vence al año exacto; el
   contrato trae su propia fecha. No se recalcula nunca al consultar: si mañana
   cambia la regla, los documentos viejos siguen mostrando el plazo que se les
   aplicó cuando se registraron (sección 5.2). */
router.post('/', async (req, res, next) => {
  try {
    if (!req.usuario) return res.status(401).json({ error: 'Falta identificar al usuario' });

    const datos = req.body ?? {};
    const idLocal = Number(datos.localId);
    const idTdoc = TDOC_POR_TIPO[datos.tipo];

    if (!idTdoc) {
      return res.status(400).json({ error: `Tipo inválido. Valores posibles: ${Object.keys(TDOC_POR_TIPO).join(', ')}` });
    }
    const local = await localPorId(idLocal);
    if (!local) return res.status(404).json({ error: 'Local no encontrado' });
    if (!datos.fechaEmision) return res.status(400).json({ error: 'Falta la fecha de emisión del documento' });
    if (datos.tipo === 'CONTRATO' && !datos.fechaVencimiento) {
      return res.status(400).json({ error: 'El contrato tiene que traer su fecha de vencimiento' });
    }
    // El origen INFORME_9DJ lo pone únicamente el módulo del informe: es lo
    // que da fe de que ese contrato salió de una carga concreta y auditable.
    if (datos.origen === 'INFORME_9DJ') {
      return res.status(400).json({
        error: 'Los contratos informados por la prestataria se cargan desde Herramientas → Informe 9 de Julio, no desde acá.',
      });
    }

    // El titular sube por el portal: queda pendiente. Un agente lo carga: vale.
    const validado = datos.validado !== false && req.usuario.rol !== 'titular';
    const params = await parametros();
    const vencimiento = vencimientoDocumento(datos, params.modoBisiesto);
    const ciclo = await cicloActual(idLocal);
    const idEstado = validado ? ID_ESTADO.DOC_VIGENTE : ID_ESTADO.DOC_PENDIENTE_REVISION;

    const idTramite = await enTransaccion(async (cx) => {
      const id = await insertarTramite(cx, {
        idLocal,
        idEstado,
        idTtramite: ID_TTRAMITE.PRESENTACION_DOCUMENTACION,
        idUsuario: req.usuario?.id ?? null,
        nroCiclo: ciclo,
        numeroReferencia: datos.expedienteTramite ?? null,
        fechaInicio: datos.fechaEmision || hoyISO(),
        fechaVencimiento: vencimiento || null,
        observaciones: datos.observaciones ?? '',
      });

      await cx.execute(
        `INSERT INTO documentacion
           (id_tramite, id_tdocumentacion, numero, origen, fecha_emision, fecha_vencimiento, habilita)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [
          id,
          idTdoc,
          datos.numero ?? null,
          datos.origen ?? 'PRESENTADO_TITULAR',
          datos.fechaEmision,
          vencimiento || null,
        ],
      );


      return id;
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
   parte del expediente. */
router.post('/:id/validacion', requiereRol('administrativo', 'coordinacion', 'direccion'), async (req, res, next) => {
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

    const aprobar = req.body?.aprobar !== false;
    const observaciones = (req.body?.observaciones ?? '').trim();

    await enTransaccion(async (cx) => {
      if (aprobar) {
        const nota = `${tramite.observaciones ? `${tramite.observaciones} · ` : ''}Aprobada por ${firmante(req)}.${observaciones ? ` ${observaciones}` : ''}`;
        await cx.execute('UPDATE tramite SET id_estado = ?, fecha_cierre = NOW(), observaciones = ? WHERE id_tramite = ?', [
          ID_ESTADO.DOC_VIGENTE,
          nota,
          tramite.id,
        ]);
      } else {
        const nota = `${tramite.observaciones ? `${tramite.observaciones} · ` : ''}Rechazada por ${firmante(req)}.${observaciones ? ` ${observaciones}` : ''}`;
        await cx.execute('UPDATE tramite SET habilita = 0, fecha_cierre = NOW(), observaciones = ? WHERE id_tramite = ?', [
          nota,
          tramite.id,
        ]);
        await cx.execute('UPDATE documentacion SET habilita = 0 WHERE id_tramite = ?', [tramite.id]);
      }
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
