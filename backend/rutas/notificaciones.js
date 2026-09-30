/* ============================================================================
   backend/rutas/notificaciones.js  —  CÉDULAS (etapas 3 y 4)
   ----------------------------------------------------------------------------
   Reemplaza estas funciones de src/datos/DatosProvider.jsx:

     cedulas()            ->  GET  /notificaciones
     generarCedula        ->  POST /notificaciones            { localId }
     regenerarCedula      ->  POST /notificaciones/:id/regenerar
     asignarNotificador   ->  PUT  /notificaciones/:id/notificador  { notificadorId }
     marcarImpresa        ->  POST /notificaciones/:id/impresion
     registrarEntrega     ->  POST /notificaciones/:id/entrega
                              { resultado, fechaEntrega, observaciones }

   TRES COSAS QUE GARANTIZA EL SERVIDOR Y EL FRONT NO PUEDE:

   1. El número de cédula no se repite nunca. Sale de MAX(correlativo)+1, pero
      las emisiones se encolan en memoria (enFila) para que dos que entren al
      mismo tiempo no lean el mismo máximo. Ver el bloque NUMERACIÓN DE CÉDULAS
      en consultas.js. El formato es el de la base ('0001-696'), no el de la
      maqueta: ver numeroDeCedula() en backend/mapeo.js.
   2. Sin CUIT, razón social y rubro no se emite. La cédula tiene que
      individualizar al sujeto obligado; sin eso la notificación es impugnable
      (sección 4.3). El formulario ya lo valida, pero el formulario corre en el
      navegador del usuario.
   3. El vencimiento se calcula UNA vez, al registrar la entrega, con los
      feriados y los parámetros que están vigentes ese día, y se guarda. Nunca
      se recalcula al consultar (vencimiento materializado, sección 5.2).
   ============================================================================ */

import { Router } from 'express';
import { consultar, ejecutar, enTransaccion } from '../conexion-bd.js';
import {
  cicloActual,
  feriados,
  localPorId,
  parametros,
  siguienteNumeroCedula,
  enFila,
  insertarTramite,
  tramitePorId,
  tramitesDeLocal,
  tramitesPorTipo,
} from '../consultas.js';
import { ESTADO_POR_RESULTADO, ID_ESTADO, ID_TTRAMITE, estadoDeLocal, numeroDeCedula } from '../mapeo.js';
import { requiereRol } from '../middlewares/usuario.js';
import { hoyISO, vencimientoHabil } from '../../src/dominio/fechas.js';
import { datosRegistralesCompletos, faltantesRegistrales } from '../../src/dominio/reglas.js';

const router = Router();

const TIPOS_NOTIFICACION = [ID_TTRAMITE.PRIMERA_NOTIFICACION, ID_TTRAMITE.SEGUNDA_NOTIFICACION];

/* Comprueba que el trámite exista y sea una notificación. Devuelve null y
   responde el error si no: las cinco rutas de abajo empiezan igual. */
async function notificacionDe(req, res) {
  const tramite = await tramitePorId(Number(req.params.id));
  if (!tramite) {
    res.status(404).json({ error: 'No existe esa actuación' });
    return null;
  }
  if (tramite.tipo !== 'NOTIFICACION') {
    res.status(400).json({ error: 'La actuación indicada no es una notificación' });
    return null;
  }
  return tramite;
}

/* GET /notificaciones  ->  todas las cédulas.
   La cola de emisión y la de entregas las arma el front filtrando esta lista,
   igual que hoy hace src/datos/vistas.js. */
router.get('/', async (_req, res, next) => {
  try {
    res.json(await tramitesPorTipo(TIPOS_NOTIFICACION));
  } catch (e) {
    next(e);
  }
});

/* POST /notificaciones  ->  emite la cédula.

   La INSTANCIA no se elige: se deduce del estado del local. Así no se puede
   emitir una primera notificación en un local que ya tiene una segunda
   (sección 6.1). */
router.post('/', requiereRol('administrativo', 'coordinacion'), async (req, res, next) => {
  try {
    const idLocal = Number(req.body?.localId);
    const local = await localPorId(idLocal);
    if (!local) return res.status(404).json({ error: 'Local no encontrado' });

    if (!datosRegistralesCompletos(local)) {
      return res.status(400).json({
        error: `No se puede emitir la cédula: faltan ${faltantesRegistrales(local).join(', ')}`,
      });
    }

    const actuaciones = await tramitesDeLocal(idLocal);
    const estado = estadoDeLocal(local, actuaciones);
    const instancia = estado.startsWith('NOTIF2') ? 2 : 1;
    const params = await parametros();
    const plazoDias = instancia === 1 ? params.plazoNotif1 : params.plazoNotif2;
    const ciclo = await cicloActual(idLocal);
    const hoy = hoyISO();

    // enFila() serializa las emisiones: la siguiente espera a que esta termine
    // de reservar su número. Sin eso, dos emisiones simultáneas leerían el
    // mismo máximo y saldrían con el mismo número de cédula.
    const idTramite = await enFila(() => enTransaccion(async (cx) => {
      const numero = await siguienteNumeroCedula(cx);
      const id = await insertarTramite(cx, {
        idLocal,
        idEstado: ID_ESTADO.NOTIF_GENERADA,
        idTtramite: instancia === 1 ? ID_TTRAMITE.PRIMERA_NOTIFICACION : ID_TTRAMITE.SEGUNDA_NOTIFICACION,
        idUsuario: req.usuario?.id ?? null,
        nroCiclo: ciclo,
        plazoDias,
        domicilioNotificacion: local.direccion,
        numeroReferencia: numeroDeCedula(numero),
        fechaInicio: hoy,
        observaciones: '',
      });
      return id;
    }));

    res.status(201).json(await tramitePorId(idTramite));
  } catch (e) {
    next(e);
  }
});

/* POST /notificaciones/:id/regenerar

   Se corrigieron datos del local después de emitir. La cédula anterior ya
   salió con datos mal, así que no puede quedar circulando con el mismo
   número: se le asigna uno nuevo y se borra la constancia de impresión. */
router.post('/:id/regenerar', requiereRol('administrativo', 'coordinacion'), async (req, res, next) => {
  try {
    const tramite = await notificacionDe(req, res);
    if (!tramite) return;

    const hoy = hoyISO();
    await enFila(() => enTransaccion(async (cx) => {
      const numero = await siguienteNumeroCedula(cx);
      const nota = `${tramite.observaciones ? `${tramite.observaciones} · ` : ''}Reemplaza la cédula ${tramite.numeroCedula}.`;
      await cx.execute(
        `UPDATE tramite SET numero_referencia = ?, fecha_inicio = ?, id_estado = ?, observaciones = ?
          WHERE id_tramite = ?`,
        [numeroDeCedula(numero), hoy, ID_ESTADO.NOTIF_GENERADA, nota, tramite.id],
      );
    }));

    res.json(await tramitePorId(tramite.id));
  } catch (e) {
    next(e);
  }
});

/* PUT /notificaciones/:id/notificador  ->  a quién se le entrega para repartir. */
router.put('/:id/notificador', requiereRol('coordinacion'), async (req, res, next) => {
  try {
    const tramite = await notificacionDe(req, res);
    if (!tramite) return;

    const idNotificador = req.body?.notificadorId ? Number(req.body.notificadorId) : null;
    if (idNotificador) {
      const [existe] = await consultar('SELECT id_usuario FROM usuario WHERE id_usuario = ? AND habilita = 1', [idNotificador]);
      if (!existe) return res.status(400).json({ error: 'El notificador indicado no existe' });
    }

    await ejecutar('UPDATE tramite SET id_usuario_asignado = ? WHERE id_tramite = ?', [idNotificador, tramite.id]);
    res.json(await tramitePorId(tramite.id));
  } catch (e) {
    next(e);
  }
});

/* POST /notificaciones/:id/impresion  ->  constancia de impresión (sección 9.6).

   >>> SIN SOPORTE HOY: FALTAN LAS COLUMNAS EN LA BASE <<<
   Guardar quién imprimió una cédula y cuándo necesita dos columnas en
   `tramite` (`impresa_por`, `impresa_en`) que se decidió no agregar por ahora.

   Responde 501 en vez de fingir que guardó algo: si devolviera 200 sin
   persistir, el front mostraría la cédula como impresa hasta que alguien
   recargue la página, y el área terminaría reimprimiendo cédulas creyendo que
   nunca salieron.

   Para habilitarlo hay que correr sql/04-columnas-opcionales.sql y descomentar
   el cuerpo de abajo. */
router.post('/:id/impresion', async (req, res, next) => {
  try {
    if (!req.usuario) return res.status(401).json({ error: 'Falta identificar al usuario' });
    const tramite = await notificacionDe(req, res);
    if (!tramite) return;

    return res.status(501).json({
      error:
        'La constancia de impresión necesita las columnas tramite.impresa_por e impresa_en. ' +
        'Ver backend/sql/04-columnas-opcionales.sql.',
    });

    /* Cuando existan las columnas, esto es todo lo que hace falta
       (y volver a importar `firmante` de ../middlewares/usuario.js):

    if (tramite.impresaEn) return res.json(tramite);
    await ejecutar('UPDATE tramite SET impresa_por = ?, impresa_en = NOW() WHERE id_tramite = ?', [
      firmante(req),
      tramite.id,
    ]);
    res.status(201).json(await tramitePorId(tramite.id));
    */
  } catch (e) {
    next(e);
  }
});

/* POST /notificaciones/:id/entrega

   >>> ACÁ EMPIEZA A CORRER EL PLAZO <<<
   Es el único lugar del sistema donde se calcula un vencimiento de
   notificación. Si el resultado no hace correr el plazo (no entregada), NO hay
   vencimiento: el circuito se detiene hasta que la entrega se concrete. Sin
   notificación fehaciente no hay avance (debido proceso, sección 4.3). */
router.post('/:id/entrega', requiereRol('notificador', 'coordinacion'), async (req, res, next) => {
  try {
    const tramite = await notificacionDe(req, res);
    if (!tramite) return;

    const { resultado, fechaEntrega, observaciones } = req.body ?? {};
    const idEstadoNuevo = ESTADO_POR_RESULTADO[resultado];
    if (!idEstadoNuevo) {
      return res.status(400).json({
        error: `Resultado inválido. Valores posibles: ${Object.keys(ESTADO_POR_RESULTADO).join(', ')}`,
      });
    }

    const corre = resultado !== 'NO_ENTREGADA';
    if (corre && !fechaEntrega) {
      return res.status(400).json({ error: 'Falta la fecha de entrega efectiva' });
    }

    let vencimiento = null;
    let plazoDias = tramite.plazoDias;

    if (corre) {
      const [params, calendario] = await Promise.all([parametros(), feriados()]);
      plazoDias = tramite.instancia === 1 ? params.plazoNotif1 : params.plazoNotif2;
      vencimiento = vencimientoHabil(fechaEntrega, plazoDias, calendario, params.contarDiaEntrega);
    }

    await enTransaccion(async (cx) => {
      await cx.execute(
        `UPDATE tramite
            SET id_estado = ?, fecha_entrega = ?, fecha_vencimiento = ?, plazo_dias = ?,
                fecha_cierre = ?, observaciones = ?
          WHERE id_tramite = ?`,
        [
          idEstadoNuevo,
          corre ? fechaEntrega : null,
          vencimiento,
          plazoDias,
          corre ? fechaEntrega : null,
          observaciones ?? tramite.observaciones ?? '',
          tramite.id,
        ],
      );
    });

    res.json(await tramitePorId(tramite.id));
  } catch (e) {
    next(e);
  }
});

export default router;
