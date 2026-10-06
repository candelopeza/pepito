/* ============================================================================
   backend/rutas/prorrogas-expedientes.js  —  ETAPAS 5 Y 6
   ----------------------------------------------------------------------------
   Reemplaza estas funciones de src/datos/DatosProvider.jsx:

     otorgarProrroga        ->  POST /locales/:id/prorrogas   { dias, motivo }  (coordinacion)
     registrarExpediente    ->  POST /locales/:id/expedientes { numeroManual? } (administrativo)
     reingresarAlCircuito   ->  POST /locales/:id/reingreso   { motivo }        (coordinacion)

   Están en un archivo aparte de locales.js porque son ACTUACIONES sobre el
   local, no datos del padrón. Se montan en la raíz (ver servidor.js).

   Los tres pasan por backend/actos.js: solo se registran en el estado que les
   corresponde según la tabla ACCIONES de src/dominio/reglas.js, y el cambio de
   estado queda en la auditoría.

   LA PRÓRROGA SE CUENTA EN DÍAS CORRIDOS, a diferencia del plazo de las
   notificaciones que va en días hábiles. No es un descuido: son dos institutos
   distintos y el pliego los trata distinto (sección 4.1). Los días NO tienen
   valor por defecto, se ingresan caso por caso.

   EL EXPEDIENTE NO ES TERMINAL. Coordinación puede reingresar el local y la
   intimación arranca de cero, en la primera notificación y con un ciclo nuevo.
   ============================================================================ */

import { Router } from 'express';
import { consultarEn } from '../conexion-bd.js';
import { insertarTramite, localPorId, parametros, prorrogasDelCiclo, tramitePorId } from '../consultas.js';
import { ID_ESTADO, ID_TTRAMITE, datosRegistralesCompletos, faltantesRegistrales } from '../mapeo.js';
import { requiereRol } from '../middlewares/usuario.js';
import { ErrorActo, ejecutarActo } from '../actos.js';
import { auditoriaDisponible } from '../auditoria.js';
import { hoyISO, sumarDias } from '../../src/dominio/fechas.js';
import { ACCIONES, requiereDatosRegistrales } from '../../src/dominio/reglas.js';

const router = Router();

function cicloDe(actuaciones) {
  return Math.max(1, ...actuaciones.map((a) => Number(a.ciclo) || 1));
}

/* ¿Consta una entrega efectiva de la instancia `n` en este ciclo?
   Efectiva = entregada con firma, sin firma o fijada. Una notificación con un
   estado que el sistema no conoce pero con fecha de entrega cargada también
   cuenta, igual que en estadoDeLocal() de mapeo.js: los dos tienen que decir
   lo mismo, o el local aparecería en "Expedientes para generar" y después no
   se le podría generar. */
function constaEntrega(actuaciones, n, ciclo) {
  return actuaciones.some(
    (a) =>
      a.tipo === 'NOTIFICACION' &&
      a.instancia === n &&
      (Number(a.ciclo) || 1) === ciclo &&
      (['ENTREGADA', 'SIN_FIRMA', 'FIJADA'].includes(a.resultado) || (!a.resultado && a.fechaEntrega)),
  );
}

/* POST /locales/:id/prorrogas  ->  otorga una prórroga (etapa 5).

   Solo se puede otorgar con las dos notificaciones agotadas: una prórroga
   antes de eso suspendería un plazo que todavía no corrió. Los topes salen de
   Configuración → Parámetros. */
router.post('/locales/:id/prorrogas', requiereRol('coordinacion'), async (req, res, next) => {
  try {
    const idLocal = Number(req.params.id);
    const dias = Number(req.body?.dias);
    const motivo = (req.body?.motivo ?? '').trim();

    if (!Number.isInteger(dias) || dias <= 0) {
      return res.status(400).json({ error: 'Los días de la prórroga son obligatorios y tienen que ser un número positivo' });
    }
    if (!motivo) return res.status(400).json({ error: 'La prórroga necesita un motivo' });

    const { idTramite } = await ejecutarActo(req, {
      idLocal,
      accion: 'otorgar-prorroga',
      controlar: async ({ actuaciones }, cx) => {
        const params = await parametros(cx);
        if (params.topeProrrogaDias > 0 && dias > params.topeProrrogaDias) {
          return new ErrorActo(400, `El tope de prórroga es de ${params.topeProrrogaDias} días`);
        }
        const yaOtorgadas = await prorrogasDelCiclo(idLocal, cicloDe(actuaciones), cx);
        if (params.maxProrrogasPorLocal > 0 && yaOtorgadas >= params.maxProrrogasPorLocal) {
          return new ErrorActo(
            409,
            `El local ya usó ${yaOtorgadas} prórroga(s) en este ciclo y el máximo es ${params.maxProrrogasPorLocal}`,
          );
        }
        return null;
      },
      motivo: `Prórroga de ${dias} días corridos: ${motivo}`,
      trabajo: async (cx, { actuaciones }) => {
        const hoy = hoyISO();
        const id = await insertarTramite(cx, {
          idLocal,
          idEstado: ID_ESTADO.PRORROGA_VIGENTE,
          idTtramite: ID_TTRAMITE.PRORROGA,
          idUsuario: req.usuario?.id ?? null,
          nroCiclo: cicloDe(actuaciones),
          plazoDias: dias,
          fechaInicio: hoy,
          // Días CORRIDOS desde el otorgamiento. Ver el encabezado del archivo.
          fechaVencimiento: sumarDias(hoy, dias),
          observaciones: motivo,
        });
        return { idTramite: id };
      },
    });

    res.status(201).json(await tramitePorId(idTramite));
  } catch (e) {
    next(e);
  }
});

/* POST /locales/:id/solicitud-prorroga  ->  el TITULAR pide una prórroga desde
   el portal (sección 6.3).

   Pedir no es otorgar: la cantidad de días la decide coordinación. Por eso no
   crea ningún trámite ni cambia el estado: deja la solicitud anotada en el
   historial del local (tabla `auditoria`), con los días pedidos y el motivo,
   para que coordinación la vea en la ficha y otorgue lo que corresponda. Solo
   en los estados en que se puede otorgar una prórroga.

   Sin la tabla `auditoria` no hay dónde anotarla y responde 501. */
router.post('/locales/:id/solicitud-prorroga', requiereRol('titular'), async (req, res, next) => {
  try {
    const idLocal = Number(req.params.id);
    const dias = Number(req.body?.dias);
    const motivo = String(req.body?.motivo ?? '').trim();
    if (!Number.isInteger(dias) || dias <= 0) return res.status(400).json({ error: 'Indicá cuántos días necesitás' });
    if (!motivo) return res.status(400).json({ error: 'Contá por qué necesitás más tiempo' });
    if (!auditoriaDisponible()) {
      return res.status(501).json({
        error: 'Las solicitudes de prórroga todavía no se pueden registrar por el portal. Comunicate con la Dirección de Ambiente.',
        capacidad: 'auditoria',
      });
    }

    const estadosQueAdmiten = ACCIONES.find((a) => a.id === 'otorgar-prorroga')?.estados ?? [];
    await ejecutarActo(req, {
      idLocal,
      nombre: 'solicitud-prorroga',
      controlar: async ({ estado }) =>
        estadosQueAdmiten.includes(estado)
          ? null
          : new ErrorActo(409, 'En este momento tu local no está en una etapa en la que se pueda pedir prórroga.'),
      motivo: `Solicitud de prórroga del titular por ${dias} días: ${motivo}`,
      forzarRegistro: true,
      trabajo: async () => ({}),
    });

    res.status(201).json({ ok: true });
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
   provisorio se distingue a simple vista: empieza con "PROV-".

   >>> DEBIDO PROCESO (criterio de aceptación del capítulo 10) <<<
   "Ningún local puede llegar a expediente sin que consten dos notificaciones
   con entrega efectiva." Se verifica acá, además del estado: hay locales del
   sistema anterior que llegaron a "Generar expediente" con una cédula no
   entregada (error B-1 del Anexo B), y a esos no se les puede iniciar un
   expediente sin revisar el caso. */
router.post('/locales/:id/expedientes', requiereRol('administrativo', 'coordinacion'), async (req, res, next) => {
  try {
    const idLocal = Number(req.params.id);
    const numeroManual = String(req.body?.numeroManual ?? '').trim();

    const { idTramite } = await ejecutarActo(req, {
      idLocal,
      accion: 'registrar-expediente',
      controlar: async ({ local, actuaciones }, cx) => {
        const params = await parametros(cx);
        if (requiereDatosRegistrales('registrar-expediente', params.exigirDatosSiempre) && !datosRegistralesCompletos(local)) {
          return new ErrorActo(400, `No se puede iniciar el expediente: faltan ${faltantesRegistrales(local).join(', ')}`);
        }
        const ciclo = cicloDe(actuaciones);
        if (!constaEntrega(actuaciones, 1, ciclo) || !constaEntrega(actuaciones, 2, ciclo)) {
          return new ErrorActo(
            409,
            'No constan las dos notificaciones con entrega efectiva en este ciclo. Revisá el historial del local antes de iniciar el expediente.',
          );
        }
        if (numeroManual) {
          const [repetido] = await consultarEn(
            cx,
            'SELECT id_local FROM tramite WHERE id_ttramite = ? AND numero_referencia = ? AND habilita = 1 LIMIT 1',
            [ID_TTRAMITE.EXPEDIENTE_MULTA, numeroManual],
          );
          if (repetido) {
            return new ErrorActo(409, `El expediente N° ${numeroManual} ya está registrado en el local N° ${repetido.idLocal}.`);
          }
        }
        return null;
      },
      motivo: (r) => `Expediente de multa N° ${r.numero}${r.provisorio ? ' (provisorio)' : ''}`,
      trabajo: async (cx, { actuaciones }) => {
        const hoy = hoyISO();
        const anio = hoy.slice(0, 4);
        let numero = numeroManual;
        if (!numero) {
          // Los provisorios se numeran PROV-<anio>-NNNN. Se lee dentro de la
          // misma transacción y con los actos en fila: dos pedidos simultáneos
          // no pueden sacar el mismo número.
          const [fila] = await consultarEn(
            cx,
            `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(numero_referencia, '-', -1) AS UNSIGNED)), 0) AS ultimo
               FROM tramite WHERE id_ttramite = ? AND numero_referencia LIKE ?`,
            [ID_TTRAMITE.EXPEDIENTE_MULTA, `PROV-${anio}-%`],
          );
          numero = `PROV-${anio}-${String(Number(fila.ultimo) + 1).padStart(4, '0')}`;
        }
        const observaciones = numeroManual
          ? 'Número de la mesa de entradas municipal.'
          : 'PROVISORIO: falta reconciliar con el número de la mesa de entradas.';

        // Si el sistema anterior dejó un expediente PENDIENTE para este local
        // (estado 23 de la base), se completa ese mismo trámite en vez de
        // crear otro: es el mismo expediente, que ahora tiene número.
        const circuito = actuaciones.filter((a) => ['NOTIFICACION', 'PRORROGA', 'EXPEDIENTE'].includes(a.tipo));
        const ultima = circuito[circuito.length - 1];
        if (ultima?.tipo === 'EXPEDIENTE' && ultima.idEstado === ID_ESTADO.EXPEDIENTE_PENDIENTE) {
          await cx.execute(
            `UPDATE tramite SET id_estado = ?, numero_referencia = ?, fecha_inicio = ?, observaciones = ?,
                    id_usuario = COALESCE(?, id_usuario)
              WHERE id_tramite = ?`,
            [ID_ESTADO.EXPEDIENTE_GENERADO, numero, hoy, observaciones, req.usuario?.id ?? null, ultima.id],
          );
          return { idTramite: ultima.id, numero, provisorio: !numeroManual };
        }

        const id = await insertarTramite(cx, {
          idLocal,
          idEstado: ID_ESTADO.EXPEDIENTE_GENERADO,
          idTtramite: ID_TTRAMITE.EXPEDIENTE_MULTA,
          idUsuario: req.usuario?.id ?? null,
          nroCiclo: cicloDe(actuaciones),
          numeroReferencia: numero,
          fechaInicio: hoy,
          observaciones,
        });
        return { idTramite: id, numero, provisorio: !numeroManual };
      },
    });

    res.status(201).json(await tramitePorId(idTramite));
  } catch (e) {
    next(e);
  }
});

/* PUT /expedientes/:id/numero  ->  el número DEFINITIVO de un expediente
   provisorio (sección 8.3: "si la comunicación falla, el sistema debe
   permitir registrar el número manualmente y reconciliar después").

   Solo sobre un PROV-: un número de la mesa de entradas no se cambia por
   esta vía. El número nuevo no puede estar usado en otro expediente. Queda en
   el historial qué provisorio se reemplazó y por cuál. */
router.put('/expedientes/:id/numero', requiereRol('administrativo', 'coordinacion'), async (req, res, next) => {
  try {
    const tramite = await tramitePorId(Number(req.params.id));
    if (!tramite || tramite.tipo !== 'EXPEDIENTE') return res.status(404).json({ error: 'No existe ese expediente' });
    const provisorio = String(tramite.numeroExpediente ?? '');
    if (!provisorio.startsWith('PROV-')) {
      return res.status(409).json({ error: `El expediente N° ${provisorio} ya tiene número de la mesa de entradas.` });
    }
    const numero = String(req.body?.numero ?? '').trim();
    if (!numero) return res.status(400).json({ error: 'Escribí el número que asignó la mesa de entradas' });
    if (numero.toUpperCase().startsWith('PROV-')) {
      return res.status(400).json({ error: 'Ese es un número provisorio: escribí el de la mesa de entradas' });
    }

    await ejecutarActo(req, {
      idLocal: tramite.localId,
      nombre: 'numero-expediente',
      forzarRegistro: true,
      controlar: async (_antes, cx) => {
        const [repetido] = await consultarEn(
          cx,
          'SELECT id_local FROM tramite WHERE id_ttramite = ? AND numero_referencia = ? AND habilita = 1 AND id_tramite <> ? LIMIT 1',
          [ID_TTRAMITE.EXPEDIENTE_MULTA, numero, tramite.id],
        );
        return repetido
          ? new ErrorActo(409, `El expediente N° ${numero} ya está registrado en el local N° ${repetido.idLocal}.`)
          : null;
      },
      motivo: `Expediente de multa: el provisorio ${provisorio} pasa a ser el N° ${numero} de la mesa de entradas`,
      trabajo: async (cx) => {
        await cx.execute('UPDATE tramite SET numero_referencia = ?, observaciones = ? WHERE id_tramite = ?', [
          numero,
          `Número de la mesa de entradas municipal (reemplazó al provisorio ${provisorio}).`,
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

/* POST /locales/:id/reingreso  ->  el local vuelve al circuito desde el expediente.

   Sube el número de ciclo y deja el local listo para una primera notificación
   nueva. El ciclo es lo que distingue la primera notificación de esta vuelta
   de la del año pasado: sin él, el historial sería un montón de notificaciones
   sueltas sin forma de saber a qué intimación pertenece cada una. */
router.post('/locales/:id/reingreso', requiereRol('coordinacion'), async (req, res, next) => {
  try {
    const idLocal = Number(req.params.id);
    const motivo = (req.body?.motivo ?? '').trim();
    if (!motivo) return res.status(400).json({ error: 'El reingreso necesita un motivo' });

    await ejecutarActo(req, {
      idLocal,
      accion: 'reingresar-circuito',
      controlar: async ({ local }, cx) => {
        const params = await parametros(cx);
        if (requiereDatosRegistrales('reingresar-circuito', params.exigirDatosSiempre) && !datosRegistralesCompletos(local)) {
          return new ErrorActo(400, `No se puede reingresar el local: faltan ${faltantesRegistrales(local).join(', ')}`);
        }
        return null;
      },
      motivo: `Reingreso al circuito desde expediente: ${motivo}`,
      trabajo: async (cx, { actuaciones }) => {
        const ciclo = cicloDe(actuaciones);
        // El local vuelve al punto de partida del circuito. El ciclo nuevo lo
        // lleva la primera notificación pendiente que se crea abajo.
        await cx.execute('UPDATE local SET id_estado = ? WHERE id_local = ?', [ID_ESTADO.REVISION_DATOS, idLocal]);
        // Se cierra el expediente abierto: la vuelta anterior terminó.
        await cx.execute(
          `UPDATE tramite SET fecha_cierre = NOW()
            WHERE id_local = ? AND id_ttramite = ? AND fecha_cierre IS NULL AND habilita = 1`,
          [idLocal, ID_TTRAMITE.EXPEDIENTE_MULTA],
        );
        // Y queda registrado el reingreso como un trámite del ciclo nuevo.
        const id = await insertarTramite(cx, {
          idLocal,
          idEstado: ID_ESTADO.NOTIF_PENDIENTE,
          idTtramite: ID_TTRAMITE.PRIMERA_NOTIFICACION,
          idUsuario: req.usuario?.id ?? null,
          nroCiclo: ciclo + 1,
          fechaInicio: hoyISO(),
          observaciones: `Reingreso al circuito desde expediente: ${motivo}`,
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
