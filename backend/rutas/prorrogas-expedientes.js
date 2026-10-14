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
import { consultarEn, ejecutar, enTransaccion } from '../conexion-bd.js';
import { insertarTramite, localPorId, parametros, prorrogasDelCiclo, recortarObservacion, tramitePorId } from '../consultas.js';
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
    if (numeroManual) {
      const errorFormato = validarNumeroExpediente(numeroManual);
      if (errorFormato) return res.status(400).json({ error: errorFormato });
    }

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
        // ... o un expediente SOLICITADO que ahora recibe su número: es el
        // mismo expediente, completando su recorrido (habilitado → solicitado
        // → generado). La fecha de inicio NO se pisa si venía de la solicitud:
        // se conserva cuándo se pidió, que es parte del dato.
        if (
          ultima?.tipo === 'EXPEDIENTE' &&
          [ID_ESTADO.EXPEDIENTE_PENDIENTE, ID_ESTADO.EXPEDIENTE_SOLICITADO].includes(ultima.idEstado)
        ) {
          const veniaSolicitado = ultima.idEstado === ID_ESTADO.EXPEDIENTE_SOLICITADO;
          await cx.execute(
            `UPDATE tramite SET id_estado = ?, numero_referencia = ?, fecha_inicio = COALESCE(fecha_inicio, ?), observaciones = ?,
                    id_usuario = COALESCE(?, id_usuario)
              WHERE id_tramite = ?`,
            [ID_ESTADO.EXPEDIENTE_GENERADO, numero, hoy, observaciones, req.usuario?.id ?? null, ultima.id],
          );
          await insertarNovedad(cx, req, {
            idTramite: ultima.id,
            detalle: veniaSolicitado
              ? `Llegó el número y el expediente queda formalmente iniciado: N° ${numero}.`
              : `El expediente pendiente del sistema anterior queda iniciado con el N° ${numero}.`,
            idEstadoNuevo: ID_ESTADO.EXPEDIENTE_GENERADO,
            publica: true,
          });
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
        await insertarNovedad(cx, req, {
          idTramite: id,
          detalle: `Expediente iniciado con el N° ${numero}${numeroManual ? '' : ' (provisorio, falta el número de la mesa de entradas)'}.`,
          idEstadoNuevo: ID_ESTADO.EXPEDIENTE_GENERADO,
          publica: true,
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
    const anterior = String(tramite.numeroExpediente ?? '');
    const eraProvisorio = anterior.startsWith('PROV-');

    const numero = String(req.body?.numero ?? '').trim();
    if (!numero) return res.status(400).json({ error: 'Escribí el número que asignó la mesa de entradas' });
    if (numero.toUpperCase().startsWith('PROV-')) {
      return res.status(400).json({ error: 'Ese es un número provisorio: escribí el de la mesa de entradas' });
    }
    const errorFormato = validarNumeroExpediente(numero);
    if (errorFormato) return res.status(400).json({ error: errorFormato });

    /* >>> EL NÚMERO GUARDADO NO SE EDITA: SE CORRIGE <<<
       Completar un provisorio es lo normal. Cambiar un número ya definitivo es
       una CORRECCIÓN: exige motivo y queda asentada en la bitácora con el
       número anterior a la vista. Inmutable del todo sería peor: el día que
       alguien se equivoque en un dígito, la única salida sería tocar la base
       a mano. */
    const motivo = String(req.body?.motivo ?? '').trim();
    if (!eraProvisorio && !motivo) {
      return res.status(400).json({
        error: `El expediente ya tiene el N° ${anterior}: para corregirlo hace falta el motivo, que queda en la bitácora.`,
      });
    }
    if (!eraProvisorio && numero === anterior) {
      return res.status(400).json({ error: 'El número nuevo es igual al que ya tiene.' });
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
      motivo: eraProvisorio
        ? `Expediente de multa: el provisorio ${anterior} pasa a ser el N° ${numero} de la mesa de entradas`
        : `Expediente de multa: corrección del N° ${anterior} por el N° ${numero}. Motivo: ${motivo}`,
      trabajo: async (cx) => {
        await cx.execute('UPDATE tramite SET numero_referencia = ?, observaciones = ? WHERE id_tramite = ?', [
          numero,
          eraProvisorio
            ? `Número de la mesa de entradas municipal (reemplazó al provisorio ${anterior}).`
            : recortarObservacion(`Número corregido (antes ${anterior}): ${motivo}`),
          tramite.id,
        ]);
        await insertarNovedad(cx, req, {
          idTramite: tramite.id,
          detalle: eraProvisorio
            ? `Llegó el número de la mesa de entradas: el provisorio ${anterior} pasa a ser el N° ${numero}.`
            : `Se corrigió el número del expediente: era ${anterior}, queda ${numero}. Motivo: ${motivo}`,
          // El cambio de un numero definitivo es cocina interna de la oficina;
          // el numero nuevo le llega al titular por el estado del expediente.
          publica: eraProvisorio,
        });
        return { idTramite: tramite.id };
      },
    });

    res.json(await tramitePorId(tramite.id));
  } catch (e) {
    next(e);
  }
});

/* ============================================================================
   LA SOLICITUD DEL NÚMERO Y LA BITÁCORA DEL EXPEDIENTE
   ----------------------------------------------------------------------------
   El expediente de multa tramita en OTRA dependencia del municipio, a la que
   este sistema no tiene acceso: la comunicación es humana (hoy, probablemente
   por correo). Lo que el sistema sí puede hacer es acompañar el recorrido:

     habilitado   lo determina el sistema al recalcular (GENERAR_EXPEDIENTE);
                  no hay trámite todavía
     SOLICITADO   un agente pidió el número: queda la fecha, el agente y el
                  canal. Es la decisión de una PERSONA, por eso se distingue
                  de habilitado: sin esa distinción nunca se sabría cuántos
                  expedientes esperan que alguien los pida
     GENERADO     llegó el número y se cargó (la ruta de arriba)
     EN TRÁMITE / CERRADO   lo que pase en la otra dependencia, registrado a
                  mano como novedades -- TODO-DEFINICION: confirmar con esa
                  dependencia qué estados maneja realmente

   >>> LA REGLA QUE NO SE PUEDE VIOLAR (pliego, mayor riesgo del proyecto) <<<
   La indisponibilidad del sistema de expedientes municipal no puede bloquear
   la operación: la carga manual del número funciona SIEMPRE. Si algún día hay
   integración automática, se suma como camino alternativo, nunca único.

   Cada movimiento queda en `expediente_novedad` (sql/10) con qué pasó, cuándo,
   quién y si el titular puede verlo en el portal (`publica`). Lo interno de la
   oficina y lo publicable se separan DESDE EL ORIGEN: distinguirlo después
   obligaría a revisar todos los registros ya cargados.
   ============================================================================ */

/* Por dónde se pide el número. TODO-DEFINICION: a quién se le pide y por qué
   canal lo define la Dirección; el correo de destino es un parámetro
   administrable (correoSolicitudExpedientes), no un valor del código. */
const CANALES_SOLICITUD = ['correo', 'telefono', 'presencial', 'otro'];

/* El número de la mesa de entradas es "número/año": 175079/2026. El largo del
   número NO se fija (hoy son seis dígitos, en unos meses pueden ser más: se
   aceptan de 4 a 12). El año se valida contra el año en curso Y el anterior,
   porque en enero conviven expedientes de los dos y el sistema no puede
   rechazar ninguno. */
function validarNumeroExpediente(numero) {
  const m = /^(\d{4,12})\/(\d{4})$/.exec(numero);
  if (!m) {
    return `El número de expediente es "número/año", por ejemplo 175079/${hoyISO().slice(0, 4)}. Llegó: "${numero}".`;
  }
  const anio = Number(m[2]);
  const actual = Number(hoyISO().slice(0, 4));
  if (anio !== actual && anio !== actual - 1) {
    return `El año del expediente (${anio}) tiene que ser ${actual} o ${actual - 1}.`;
  }
  return null;
}


async function insertarNovedad(cx, req, { idTramite, detalle, idEstadoNuevo = null, publica = false }) {
  const sql = `
    INSERT INTO expediente_novedad (id_tramite, usuario, id_usuario, detalle, id_estado_nuevo, publica)
    VALUES (?, ?, ?, ?, ?, ?)`;
  const parametrosSql = [
    idTramite,
    req.usuario?.nombre ?? 'sistema',
    req.usuario?.id ?? null,
    String(detalle).slice(0, 500),
    idEstadoNuevo,
    publica ? 1 : 0,
  ];
  if (cx) await cx.execute(sql, parametrosSql);
  else await ejecutar(sql, parametrosSql);
}

/* POST /locales/:id/expedientes/solicitud  ->  un agente pide el número.

   No crea el expediente en la otra dependencia (eso es humano): registra que
   SE PIDIÓ, cuándo, quién y por dónde. Exige el mismo debido proceso que la
   carga del número: dos notificaciones con entrega efectiva. */
router.post('/locales/:id/expedientes/solicitud', requiereRol('administrativo', 'coordinacion'), async (req, res, next) => {
  try {
    const idLocal = Number(req.params.id);
    const canal = String(req.body?.canal ?? '').trim().toLowerCase();
    const observaciones = String(req.body?.observaciones ?? '').trim();
    if (!CANALES_SOLICITUD.includes(canal)) {
      return res.status(400).json({ error: `Indicá por qué canal se pidió: ${CANALES_SOLICITUD.join(', ')}.` });
    }

    const { idTramite } = await ejecutarActo(req, {
      idLocal,
      accion: 'solicitar-expediente',
      controlar: async ({ local, actuaciones }, cx) => {
        const params = await parametros(cx);
        if (requiereDatosRegistrales('registrar-expediente', params.exigirDatosSiempre) && !datosRegistralesCompletos(local)) {
          return new ErrorActo(400, `No se puede solicitar el expediente: faltan ${faltantesRegistrales(local).join(', ')}`);
        }
        const ciclo = cicloDe(actuaciones);
        if (!constaEntrega(actuaciones, 1, ciclo) || !constaEntrega(actuaciones, 2, ciclo)) {
          return new ErrorActo(
            409,
            'No constan las dos notificaciones con entrega efectiva en este ciclo. Revisá el historial del local antes de pedir el expediente.',
          );
        }
        return null;
      },
      motivo: `Solicitud del número de expediente (${canal})`,
      trabajo: async (cx, { actuaciones }) => {
        const id = await insertarTramite(cx, {
          idLocal,
          idEstado: ID_ESTADO.EXPEDIENTE_SOLICITADO,
          idTtramite: ID_TTRAMITE.EXPEDIENTE_MULTA,
          idUsuario: req.usuario?.id ?? null,
          nroCiclo: cicloDe(actuaciones),
          fechaInicio: hoyISO(),
          observaciones: recortarObservacion(`Número solicitado por ${canal}.${observaciones ? ` ${observaciones}` : ''}`),
        });
        await insertarNovedad(cx, req, {
          idTramite: id,
          detalle: `Se solicitó el número de expediente a la dependencia (canal: ${canal}).${observaciones ? ` ${observaciones}` : ''}`,
          idEstadoNuevo: ID_ESTADO.EXPEDIENTE_SOLICITADO,
          // Interna: el titular ve el ESTADO (solicitado), no quién pidió qué.
          publica: false,
        });
        await insertarNovedad(cx, req, {
          idTramite: id,
          detalle: 'Se pidió la apertura del expediente sancionatorio. Cuando llegue el número, va a figurar acá.',
          publica: true,
        });
        return { idTramite: id };
      },
    });

    res.status(201).json(await tramitePorId(idTramite));
  } catch (e) {
    next(e);
  }
});

/* GET /expedientes/novedades  ->  la bitácora completa, para el store.

   La oficina ve todo. El TITULAR solo las novedades públicas, sin quién hizo
   cada movimiento: necesita saber que tiene expediente y en qué estado está,
   no las observaciones internas. */
router.get('/expedientes/novedades', async (req, res, next) => {
  try {
    if (!req.usuario) return res.status(401).json({ error: 'Falta identificar al usuario' });
    const esTitular = req.usuario.rol === 'titular';
    const filas = await consultarEn(
      null,
      `SELECT n.id_novedad, n.id_tramite, t.id_local, n.momento, n.usuario, n.detalle, n.id_estado_nuevo, n.publica
         FROM expediente_novedad n
         JOIN tramite t ON t.id_tramite = n.id_tramite AND t.habilita = 1
        WHERE n.habilita = 1 ${esTitular ? 'AND n.publica = 1' : ''}
        ORDER BY n.momento, n.id_novedad`,
    );
    res.json(
      filas.map((n) => ({
        id: n.idNovedad,
        idTramite: n.idTramite,
        localId: n.idLocal,
        momento: n.momento,
        detalle: n.detalle,
        idEstadoNuevo: n.idEstadoNuevo,
        publica: Boolean(n.publica),
        // El autor es dato interno de la oficina.
        ...(esTitular ? {} : { usuario: n.usuario }),
      })),
    );
  } catch (e) {
    next(e);
  }
});

/* POST /expedientes/:id/novedades  ->  registrar un movimiento del expediente.

   { detalle, publica?, nuevoEstado? }  nuevoEstado: 'EN_TRAMITE' | 'CERRADO'.
   Es lo que convierte la pantalla en una fuente confiable y no en un cuaderno
   de notas: cada avance en la otra dependencia queda con fecha, autor y
   observación, y se decide EN EL MOMENTO si el titular lo ve. */
const ESTADOS_NOVEDAD = { EN_TRAMITE: 'EXPEDIENTE_EN_TRAMITE', CERRADO: 'EXPEDIENTE_CERRADO' };

router.post('/expedientes/:id/novedades', requiereRol('administrativo', 'coordinacion'), async (req, res, next) => {
  try {
    const tramite = await tramitePorId(Number(req.params.id));
    if (!tramite || tramite.tipo !== 'EXPEDIENTE') return res.status(404).json({ error: 'No existe ese expediente' });

    const detalle = String(req.body?.detalle ?? '').trim();
    if (!detalle) return res.status(400).json({ error: 'Contá qué pasó: la novedad necesita el detalle.' });

    const nuevoEstado = req.body?.nuevoEstado ? String(req.body.nuevoEstado).trim().toUpperCase() : null;
    if (nuevoEstado && !ESTADOS_NOVEDAD[nuevoEstado]) {
      return res.status(400).json({ error: `El estado nuevo puede ser: ${Object.keys(ESTADOS_NOVEDAD).join(', ')}.` });
    }
    if (nuevoEstado && tramite.idEstado === ID_ESTADO.EXPEDIENTE_SOLICITADO) {
      return res.status(409).json({ error: 'Este expediente todavía no tiene número: cargalo primero y después registrá el avance.' });
    }

    const idEstadoNuevo = nuevoEstado ? ID_ESTADO[ESTADOS_NOVEDAD[nuevoEstado]] : null;
    await enTransaccion(async (cx) => {
      if (idEstadoNuevo) {
        await cx.execute('UPDATE tramite SET id_estado = ? WHERE id_tramite = ?', [idEstadoNuevo, tramite.id]);
      }
      await insertarNovedad(cx, req, {
        idTramite: tramite.id,
        detalle,
        idEstadoNuevo,
        publica: req.body?.publica === true,
      });
    });

    res.status(201).json({ ok: true, idTramite: tramite.id, nuevoEstado: nuevoEstado ?? null });
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
        /* La bitácora refleja el movimiento: sin esta novedad, el comercio
           aparecería con expediente abierto y a la vez con una notificación
           en curso, sin ninguna explicación visible. El expediente NO
           desaparece: queda en el historial. */
        const [expediente] = await consultarEn(
          cx,
          'SELECT id_tramite FROM tramite WHERE id_local = ? AND id_ttramite = ? AND habilita = 1 ORDER BY id_tramite DESC LIMIT 1',
          [idLocal, ID_TTRAMITE.EXPEDIENTE_MULTA],
        );
        if (expediente) {
          await insertarNovedad(cx, req, {
            idTramite: expediente.idTramite,
            detalle: `Coordinación devolvió el comercio al circuito de notificación: ${motivo}. Se genera una primera notificación nueva y el expediente queda en el historial.`,
            publica: true,
          });
        }
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

/* Si la tabla de la bitácora no existe todavía, el pedido cae acá con el
   error 1146 de MariaDB y la respuesta dice exactamente qué correr. */
router.use((err, _req, res, next) => {
  if (err?.errno === 1146 && /expediente_novedad/.test(err.message ?? '')) {
    return res.status(503).json({
      error: 'Falta la bitácora de expedientes. Correr backend/sql/10-expedientes.sql desde HeidiSQL y volver a intentar.',
    });
  }
  next(err);
});

export default router;
