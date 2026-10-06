/* ============================================================================
   backend/rutas/relevamientos.js  —  CAMPO Y CONTROL ADMINISTRATIVO
   ----------------------------------------------------------------------------
   Reemplaza estas funciones de src/datos/DatosProvider.jsx:

     relevamientos (lista)     ->  GET  /relevamientos
     crearRelevamiento         ->  POST /relevamientos                    (rol relevador)
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
   ============================================================================ */

import { Router } from 'express';
import { enTransaccion } from '../conexion-bd.js';
import { insertarTramite, localPorId, tramitesPorTipo } from '../consultas.js';
import { ID_ESTADO, ID_TTRAMITE } from '../mapeo.js';
import { requiereRol } from '../middlewares/usuario.js';
import { geocodificar } from '../geocodificador.js';
import { hoyISO } from '../../src/dominio/fechas.js';

const router = Router();

/* Los tres cierres posibles del control administrativo (etapa 2), con el
   estado en que queda el local y el motivo que se escribe en la auditoría. */
const RESULTADOS_REVISION = {
  EXENTO_CONFIRMADO: {
    idEstadoLocal: ID_ESTADO.RELEVADO_EXENTO,
    motivo: 'Coordinación confirmó la exención',
  },
  GRAN_GENERADOR: {
    idEstadoLocal: ID_ESTADO.REVISION_DATOS,
    motivo: 'Coordinación corrigió la clasificación: sí es Gran Generador',
  },
  HABILITADO: {
    idEstadoLocal: ID_ESTADO.REVISION_DATOS,
    motivo: 'Coordinación habilitó la notificación',
  },
};

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

    const esGran = datos.clasificacion === 'GRAN_GENERADOR';
    // Un gran generador entra a revisión de datos; uno menor queda a la espera
    // de que coordinación confirme la exención.
    const idEstadoLocal = esGran ? ID_ESTADO.REVISION_DATOS : ID_ESTADO.EXENTO_PENDIENTE;
    const geo = await geocodificar(datos.direccionRelevada);
    const hoy = hoyISO();

    const idLocal = await enTransaccion(async (cx) => {
      const [alta] = await cx.execute(
        `INSERT INTO local
           (cuit, id_original, id_usuario, id_rubro, id_estado, razon_social, nombre_local,
            direccion_local, domicilio_fiscal, latitud_local, longitud_local,
            email_local, telefono_local, observacion, bloqueado, habilita)
         VALUES (NULL, NULL, ?, ?, ?, NULL, ?, ?, NULL, ?, ?, NULL, NULL, ?, 0, 1)`,
        [
          req.usuario?.id ?? null,
          Number(datos.rubroId) || 1,
          idEstadoLocal,
          datos.nombreLocal.trim(),
          datos.direccionRelevada.trim(),
          geo.ok ? geo.latitud : null,
          geo.ok ? geo.longitud : null,
          datos.observaciones ?? null,
        ],
      );

      await insertarTramite(cx, {
        idLocal: alta.insertId,
        idEstado: esGran ? ID_ESTADO.GRAN_GENERADOR : ID_ESTADO.GENERADOR_MENOR,
        idTtramite: ID_TTRAMITE.RELEVAMIENTO,
        idUsuario: req.usuario?.id ?? null,
        nroCiclo: 1,
        direccionRelevada: datos.direccionRelevada.trim(),
        latitudRelevamiento: datos.latitud ?? null,
        longitudRelevamiento: datos.longitud ?? null,
        fechaInicio: hoy,
        observaciones: datos.observaciones ?? '',
      });


      return alta.insertId;
    });

    res.status(201).json(await localPorId(idLocal));
  } catch (e) {
    next(e);
  }
});

/* POST /relevamientos/:localId/revision  ->  control administrativo (etapa 2).

   Cierra el relevamiento pendiente y deja el local en el estado que
   corresponda. `fecha_cierre` del trámite es la marca de revisado: mientras
   está en NULL, el relevamiento sigue en la bandeja de control. */
router.post('/:localId/revision', requiereRol('coordinacion', 'direccion'), async (req, res, next) => {
  try {
    const idLocal = Number(req.params.localId);
    const salida = RESULTADOS_REVISION[req.body?.resultado];
    if (!salida) {
      return res.status(400).json({
        error: `Resultado inválido. Valores posibles: ${Object.keys(RESULTADOS_REVISION).join(', ')}`,
      });
    }

    const local = await localPorId(idLocal);
    if (!local) return res.status(404).json({ error: 'Local no encontrado' });

    await enTransaccion(async (cx) => {
      await cx.execute('UPDATE local SET id_estado = ? WHERE id_local = ?', [salida.idEstadoLocal, idLocal]);
      // Si coordinación corrigió la clasificación, el relevamiento pasa a
      // decir GRAN GENERADOR: el registro de campo tiene que reflejar la
      // clasificación definitiva, no la que se anotó en la calle.
      const idEstadoRelevamiento =
        req.body.resultado === 'EXENTO_CONFIRMADO' ? ID_ESTADO.GENERADOR_MENOR : ID_ESTADO.GRAN_GENERADOR;
      await cx.execute(
        `UPDATE tramite SET fecha_cierre = NOW(), id_estado = ?
          WHERE id_local = ? AND id_ttramite = ? AND fecha_cierre IS NULL AND habilita = 1`,
        [idEstadoRelevamiento, idLocal, ID_TTRAMITE.RELEVAMIENTO],
      );
    });

    res.json(await localPorId(idLocal));
  } catch (e) {
    next(e);
  }
});

export default router;
