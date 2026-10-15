/* ============================================================================
   backend/rutas/relevamientos.js  —  CAMPO Y CONTROL ADMINISTRATIVO
   ----------------------------------------------------------------------------
   Reemplaza estas funciones de src/datos/DatosProvider.jsx:

     relevamientos (lista)     ->  GET  /relevamientos
     crearRelevamiento         ->  POST /relevamientos                    (rol relevador)
     editarRelevamiento        ->  PUT  /relevamientos/:id                (el autor, el mismo día)
     revisarRelevamiento       ->  POST /relevamientos/:localId/revision  (rol coordinacion)

   EL RELEVADOR NO CARGA CUIT NI RAZÓN SOCIAL (sección 6.2). Los relevadores no
   tienen facultades de inspector y no están autorizados a requerirle esa
   información al comerciante: los datos registrales los completa la oficina
   desde la constancia de inscripción fiscal. El formulario de campo no los
   muestra, y acá se RECHAZAN si llegan igual.

   DOS COORDENADAS DISTINTAS, NO SE MEZCLAN:
     local.latitud_local          sale de geocodificar la dirección declarada.
                                  Es la ubicación oficial del establecimiento.
     tramite.latitud_relevamiento coordenada del DISPOSITIVO al guardar. Es una
                                  métrica del trabajo de campo, nada más.

   LA FECHA Y HORA DEL RELEVAMIENTO SON LAS DEL GUARDADO EN EL CELULAR
   (`momento`), no las de la llegada al servidor: una carga hecha sin señal
   puede llegar horas después (sección 6.2 y criterio de aceptación de campo).
   Si la misma carga llega dos veces (la cola sin conexión reintenta), la
   segunda se reconoce por momento + dirección y no crea un local repetido.
   ============================================================================ */

import { Router } from 'express';
import { consultar, enTransaccion } from '../conexion-bd.js';
import { idDeRubro, insertarTramite, localPorId, parametros, recortarObservacion, tramitePorId, tramitesPorTipo } from '../consultas.js';
import { ID_ESTADO, ID_TTRAMITE } from '../mapeo.js';
import { requiereRol } from '../middlewares/usuario.js';
import { geocodificarDireccion } from '../geocodificador.js';
import { ejecutarActo, registrarAlta } from '../actos.js';
import { hoyISO } from '../../src/dominio/fechas.js';

const router = Router();

/* Los tres cierres posibles del control administrativo (etapa 2), con el
   estado en que queda el local, el acto de src/dominio/reglas.js que les
   corresponde y el motivo que se escribe en la auditoría. */
const RESULTADOS_REVISION = {
  EXENTO_CONFIRMADO: {
    accion: 'confirmar-exencion',
    idEstadoLocal: ID_ESTADO.RELEVADO_EXENTO,
    motivo: 'Coordinación confirmó la exención',
  },
  GRAN_GENERADOR: {
    accion: 'corregir-clasificacion',
    idEstadoLocal: ID_ESTADO.REVISION_DATOS,
    motivo: 'Coordinación corrigió la clasificación: sí es Gran Generador',
  },
  HABILITADO: {
    accion: 'habilitar-notificacion',
    idEstadoLocal: ID_ESTADO.REVISION_DATOS,
    motivo: 'Coordinación habilitó la notificación',
  },
};

/* ISO del celular ('2026-10-01T13:05:22.000Z') -> DATETIME local de la base
   ('2026-10-01 10:05:22'). Si no vino, no se entiende o está en el futuro (un
   celular con la hora mal), vale la hora del servidor. */
function momentoDelGuardado(valor) {
  const ahora = new Date();
  let d = valor ? new Date(valor) : ahora;
  if (Number.isNaN(d.getTime()) || d.getTime() > ahora.getTime() + 10 * 60 * 1000) d = ahora;
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
}

/* La coordenada del dispositivo, solo si es una coordenada posible. "0,0" es
   lo que manda un celular sin permiso de GPS (ver Anexo A.3): se guarda como
   SIN coordenada, no como un punto en el golfo de Guinea. */
function coordenadaDelDispositivo(latitud, longitud) {
  const lat = Number(latitud);
  const lng = Number(longitud);
  const valida =
    latitud !== null && latitud !== undefined && longitud !== null && longitud !== undefined &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
  return valida ? { latitud: lat, longitud: lng } : { latitud: null, longitud: null };
}

router.get('/', async (_req, res, next) => {
  try {
    res.json(await tramitesPorTipo([ID_TTRAMITE.RELEVAMIENTO]));
  } catch (e) {
    next(e);
  }
});

/* POST /relevamientos  ->  alta de local desde el campo.

   Crea DOS filas: el local en el padrón y el trámite de relevamiento que lo
   originó. Van en una transacción porque un local sin su relevamiento es un
   registro que nadie puede explicar de dónde salió. */
router.post('/', requiereRol('relevador', 'coordinacion'), async (req, res, next) => {
  try {
    const datos = req.body ?? {};

    if (datos.cuit || datos.razonSocial) {
      return res.status(400).json({
        error: 'El relevamiento de campo no registra CUIT ni razón social (sección 6.2 del pliego)',
      });
    }
    if (!datos.nombreLocal?.trim() || !datos.direccionRelevada?.trim()) {
      return res.status(400).json({ error: 'Faltan el nombre del local y la dirección relevada' });
    }
    if (!['GRAN_GENERADOR', 'GENERADOR_MENOR'].includes(datos.clasificacion)) {
      return res.status(400).json({ error: 'La clasificación debe ser GRAN_GENERADOR o GENERADOR_MENOR' });
    }

    const direccion = datos.direccionRelevada.trim();
    const momento = momentoDelGuardado(datos.momento);

    // ¿Ya llegó esta misma carga? Pasa cuando la cola sin conexión reintenta
    // un envío que el servidor sí había recibido pero cuya respuesta se
    // perdió. Mismo momento al segundo y misma dirección: es la misma carga.
    if (datos.momento) {
      const [previo] = await consultar(
        `SELECT id_local FROM tramite
          WHERE id_ttramite = ? AND fecha_inicio = ? AND direccion_relevada = ? AND habilita = 1
          LIMIT 1`,
        [ID_TTRAMITE.RELEVAMIENTO, momento, direccion],
      );
      if (previo) return res.status(200).json({ ...(await localPorId(previo.idLocal)), repetido: true });
    }

    const esGran = datos.clasificacion === 'GRAN_GENERADOR';
    // Un gran generador entra a revisión de datos; uno menor queda a la espera
    // de que coordinación confirme la exención.
    const idEstadoLocal = esGran ? ID_ESTADO.REVISION_DATOS : ID_ESTADO.EXENTO_PENDIENTE;
    const geo = await geocodificarDireccion(direccion);
    const dispositivo = coordenadaDelDispositivo(datos.latitud, datos.longitud);

    const idLocal = await enTransaccion(async (cx) => {
      // Antes el rubro se perdía: el formulario manda el NOMBRE ('rubro') y acá
      // se leía solo `rubroId`, así que todo entraba como SIN INFORMAR y el
      // local caía después en datos incompletos. Ahora vale cualquiera de los dos.
      const idRubro = await idDeRubro(datos, cx);

      const [alta] = await cx.execute(
        `INSERT INTO local
           (cuit, id_original, id_usuario, id_rubro, id_estado, razon_social, nombre_local,
            direccion_local, domicilio_fiscal, latitud_local, longitud_local,
            email_local, telefono_local, observacion, bloqueado, habilita)
         VALUES (NULL, NULL, ?, ?, ?, NULL, ?, ?, NULL, ?, ?, NULL, NULL, ?, 0, 1)`,
        [
          req.usuario?.id ?? null,
          idRubro,
          idEstadoLocal,
          datos.nombreLocal.trim(),
          direccion,
          geo.ok ? geo.latitud : null,
          geo.ok ? geo.longitud : null,
          datos.observaciones ? recortarObservacion(datos.observaciones) : null,
        ],
      );

      await insertarTramite(cx, {
        idLocal: alta.insertId,
        idEstado: esGran ? ID_ESTADO.GRAN_GENERADOR : ID_ESTADO.GENERADOR_MENOR,
        idTtramite: ID_TTRAMITE.RELEVAMIENTO,
        idUsuario: req.usuario?.id ?? null,
        nroCiclo: 1,
        direccionRelevada: direccion,
        latitudRelevamiento: dispositivo.latitud,
        longitudRelevamiento: dispositivo.longitud,
        fechaInicio: momento,
        observaciones: datos.observaciones ?? '',
      });

      await registrarAlta(
        cx,
        req,
        alta.insertId,
        `Alta por relevamiento de campo: ${esGran ? 'Gran Generador' : 'Generador Menor'}${datos.offline ? ' (cargado sin conexión)' : ''}`,
        'relevamiento',
      );

      return alta.insertId;
    });

    res.status(201).json(await localPorId(idLocal));
  } catch (e) {
    next(e);
  }
});

/* PUT /relevamientos/:id  ->  el agente corrige SU carga, el mismo día.

   Sección 6.2: "El agente puede editar sus cargas propias únicamente durante
   la jornada en que las realizó. Vencida esa ventana, la corrección la hace la
   oficina" (desde el padrón). Tres condiciones, y las tres se controlan acá:
     - que la haya cargado él (el trámite tiene su id de usuario);
     - que sea el mismo día de la carga;
     - que coordinación todavía no la haya controlado: después del control,
       la clasificación ya produjo efectos.
   Se corrigen la dirección, el nombre, el rubro, la clasificación y las
   observaciones, en el relevamiento y en el local que nació de él. */
router.put('/:id', requiereRol('relevador', 'coordinacion'), async (req, res, next) => {
  try {
    const tramite = await tramitePorId(Number(req.params.id));
    if (!tramite || tramite.tipo !== 'RELEVAMIENTO') return res.status(404).json({ error: 'No existe ese relevamiento' });

    const esAutor = Boolean(req.usuario?.id) && tramite.idUsuario === req.usuario.id;
    if (!esAutor && req.usuario?.rol !== 'administrador') {
      return res.status(403).json({ error: 'Solo quien hizo el relevamiento lo puede corregir. Si hace falta, la corrección la hace la oficina.' });
    }
    if (String(tramite.fechaHora ?? '').slice(0, 10) !== hoyISO()) {
      return res.status(409).json({ error: 'El relevamiento es de otro día: la corrección la hace la oficina desde el padrón.' });
    }
    /* La ventana del relevador tiene HORA de cierre, además del día: hasta la
       hora límite (parámetro) puede corregir lo suyo; después, la corrección
       es de la oficina. Coordinación no tiene esta restricción. */
    if (req.usuario?.rol === 'relevador') {
      const params = await parametros();
      const limite = Number(params.horaLimiteCorreccionRelevador);
      if (Number.isFinite(limite) && limite > 0 && new Date().getHours() >= limite) {
        return res.status(409).json({
          error: `Las correcciones del relevador cierran a las ${limite}:00. La corrección ahora la hace la oficina desde el padrón.`,
        });
      }
    }
    if (tramite.revisadoEn) {
      return res.status(409).json({ error: 'Coordinación ya controló este relevamiento: la corrección la hace la oficina.' });
    }

    const datos = req.body ?? {};
    if (datos.cuit || datos.razonSocial) {
      return res.status(400).json({ error: 'El relevamiento de campo no registra CUIT ni razón social (sección 6.2 del pliego)' });
    }
    if (!String(datos.nombreLocal ?? '').trim() || !String(datos.direccionRelevada ?? '').trim()) {
      return res.status(400).json({ error: 'Faltan el nombre del local y la dirección relevada' });
    }
    if (!['GRAN_GENERADOR', 'GENERADOR_MENOR'].includes(datos.clasificacion)) {
      return res.status(400).json({ error: 'La clasificación debe ser GRAN_GENERADOR o GENERADOR_MENOR' });
    }

    const direccion = datos.direccionRelevada.trim();
    const esGran = datos.clasificacion === 'GRAN_GENERADOR';
    const geo = await geocodificarDireccion(direccion);

    await ejecutarActo(req, {
      idLocal: tramite.localId,
      nombre: 'editar-relevamiento',
      motivo: 'Corrección del relevamiento por el agente, en el día',
      trabajo: async (cx) => {
        const idRubro = await idDeRubro(datos, cx);
        await cx.execute(
          `UPDATE local
              SET nombre_local = ?, direccion_local = ?, id_rubro = ?, id_estado = ?,
                  latitud_local = ?, longitud_local = ?
            WHERE id_local = ?`,
          [
            datos.nombreLocal.trim(),
            direccion,
            idRubro,
            esGran ? ID_ESTADO.REVISION_DATOS : ID_ESTADO.EXENTO_PENDIENTE,
            geo.ok ? geo.latitud : null,
            geo.ok ? geo.longitud : null,
            tramite.localId,
          ],
        );
        await cx.execute('UPDATE tramite SET direccion_relevada = ?, id_estado = ?, observaciones = ? WHERE id_tramite = ?', [
          direccion,
          esGran ? ID_ESTADO.GRAN_GENERADOR : ID_ESTADO.GENERADOR_MENOR,
          recortarObservacion(datos.observaciones ?? ''),
          tramite.id,
        ]);
        return { idTramite: tramite.id };
      },
    });

    res.json(await localPorId(tramite.localId));
  } catch (e) {
    next(e);
  }
});

/* POST /relevamientos/:localId/revision  ->  control administrativo (etapa 2).

   Cierra el relevamiento pendiente y deja el local en el estado que
   corresponda. `fecha_cierre` del trámite es la marca de revisado: mientras
   está en NULL, el relevamiento sigue en la bandeja de control.

   >>> HABILITAR NOTIFICACIÓN Y CORREGIR CLASIFICACIÓN DEJAN EL LOCAL EN LA
   COLA DE EMISIÓN <<<
   Antes solo cambiaban local.id_estado a REVISION_DATOS, que es justamente el
   estado del que se quería salir: el local nunca llegaba a "1° Notificación
   pendiente" y no se le podía emitir la cédula. Ahora se crea el trámite de
   primera notificación PENDIENTE, sin número todavía: es la misma forma en que
   la base guarda ese estado (la usa también el reingreso desde expediente), y
   la emisión completa ese mismo trámite con el número cuando se genera. */
router.post('/:localId/revision', requiereRol('coordinacion'), async (req, res, next) => {
  try {
    const idLocal = Number(req.params.localId);
    const resultado = req.body?.resultado;
    const salida = RESULTADOS_REVISION[resultado];
    if (!salida) {
      return res.status(400).json({
        error: `Resultado inválido. Valores posibles: ${Object.keys(RESULTADOS_REVISION).join(', ')}`,
      });
    }

    await ejecutarActo(req, {
      idLocal,
      accion: salida.accion,
      motivo: salida.motivo,
      trabajo: async (cx, { actuaciones }) => {
        await cx.execute('UPDATE local SET id_estado = ? WHERE id_local = ?', [salida.idEstadoLocal, idLocal]);
        // Si coordinación corrigió la clasificación, el relevamiento pasa a
        // decir GRAN GENERADOR: el registro de campo tiene que reflejar la
        // clasificación definitiva, no la que se anotó en la calle.
        const idEstadoRelevamiento =
          resultado === 'EXENTO_CONFIRMADO' ? ID_ESTADO.GENERADOR_MENOR : ID_ESTADO.GRAN_GENERADOR;
        await cx.execute(
          `UPDATE tramite SET fecha_cierre = NOW(), id_estado = ?
            WHERE id_local = ? AND id_ttramite = ? AND fecha_cierre IS NULL AND habilita = 1`,
          [idEstadoRelevamiento, idLocal, ID_TTRAMITE.RELEVAMIENTO],
        );

        if (resultado === 'EXENTO_CONFIRMADO') return {};

        const ciclo = Math.max(1, ...actuaciones.map((a) => Number(a.ciclo) || 1));
        const id = await insertarTramite(cx, {
          idLocal,
          idEstado: ID_ESTADO.NOTIF_PENDIENTE,
          idTtramite: ID_TTRAMITE.PRIMERA_NOTIFICACION,
          idUsuario: req.usuario?.id ?? null,
          nroCiclo: ciclo,
          fechaInicio: hoyISO(),
          observaciones: salida.motivo,
        });
        return { idTramite: id };
      },
    });

    res.json(await localPorId(idLocal));
  } catch (e) {
    next(e);
  }
});

export default router;
