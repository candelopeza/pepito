/* ============================================================================
   backend/rutas/prorrogas-expedientes.js  —  ETAPAS 5 Y 6
   ----------------------------------------------------------------------------
   Reemplaza estas funciones de src/datos/DatosProvider.jsx:

     otorgarProrroga        ->  POST /locales/:id/prorrogas   { dias, motivo }  (coordinacion)
     registrarExpediente    ->  POST /locales/:id/expedientes { numeroManual? } (administrativo)
     reingresarAlCircuito   ->  POST /locales/:id/reingreso   { motivo }        (coordinacion)

   Están en un archivo aparte de locales.js porque son ACTUACIONES sobre el
   local, no datos del padrón. Se montan en la raíz (ver servidor.js).

   LA PRÓRROGA SE CUENTA EN DÍAS CORRIDOS, a diferencia del plazo de las
   notificaciones que va en días hábiles. No es un descuido: son dos institutos
   distintos y el pliego los trata distinto (sección 4.1). Los días NO tienen
   valor por defecto, se ingresan caso por caso.

   EL EXPEDIENTE NO ES TERMINAL. Coordinación puede reingresar el local y la
   intimación arranca de cero, en la primera notificación y con un ciclo nuevo.
   ============================================================================ */

import { Router } from 'express';
import { consultar, enTransaccion } from '../conexion-bd.js';
import {
  cicloActual,
  insertarTramite,
  localPorId,
  parametros,
  prorrogasDelCiclo,
  tramitePorId,
  tramitesDeLocal,
} from '../consultas.js';
import { ID_ESTADO, ID_TTRAMITE, estadoDeLocal } from '../mapeo.js';
import { requiereRol } from '../middlewares/usuario.js';
import { hoyISO, sumarDias } from '../../src/dominio/fechas.js';

const router = Router();

/* POST /locales/:id/prorrogas  ->  otorga una prórroga (etapa 5).

   Solo se puede otorgar con las dos notificaciones agotadas: una prórroga
   antes de eso suspendería un plazo que todavía no corrió. Los topes salen de
   Configuración → Parámetros, no están escritos en el código. */
router.post('/locales/:id/prorrogas', requiereRol('coordinacion', 'direccion'), async (req, res, next) => {
  try {
    const idLocal = Number(req.params.id);
    const dias = Number(req.body?.dias);
    const motivo = (req.body?.motivo ?? '').trim();

    if (!Number.isInteger(dias) || dias <= 0) {
      return res.status(400).json({ error: 'Los días de la prórroga son obligatorios y tienen que ser un número positivo' });
    }
    if (!motivo) return res.status(400).json({ error: 'La prórroga necesita un motivo' });

    const local = await localPorId(idLocal);
    if (!local) return res.status(404).json({ error: 'Local no encontrado' });

    const params = await parametros();
    if (dias > params.topeProrrogaDias) {
      return res.status(400).json({ error: `El tope de prórroga es de ${params.topeProrrogaDias} días` });
    }

    const actuaciones = await tramitesDeLocal(idLocal);
    const estado = estadoDeLocal(local, actuaciones);
    const HABILITADOS = ['NOTIF2_ENTREGADA', 'NOTIF2_SIN_FIRMA', 'NOTIF2_FIJADA', 'GENERAR_EXPEDIENTE'];
    if (!HABILITADOS.includes(estado)) {
      return res.status(409).json({
        error: `No corresponde una prórroga con el local en estado ${estado}. Se otorga con las dos notificaciones agotadas.`,
      });
    }

    const ciclo = await cicloActual(idLocal);
    const yaOtorgadas = await prorrogasDelCiclo(idLocal, ciclo);
    if (yaOtorgadas >= params.maxProrrogasPorLocal) {
      return res.status(409).json({
        error: `El local ya usó ${yaOtorgadas} prórroga(s) en este ciclo y el máximo es ${params.maxProrrogasPorLocal}`,
      });
    }

    const hoy = hoyISO();
    const idTramite = await enTransaccion(async (cx) => {
      const id = await insertarTramite(cx, {
        idLocal,
        idEstado: ID_ESTADO.PRORROGA_VIGENTE,
        idTtramite: ID_TTRAMITE.PRORROGA,
        idUsuario: req.usuario?.id ?? null,
        nroCiclo: ciclo,
        plazoDias: dias,
        fechaInicio: hoy,
        // Días CORRIDOS desde el otorgamiento. Ver el encabezado del archivo.
        fechaVencimiento: sumarDias(hoy, dias),
        observaciones: motivo,
      });
      return id;
    });

    res.status(201).json(await tramitePorId(idTramite));
  } catch (e) {
    next(e);
  }
});

/* POST /locales/:id/expedientes  ->  inicia el expediente de multa (etapa 6).

   EL NÚMERO LO ASIGNA EL SISTEMA DE EXPEDIENTES MUNICIPAL, no este sistema.
   Los 67 expedientes ya cargados lo muestran: 175557, 175254/2026, 175486/26.
   Son números de la mesa de entradas, con su propio formato, y este sistema no
   tiene forma de inventarlos.

   Por eso `numeroManual` es lo normal, no la excepción. Si el expediente
   todavía no tiene número (la mesa de entradas no respondió), se emite uno
   PROVISORIO marcado como tal, para reconciliarlo después (sección 8.3). Un
   provisorio se distingue a simple vista: empieza con "PROV-". */
router.post('/locales/:id/expedientes', requiereRol('administrativo', 'coordinacion', 'direccion'), async (req, res, next) => {
  try {
    const idLocal = Number(req.params.id);
    const numeroManual = (req.body?.numeroManual ?? '').trim();

    const local = await localPorId(idLocal);
    if (!local) return res.status(404).json({ error: 'Local no encontrado' });

    const params = await parametros();
    if (params.exigirDatosSiempre && !local.cuit?.trim()) {
      return res.status(400).json({ error: 'No se puede iniciar el expediente sin CUIT del titular' });
    }

    const ciclo = await cicloActual(idLocal);
    const hoy = hoyISO();
    const anio = hoy.slice(0, 4);

    const idTramite = await enTransaccion(async (cx) => {
      let numero = numeroManual;
      if (!numero) {
        // Los provisorios se numeran PROV-<anio>-NNNN. El correlativo sale del
        // mayor que ya exista este anio: son pocos y los emite una persona por
        // vez, asi que no hace falta una secuencia reservada.
        const [fila] = await consultar(
          `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(numero_referencia, '-', -1) AS UNSIGNED)), 0) AS ultimo
             FROM tramite WHERE id_ttramite = ? AND numero_referencia LIKE ?`,
          [ID_TTRAMITE.EXPEDIENTE_MULTA, `PROV-${anio}-%`],
        );
        numero = `PROV-${anio}-${String(Number(fila.ultimo) + 1).padStart(4, '0')}`;
      }
      const id = await insertarTramite(cx, {
        idLocal,
        idEstado: ID_ESTADO.EXPEDIENTE_GENERADO,
        idTtramite: ID_TTRAMITE.EXPEDIENTE_MULTA,
        idUsuario: req.usuario?.id ?? null,
        nroCiclo: ciclo,
        numeroReferencia: numero,
        fechaInicio: hoy,
        observaciones: numeroManual
          ? 'Número de la mesa de entradas municipal.'
          : 'PROVISORIO: falta reconciliar con el número de la mesa de entradas.',
      });
      return id;
    });

    res.status(201).json(await tramitePorId(idTramite));
  } catch (e) {
    next(e);
  }
});

/* POST /locales/:id/reingreso  ->  el local vuelve al circuito desde el expediente.

   Sube el número de ciclo y deja el local listo para una primera notificación
   nueva. El ciclo es lo que distingue la primera notificación de esta vuelta
   de la del año pasado: sin él, el historial sería un montón de notificaciones
   sueltas sin forma de saber a qué intimación pertenece cada una. */
router.post('/locales/:id/reingreso', requiereRol('coordinacion', 'direccion'), async (req, res, next) => {
  try {
    const idLocal = Number(req.params.id);
    const motivo = (req.body?.motivo ?? '').trim();
    if (!motivo) return res.status(400).json({ error: 'El reingreso necesita un motivo' });

    const local = await localPorId(idLocal);
    if (!local) return res.status(404).json({ error: 'Local no encontrado' });

    const actuaciones = await tramitesDeLocal(idLocal);
    const estado = estadoDeLocal(local, actuaciones);
    if (estado !== 'EXPEDIENTE') {
      return res.status(409).json({ error: `Solo se reingresa un local en estado EXPEDIENTE, y este está en ${estado}` });
    }

    const ciclo = await cicloActual(idLocal);

    await enTransaccion(async (cx) => {
      // El local vuelve al punto de partida del circuito. El ciclo nuevo lo
      // llevará la primera notificación que se emita.
      await cx.execute('UPDATE local SET id_estado = ? WHERE id_local = ?', [ID_ESTADO.REVISION_DATOS, idLocal]);
      // Se cierra el expediente abierto: la vuelta anterior terminó.
      await cx.execute(
        `UPDATE tramite SET fecha_cierre = NOW()
          WHERE id_local = ? AND id_ttramite = ? AND fecha_cierre IS NULL AND habilita = 1`,
        [idLocal, ID_TTRAMITE.EXPEDIENTE_MULTA],
      );
      // Y queda registrado el reingreso como un trámite del ciclo nuevo.
      await insertarTramite(cx, {
        idLocal,
        idEstado: ID_ESTADO.NOTIF_PENDIENTE,
        idTtramite: ID_TTRAMITE.PRIMERA_NOTIFICACION,
        idUsuario: req.usuario?.id ?? null,
        nroCiclo: ciclo + 1,
        fechaInicio: hoyISO(),
        observaciones: `Reingreso al circuito desde expediente: ${motivo}`,
      });
    });

    res.json(await localPorId(idLocal));
  } catch (e) {
    next(e);
  }
});

export default router;
