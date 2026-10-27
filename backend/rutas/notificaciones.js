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
     corregirEntrega      ->  PUT  /notificaciones/:id/entrega
                              { resultado, fechaEntrega, observaciones, motivo }

   LO QUE GARANTIZA EL SERVIDOR Y EL FRONT NO PUEDE:

   1. Cada acto solo se registra en el estado que corresponde. Es la tabla
      ACCIONES de src/dominio/reglas.js, la misma que dibuja los botones, y la
      aplica backend/actos.js. No se emite una cédula a un local con DDJJ
      vigente, exento o en expediente; no se regenera una cédula ya entregada.
   2. El número de cédula no se repite nunca. Sale de MAX(correlativo)+1, pero
      los actos van de a uno (enFila) para que dos que entren al mismo tiempo no
      lean el mismo máximo. Ver NUMERACIÓN DE CÉDULAS en consultas.js. El
      formato es el de la base ('0001-696'): ver numeroDeCedula() en mapeo.js.
   3. Sin CUIT, razón social y rubro no se emite. La cédula tiene que
      individualizar al sujeto obligado; sin eso la notificación es impugnable
      (sección 4.3). Rubro "SIN INFORMAR" cuenta como faltante.
   4. El vencimiento se calcula UNA vez, al registrar la entrega, con los
      feriados y los parámetros que están vigentes ese día, y se guarda. Nunca
      se recalcula al consultar (vencimiento materializado, sección 5.2).
   5. Una entrega efectiva no se pisa. Después de una NO ENTREGADA sí se puede
      registrar un nuevo intento: el anterior queda en la auditoría.
   ============================================================================ */

import { Router } from 'express';
import { consultarEn, ejecutar } from '../conexion-bd.js';
import { auditoriaDisponible } from '../auditoria.js';
import {
  feriados,
  insertarTramite,
  parametros,
  recortarObservacion,
  siguienteNumeroCedula,
  tramitePorId,
  tramitesPorTipo,
} from '../consultas.js';
import {
  ESTADO_POR_RESULTADO,
  ID_ESTADO,
  ID_TTRAMITE,
  datosRegistralesCompletos,
  faltantesRegistrales,
  numeroDeCedula,
} from '../mapeo.js';
import { firmante, requiereRol } from '../middlewares/usuario.js';
import { tiene } from '../capacidades.js';
import { ErrorActo, ejecutarActo } from '../actos.js';
import { archivosDisponibles, existeHash, guardarImagen, leerImagen } from '../archivos.js';
import { fmtFecha, hoyISO, vencimientoHabil } from '../../src/dominio/fechas.js';
import { requiereDatosRegistrales } from '../../src/dominio/reglas.js';
import { resultadoEntrega } from '../../src/dominio/actuaciones.js';

const router = Router();

const TIPOS_NOTIFICACION = [ID_TTRAMITE.PRIMERA_NOTIFICACION, ID_TTRAMITE.SEGUNDA_NOTIFICACION];
const RESULTADOS_EFECTIVOS = ['ENTREGADA', 'SIN_FIRMA', 'FIJADA'];

/* Comprueba que el trámite exista y sea una notificación. Devuelve null y
   responde el error si no: las rutas de abajo empiezan igual. */
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

/* El último trámite del circuito sancionatorio (el que define el estado, ver
   estadoDeLocal en mapeo.js). La cédula "en curso" es ese, si es una
   notificación: sobre cualquier otra no se puede actuar, porque ya quedó
   atrás en la historia del local. */
function ultimaDelCircuito(actuaciones) {
  const circuito = actuaciones.filter((a) => ['NOTIFICACION', 'PRORROGA', 'EXPEDIENTE'].includes(a.tipo));
  return circuito.length ? circuito[circuito.length - 1] : null;
}

function cedulaEnCurso(actuaciones) {
  const ultima = ultimaDelCircuito(actuaciones);
  return ultima?.tipo === 'NOTIFICACION' ? ultima : null;
}

function cicloDe(actuaciones) {
  return Math.max(1, ...actuaciones.map((a) => Number(a.ciclo) || 1));
}

const esFechaISO = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

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
   (sección 6.1).

   Si el local ya tiene el trámite de notificación PENDIENTE (lo crean la
   habilitación de coordinación y el reingreso desde expediente), la emisión
   completa ESE trámite con el número, en vez de crear otro: así cada
   notificación aparece una sola vez en el historial. */
router.post('/', requiereRol('administrativo', 'coordinacion'), async (req, res, next) => {
  try {
    const idTramite = await emitirCedula(req, Number(req.body?.localId));
    res.status(201).json(await tramitePorId(idTramite));
  } catch (e) {
    next(e);
  }
});

/* Emite la cédula de un local y devuelve el id del trámite. La usan la ruta de
   arriba (una persona emite) y la emisión automática de
   backend/tareas-programadas.js (sección 9.6). Esa pasa `automatica` con el
   texto que identifica la corrida: el acto queda en el historial como obra
   del Sistema y con ese texto, para distinguirlo de una emisión manual. Los
   controles son los mismos: estado, bloqueo y datos registrales. */
export async function emitirCedula(req, idLocal, { automatica = null } = {}) {
  const { idTramite } = await ejecutarActo(req, {
    idLocal,
    accion: 'generar-cedula',
    // El Sistema no tiene tipo de usuario: lo habilita la Dirección al
    // prender la emisión automática o el respaldo en Parámetros.
    rolHabilitadoAunque: automatica ? () => true : null,
    // Los datos registrales se exigen para la segunda cédula, no para la
    // primera (ver requiereDatosRegistrales en src/dominio/reglas.js).
    controlar: async ({ local, estado }) =>
      requiereDatosRegistrales('generar-cedula', false, estado.startsWith('NOTIF2') ? 2 : 1) &&
      !datosRegistralesCompletos(local)
        ? new ErrorActo(400, `No se puede emitir la segunda cédula: faltan ${faltantesRegistrales(local).join(', ')}`)
        : null,
    motivo: (r) =>
      `${automatica ?? 'Emisión'} de la ${r.instancia === 1 ? 'primera' : 'segunda'} cédula N° ${r.numero}`,
    trabajo: async (cx, { local, actuaciones, estado }) => {
      const instancia = estado.startsWith('NOTIF2') ? 2 : 1;
      const params = await parametros(cx);
      const plazoDias = instancia === 1 ? params.plazoNotif1 : params.plazoNotif2;
      const hoy = hoyISO();
      const numero = numeroDeCedula(await siguienteNumeroCedula(cx));

      const ultima = ultimaDelCircuito(actuaciones);
      const pendiente =
        ultima?.tipo === 'NOTIFICACION' &&
        ultima.instancia === instancia &&
        !ultima.numeroCedula &&
        [ID_ESTADO.NOTIF_PENDIENTE, ID_ESTADO.NOTIF_GENERANDO].includes(ultima.idEstado)
          ? ultima
          : null;

      if (pendiente) {
        await cx.execute(
          `UPDATE tramite
                SET id_estado = ?, numero_referencia = ?, plazo_dias = ?, domicilio_notificacion = ?,
                    fecha_inicio = ?, id_usuario = COALESCE(?, id_usuario)
              WHERE id_tramite = ?`,
          [ID_ESTADO.NOTIF_GENERADA, numero, plazoDias, local.direccion, hoy, req.usuario?.id ?? null, pendiente.id],
        );
        return { idTramite: pendiente.id, instancia, numero };
      }

      const id = await insertarTramite(cx, {
        idLocal,
        idEstado: ID_ESTADO.NOTIF_GENERADA,
        idTtramite: instancia === 1 ? ID_TTRAMITE.PRIMERA_NOTIFICACION : ID_TTRAMITE.SEGUNDA_NOTIFICACION,
        idUsuario: req.usuario?.id ?? null,
        nroCiclo: cicloDe(actuaciones),
        plazoDias,
        domicilioNotificacion: local.direccion,
        numeroReferencia: numero,
        fechaInicio: hoy,
        observaciones: '',
      });
      return { idTramite: id, instancia, numero };
    },
  });
  return idTramite;
}

/* POST /notificaciones/:id/regenerar

   Se corrigieron datos del local después de emitir. La cédula anterior ya
   salió con datos mal, así que no puede quedar circulando con el mismo
   número: se le asigna uno nuevo y se borra la constancia de impresión.

   Solo sobre la cédula en curso, y solo si todavía no se entregó (o consta
   como no entregada). Regenerar una cédula entregada borraría la entrega y
   detendría un plazo que ya corre. */
router.post('/:id/regenerar', requiereRol('administrativo', 'coordinacion'), async (req, res, next) => {
  try {
    const tramite = await notificacionDe(req, res);
    if (!tramite) return;

    await ejecutarActo(req, {
      idLocal: tramite.localId,
      accion: 'regenerar-cedula',
      controlar: async ({ local, actuaciones }) => {
        const actual = cedulaEnCurso(actuaciones);
        if (!actual || actual.id !== tramite.id) {
          return new ErrorActo(409, 'Solo se puede regenerar la cédula que está en curso para el local.');
        }
        if (!actual.numeroCedula) {
          return new ErrorActo(409, 'Esa notificación todavía no se emitió: hay que generarla, no regenerarla.');
        }
        if (RESULTADOS_EFECTIVOS.includes(actual.resultado)) {
          return new ErrorActo(409, 'La cédula ya se entregó y su plazo corre: no se puede reemplazar.');
        }
        if (requiereDatosRegistrales('regenerar-cedula', false, actual.instancia) && !datosRegistralesCompletos(local)) {
          return new ErrorActo(400, `No se puede emitir la segunda cédula: faltan ${faltantesRegistrales(local).join(', ')}`);
        }
        return null;
      },
      motivo: (r) => `Regeneración: la cédula N° ${r.nueva} reemplaza a la N° ${r.anterior}`,
      trabajo: async (cx) => {
        const numero = numeroDeCedula(await siguienteNumeroCedula(cx));
        const nota = recortarObservacion(
          `${tramite.observaciones ? `${tramite.observaciones} · ` : ''}Reemplaza la cédula ${tramite.numeroCedula}.`,
        );
        const borrarImpresion = tiene('impresion') ? ', impresa_por = NULL, impresa_en = NULL' : '';
        await cx.execute(
          `UPDATE tramite
              SET numero_referencia = ?, fecha_inicio = ?, id_estado = ?, fecha_entrega = NULL,
                  fecha_vencimiento = NULL, fecha_cierre = NULL, observaciones = ?${borrarImpresion}
            WHERE id_tramite = ?`,
          [numero, hoyISO(), ID_ESTADO.NOTIF_GENERADA, nota, tramite.id],
        );
        return { idTramite: tramite.id, nueva: numero, anterior: tramite.numeroCedula };
      },
    });

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

    await ejecutarActo(req, {
      idLocal: tramite.localId,
      accion: 'asignar-notificador',
      controlar: async ({ actuaciones }, cx) => {
        const actual = cedulaEnCurso(actuaciones);
        if (!actual || actual.id !== tramite.id) {
          return new ErrorActo(409, 'Solo se asigna la cédula que está en curso para el local.');
        }
        if (idNotificador) {
          const [existe] = await consultarEn(
            cx,
            'SELECT id_usuario FROM usuario WHERE id_usuario = ? AND habilita = 1',
            [idNotificador],
          );
          if (!existe) return new ErrorActo(400, 'El notificador indicado no existe o está dado de baja');
        }
        return null;
      },
      motivo: `Cédula N° ${tramite.numeroCedula}: asignación de notificador`,
      trabajo: async (cx) => {
        await cx.execute('UPDATE tramite SET id_usuario_asignado = ? WHERE id_tramite = ?', [
          idNotificador,
          tramite.id,
        ]);
        return { idTramite: tramite.id };
      },
    });

    res.json(await tramitePorId(tramite.id));
  } catch (e) {
    next(e);
  }
});

/* POST /notificaciones/:id/impresion  ->  constancia de impresión (sección 9.6).

   Usa las columnas tramite.impresa_por e impresa_en de
   sql/04-columnas-opcionales.sql. Si el script no se corrió, responde 501 en
   vez de fingir que guardó algo: si devolviera 200 sin persistir, el front
   mostraría la cédula como impresa hasta que alguien recargue la página, y el
   área terminaría reimprimiendo cédulas creyendo que nunca salieron.

   Se guarda la PRIMERA impresión: una reimpresión no borra quién la imprimió
   primero. No es un cambio de estado, así que no va a la auditoría. */
router.post('/:id/impresion', async (req, res, next) => {
  try {
    if (!req.usuario) return res.status(401).json({ error: 'Falta identificar al usuario' });
    const tramite = await notificacionDe(req, res);
    if (!tramite) return;

    if (!tiene('impresion')) {
      return res.status(501).json({
        error: 'La constancia de impresión todavía no está habilitada en esta base.',
        capacidad: 'impresion',
      });
    }
    if (!tramite.numeroCedula) return res.status(409).json({ error: 'Esa notificación todavía no se emitió.' });
    if (tramite.impresaEn) return res.json(tramite);

    await ejecutar(
      'UPDATE tramite SET impresa_por = ?, impresa_en = NOW() WHERE id_tramite = ? AND impresa_en IS NULL',
      [firmante(req), tramite.id],
    );
    res.status(201).json(await tramitePorId(tramite.id));
  } catch (e) {
    next(e);
  }
});

/* POST /notificaciones/:id/entrega

   >>> ACÁ EMPIEZA A CORRER EL PLAZO <<<
   Es el único lugar del sistema donde se calcula un vencimiento de
   notificación. Si el resultado no hace correr el plazo (no entregada), NO hay
   vencimiento: el circuito se detiene hasta que la entrega se concrete. Sin
   notificación fehaciente no hay avance (debido proceso, sección 4.3).

   CONTROLES, porque de esta fecha depende todo lo que viene después:
     - la cédula tiene que ser la que está en curso y tener número;
     - una entrega efectiva ya registrada no se pisa;
     - la fecha no puede ser futura ni anterior a la emisión;
     - si la cédula está asignada a otro notificador, no la puede registrar
       otro notificador (coordinación sí). Si no estaba asignada, queda
       asignada a quien la entregó, que es su producción del día.
   El notificador asignado puede registrarla aunque su tipo de usuario sea
   relevador: la guía dice que suele ser el mismo agente (sección 2.2).

   LA FOTO (`evidencia`, imagen en base64) se guarda con backend/archivos.js si
   la base tiene la tabla `archivo` (sql/08). Con la tabla, es OBLIGATORIA
   cuando la entrega no se concreta (sección 6.2). Sin la tabla, no se puede
   guardar y no se exige: la pantalla lo avisa.

   UN REENVÍO NO REGISTRA DOS VECES. La cola sin conexión del celular reintenta
   si la señal se cortó justo después de enviar: si llega lo mismo que ya está
   registrado (mismo resultado y misma fecha, o la misma foto), se responde
   como está. */
router.post('/:id/entrega', requiereRol('notificador', 'relevador', 'coordinacion'), async (req, res, next) => {
  try {
    const tramite = await notificacionDe(req, res);
    if (!tramite) return;

    const { resultado, fechaEntrega, observaciones, evidencia, evidenciaNombre } = req.body ?? {};
    const idEstadoNuevo = ESTADO_POR_RESULTADO[resultado];
    if (!idEstadoNuevo) {
      return res.status(400).json({
        error: `Resultado inválido. Valores posibles: ${Object.keys(ESTADO_POR_RESULTADO).join(', ')}`,
      });
    }

    let imagen = null;
    if (typeof evidencia === 'string' && evidencia.startsWith('data:') && archivosDisponibles()) {
      imagen = leerImagen(evidencia);
      if (imagen.error) return res.status(400).json({ error: imagen.error });
    }
    if (resultado === 'NO_ENTREGADA' && archivosDisponibles() && !imagen) {
      return res.status(400).json({ error: 'La foto del local es obligatoria cuando la entrega no se concreta' });
    }

    // ¿Es un reenvío de algo que ya llegó?
    if (tramite.resultado === resultado) {
      const mismaFoto = imagen ? await existeHash(null, tramite.id, imagen.hash) : null;
      const mismo =
        resultado === 'NO_ENTREGADA'
          ? (mismaFoto ?? (tramite.observaciones ?? '') === recortarObservacion(observaciones ?? ''))
          : tramite.fechaEntrega === fechaEntrega;
      if (mismo) return res.json(tramite);
    }

    const corre = resultado !== 'NO_ENTREGADA';
    const hoy = hoyISO();
    if (corre) {
      if (!esFechaISO(fechaEntrega)) {
        return res.status(400).json({ error: 'Falta la fecha de entrega efectiva, o no es una fecha válida' });
      }
      if (fechaEntrega > hoy)
        return res.status(400).json({ error: 'No se puede registrar una entrega con fecha futura' });
      if (tramite.fecha && fechaEntrega < tramite.fecha) {
        return res.status(400).json({
          error: `La fecha de entrega (${fmtFecha(fechaEntrega)}) es anterior a la emisión de la cédula (${fmtFecha(tramite.fecha)})`,
        });
      }
    }

    const esAgenteDeCampo = ['notificador', 'relevador'].includes(req.usuario?.rol);

    await ejecutarActo(req, {
      idLocal: tramite.localId,
      accion: 'registrar-entrega',
      rolHabilitadoAunque: () => Boolean(req.usuario?.id) && req.usuario.id === tramite.notificadorId,
      controlar: async ({ actuaciones }) => {
        const actual = cedulaEnCurso(actuaciones);
        if (!actual || actual.id !== tramite.id) {
          return new ErrorActo(
            409,
            'Esta cédula no es la que está en curso para el local: no se puede registrar su entrega.',
          );
        }
        if (!actual.numeroCedula) return new ErrorActo(409, 'La notificación todavía no se emitió.');
        if (RESULTADOS_EFECTIVOS.includes(actual.resultado)) {
          return new ErrorActo(
            409,
            `La cédula ya tiene una entrega efectiva registrada${actual.fechaEntrega ? ` el ${fmtFecha(actual.fechaEntrega)}` : ''}. No se puede pisar.`,
          );
        }
        if (esAgenteDeCampo && req.usuario?.id && actual.notificadorId && actual.notificadorId !== req.usuario.id) {
          return new ErrorActo(403, 'Esta cédula está asignada a otro notificador.');
        }
        return null;
      },
      motivo: (r) => {
        const etiqueta = resultadoEntrega(resultado)?.etiqueta ?? resultado;
        if (!corre) {
          return `Cédula N° ${tramite.numeroCedula}: no entregada${observaciones ? `. ${observaciones}` : ''}`;
        }
        return `Cédula N° ${tramite.numeroCedula}: ${etiqueta.toLowerCase()} el ${fmtFecha(fechaEntrega)}. El plazo vence el ${fmtFecha(r.vencimiento)}`;
      },
      trabajo: async (cx) => {
        let vencimiento = null;
        let plazoDias = tramite.plazoDias;
        if (corre) {
          const params = await parametros(cx);
          const calendario = await feriados(cx);
          plazoDias = tramite.instancia === 1 ? params.plazoNotif1 : params.plazoNotif2;
          vencimiento = vencimientoHabil(fechaEntrega, plazoDias, calendario, params.contarDiaEntrega);
        }
        const asignado = tramite.notificadorId ?? (esAgenteDeCampo ? (req.usuario?.id ?? null) : null);

        await cx.execute(
          `UPDATE tramite
              SET id_estado = ?, fecha_entrega = ?, fecha_vencimiento = ?, plazo_dias = ?,
                  fecha_cierre = ?, observaciones = ?, id_usuario_asignado = ?
            WHERE id_tramite = ?`,
          [
            idEstadoNuevo,
            corre ? fechaEntrega : null,
            vencimiento,
            plazoDias,
            corre ? fechaEntrega : null,
            recortarObservacion(observaciones ?? tramite.observaciones ?? ''),
            asignado,
            tramite.id,
          ],
        );
        if (imagen && !(await existeHash(cx, tramite.id, imagen.hash))) {
          await guardarImagen(cx, req, {
            idTramite: tramite.id,
            imagen,
            tipoArchivo: 'evidencia-entrega',
            nombreOriginal: evidenciaNombre,
          });
        }
        return { idTramite: tramite.id, vencimiento };
      },
    });

    res.json(await tramitePorId(tramite.id));
  } catch (e) {
    next(e);
  }
});

/* ¿Esta cédula la registró este agente HOY? (sección 6.2: "el agente puede
   editar sus propias cargas únicamente durante la jornada en que las
   realizó"). Con el historial (sql/05) se mira quién anotó la entrega y
   cuándo. Sin él, la mejor aproximación: está asignada a él y la fecha de
   entrega es hoy. */
async function registradaHoyPor(cx, tramite, req) {
  const idUsuario = req.usuario?.id;
  if (!idUsuario || tramite.notificadorId !== idUsuario) return false;
  if (auditoriaDisponible()) {
    const [fila] = await consultarEn(
      cx,
      `SELECT 1 AS si FROM auditoria
        WHERE id_tramite = ? AND id_usuario = ? AND accion IN ('registrar-entrega', 'corregir-entrega')
          AND DATE(momento) = CURDATE()
        LIMIT 1`,
      [tramite.id, idUsuario],
    );
    return Boolean(fila);
  }
  return tramite.fechaEntrega === hoyISO();
}

/* PUT /notificaciones/:id/entrega  ->  CORRIGE una entrega mal cargada.

   Pasa: el notificador elige "Entregada" en vez de "Fijada", o carga mal la
   fecha. Como de esa fecha sale el vencimiento, dejarlo mal es dejar mal el
   plazo; y antes no había forma de arreglarlo.

   QUIÉN (sección 6.2, corrección de cargas):
     - el agente de campo, la suya y solo el mismo día que la registró;
     - después, la oficina: coordinación, con un motivo obligatorio.

   CUÁNDO: mientras esa cédula sea lo último que pasó en el circuito. Si ya
   se emitió la siguiente, o hubo prórroga o expediente, corregirla dejaría
   inconsistente todo lo que vino después: eso se resuelve con un bloqueo y
   revisión, no con una corrección.

   QUÉ HACE: lo mismo que registrar la entrega (recalcula el vencimiento con
   los feriados y parámetros de hoy) y deja en el historial qué decía antes,
   qué dice ahora y por qué. Una NO ENTREGADA no se corrige: se registra el
   nuevo intento, que ya estaba permitido. */
router.put('/:id/entrega', requiereRol('notificador', 'relevador', 'coordinacion'), async (req, res, next) => {
  try {
    const tramite = await notificacionDe(req, res);
    if (!tramite) return;

    const { resultado, fechaEntrega, observaciones, evidencia, evidenciaNombre } = req.body ?? {};
    const motivoCorreccion = String(req.body?.motivo ?? '').trim();
    const idEstadoNuevo = ESTADO_POR_RESULTADO[resultado];
    if (!idEstadoNuevo) {
      return res.status(400).json({
        error: `Resultado inválido. Valores posibles: ${Object.keys(ESTADO_POR_RESULTADO).join(', ')}`,
      });
    }
    if (!tramite.resultado) {
      return res
        .status(409)
        .json({ error: 'Esa cédula todavía no tiene entrega registrada: hay que registrarla, no corregirla.' });
    }
    if (tramite.resultado === 'NO_ENTREGADA') {
      return res
        .status(409)
        .json({ error: 'La cédula figura como no entregada: registrá el nuevo intento de entrega.' });
    }

    const esAgenteDeCampo = ['notificador', 'relevador'].includes(req.usuario?.rol);
    if (!esAgenteDeCampo && !motivoCorreccion) {
      return res.status(400).json({ error: 'Escribí el motivo de la corrección: queda en el historial del local.' });
    }

    let imagen = null;
    if (typeof evidencia === 'string' && evidencia.startsWith('data:') && archivosDisponibles()) {
      imagen = leerImagen(evidencia);
      if (imagen.error) return res.status(400).json({ error: imagen.error });
    }
    if (resultado === 'NO_ENTREGADA' && archivosDisponibles() && !imagen) {
      return res.status(400).json({ error: 'La foto del local es obligatoria cuando la entrega no se concreta' });
    }

    const corre = resultado !== 'NO_ENTREGADA';
    const hoy = hoyISO();
    if (corre) {
      if (!esFechaISO(fechaEntrega)) {
        return res.status(400).json({ error: 'Falta la fecha de entrega efectiva, o no es una fecha válida' });
      }
      if (fechaEntrega > hoy)
        return res.status(400).json({ error: 'No se puede registrar una entrega con fecha futura' });
      if (tramite.fecha && fechaEntrega < tramite.fecha) {
        return res.status(400).json({
          error: `La fecha de entrega (${fmtFecha(fechaEntrega)}) es anterior a la emisión de la cédula (${fmtFecha(tramite.fecha)})`,
        });
      }
    }

    // Nada cambió (por ejemplo, el mismo pedido llegó dos veces): se responde como está.
    if (tramite.resultado === resultado && (!corre || tramite.fechaEntrega === fechaEntrega) && !imagen) {
      const mismasObs =
        observaciones === undefined || (tramite.observaciones ?? '') === recortarObservacion(observaciones ?? '');
      if (mismasObs) return res.json(tramite);
    }

    const antes = {
      etiqueta: resultadoEntrega(tramite.resultado)?.etiqueta ?? tramite.resultado,
      fecha: tramite.fechaEntrega,
    };

    await ejecutarActo(req, {
      idLocal: tramite.localId,
      accion: 'corregir-entrega',
      // El agente de campo corrige la suya, el mismo día.
      rolHabilitadoAunque: (_antes, cx) => (esAgenteDeCampo ? registradaHoyPor(cx, tramite, req) : false),
      controlar: async ({ actuaciones }) => {
        if (esAgenteDeCampo && tramite.notificadorId !== req.usuario?.id) {
          return new ErrorActo(403, 'Solo podés corregir las entregas que registraste vos.');
        }
        const circuito = actuaciones.filter((a) => ['NOTIFICACION', 'PRORROGA', 'EXPEDIENTE'].includes(a.tipo));
        const posicion = circuito.findIndex((a) => a.id === tramite.id);
        // Después de esta cédula solo puede haber una notificación todavía sin
        // emitir (la siguiente, en la cola). Cualquier otra cosa ya la usó.
        const yaSeUso = circuito.slice(posicion + 1).some((a) => a.tipo !== 'NOTIFICACION' || a.numeroCedula);
        if (posicion < 0 || yaSeUso) {
          return new ErrorActo(
            409,
            'Después de esta cédula ya se emitió otra, o hubo prórroga o expediente: no se puede corregir. Si hace falta, bloqueá el local y revisalo.',
          );
        }
        return null;
      },
      forzarRegistro: true,
      motivo: (r) => {
        const etiqueta = resultadoEntrega(resultado)?.etiqueta ?? resultado;
        const decia = `${antes.etiqueta}${antes.fecha ? ` el ${fmtFecha(antes.fecha)}` : ''}`;
        const dice = corre
          ? `${etiqueta.toLowerCase()} el ${fmtFecha(fechaEntrega)}, vence el ${fmtFecha(r.vencimiento)}`
          : 'no entregada';
        const por = motivoCorreccion || 'corrección del agente en el día';
        return `Corrección de la cédula N° ${tramite.numeroCedula}: decía ${decia.toLowerCase()}; ahora ${dice}. Motivo: ${por}`;
      },
      trabajo: async (cx) => {
        let vencimiento = null;
        let plazoDias = tramite.plazoDias;
        if (corre) {
          const params = await parametros(cx);
          const calendario = await feriados(cx);
          plazoDias = tramite.instancia === 1 ? params.plazoNotif1 : params.plazoNotif2;
          vencimiento = vencimientoHabil(fechaEntrega, plazoDias, calendario, params.contarDiaEntrega);
        }
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
            recortarObservacion(observaciones ?? tramite.observaciones ?? ''),
            tramite.id,
          ],
        );
        if (imagen && !(await existeHash(cx, tramite.id, imagen.hash))) {
          await guardarImagen(cx, req, {
            idTramite: tramite.id,
            imagen,
            tipoArchivo: 'evidencia-entrega',
            nombreOriginal: evidenciaNombre,
          });
        }
        return { idTramite: tramite.id, vencimiento };
      },
    });

    res.json(await tramitePorId(tramite.id));
  } catch (e) {
    next(e);
  }
});

export default router;
