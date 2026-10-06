/* ============================================================================
   backend/rutas/herramientas.js  —  DUPLICADOS, GEOCODIFICACIÓN, INFORME 9DJ
   ----------------------------------------------------------------------------
   Reemplaza estas funciones de src/datos/DatosProvider.jsx:

     fusiones (lista)          ->  GET  /herramientas/fusiones
     fusionarLocales           ->  POST /herramientas/fusiones   { idPrincipal, idDuplicado }
     geocodificarPendientes    ->  POST /herramientas/geocodificar
     aplicarInforme9DJ         ->  POST /herramientas/informe-9dj  { filas: [...] }
     recalcularEstados         ->  POST /herramientas/recalcular-estados

   La DETECCIÓN de duplicados sigue corriendo en el front (src/dominio/
   duplicados.js) sobre la lista de locales: es solo lectura y no necesita
   base. Lo que está acá es la fusión, que sí escribe.

   EL HISTORIAL DE CAMBIOS DE ESTADO vive en backend/auditoria.js. Fusiones e
   informe escriben ahí lo que cambian, en la misma transacción.
   ============================================================================ */

import { Router } from 'express';
import { consultar, consultarEn, ejecutar, enTransaccion } from '../conexion-bd.js';
import { enFila, insertarTramite, localPorId, parametros, recortarObservacion, situacionDeLocal } from '../consultas.js';
import { ID_ESTADO, ID_TDOC, ID_TTRAMITE } from '../mapeo.js';
import { requiereRol, firmante } from '../middlewares/usuario.js';
import { geocodificadorConfigurado, geocodificarDireccion } from '../geocodificador.js';
import { ErrorActo, registrarAlta } from '../actos.js';
import { ponerAlDia, registrarCambio, registrarPasoDelTiempo } from '../auditoria.js';
import { hoyISO } from '../../src/dominio/fechas.js';

const router = Router();

/* La marca que queda en `local.observacion` del duplicado. Es un prefijo fijo
   para poder buscarlo después con LIKE.

   >>> POR QUÉ EN UN CAMPO DE TEXTO <<<
   Lo correcto sería una columna `local.id_fusionado_en`, que se decidió no
   agregar por ahora. Mientras tanto la marca va en la observación: el dato
   queda visible para cualquiera que abra la ficha, que es lo que más importa.
   Si algún día se agrega la columna, esto se migra con un UPDATE. Con la
   auditoría, además, la fusión queda anotada en los dos locales. */
const MARCA_FUSION = 'FUSIONADO EN LOCAL';

const esFechaISO = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/* GET /herramientas/fusiones  ->  el registro de duplicados unificados.
   Son los locales dados de baja que llevan la marca en su observación. */
router.get('/fusiones', async (_req, res, next) => {
  try {
    const filas = await consultar(
      `SELECT d.id_local, d.nombre_local, d.id_original, d.observacion,
              p.nombre_local AS nombre_principal
         FROM local d
         LEFT JOIN local p ON p.id_local = CAST(REGEXP_SUBSTR(d.observacion, '[0-9]+') AS UNSIGNED)
        WHERE d.habilita = 0 AND d.observacion LIKE ?
        ORDER BY d.id_local DESC`,
      [`${MARCA_FUSION}%`],
    );
    res.json(filas.map(aFusion));
  } catch (e) {
    next(e);
  }
});

/* Desarma la marca "FUSIONADO EN LOCAL 567 (ditecdesa, 2026-09-23). ..." en los
   campos que muestra la pantalla de Duplicados. El formato lo escribe este
   mismo archivo al fusionar, así que es estable; si no se puede leer, los
   campos vuelven en null en vez de romper la lista. */
function aFusion(f) {
  const marca = String(f.observacion ?? '');
  const partes = marca.match(/^FUSIONADO EN LOCAL (\d+) \(([^,]+), (\d{4}-\d{2}-\d{2})\)/);
  return {
    // La pantalla necesita una clave única por fila: el id del duplicado lo es,
    // porque un local se fusiona una sola vez.
    id: f.idLocal,
    idPrincipal: partes ? Number(partes[1]) : null,
    idDuplicado: f.idLocal,
    idLegacyDuplicado: f.idOriginal,
    nombreDuplicado: f.nombreLocal,
    nombrePrincipal: f.nombrePrincipal ?? null,
    actor: partes ? partes[2] : null,
    momento: partes ? partes[3] : null,
    detalle: marca,
  };
}

/* POST /herramientas/fusiones  ->  unifica dos fichas del mismo comercio.

   Los trámites del duplicado PASAN al principal: son actos administrativos
   reales sobre ese comercio y no se pueden perder porque la ficha estaba
   cargada dos veces. El duplicado queda con habilita = 0 y con una marca en su
   observación que dice en qué local se unificó, que es lo que permite después
   rastrear una actuación histórica hecha sobre el id viejo. */
router.post('/fusiones', requiereRol('coordinacion'), async (req, res, next) => {
  try {
    const idPrincipal = Number(req.body?.idPrincipal);
    const idDuplicado = Number(req.body?.idDuplicado);

    if (!idPrincipal || !idDuplicado || idPrincipal === idDuplicado) {
      return res.status(400).json({ error: 'Hacen falta dos locales distintos para fusionar' });
    }

    await enFila(() =>
      enTransaccion(async (cx) => {
        const [principal, duplicado] = [await situacionDeLocal(idPrincipal, cx), await situacionDeLocal(idDuplicado, cx)];
        if (!principal.local) throw new ErrorActo(404, `No existe el local ${idPrincipal}`);
        if (!duplicado.local) throw new ErrorActo(404, `No existe el local ${idDuplicado}`);

        await ponerAlDia(cx, idPrincipal, principal.estado);
        await ponerAlDia(cx, idDuplicado, duplicado.estado);

        // Los datos que el principal no tenga se completan con los del duplicado:
        // la fusión no debería perder información. COALESCE con NULLIF trata la
        // cadena vacía como ausencia, que es como están cargados muchos campos.
        await cx.execute(
          `UPDATE local p
              JOIN local d ON d.id_local = ?
              SET p.cuit             = COALESCE(NULLIF(p.cuit, ''), d.cuit),
                  p.razon_social     = COALESCE(NULLIF(p.razon_social, ''), d.razon_social),
                  p.email_local      = COALESCE(NULLIF(p.email_local, ''), d.email_local),
                  p.telefono_local   = COALESCE(NULLIF(p.telefono_local, ''), d.telefono_local),
                  p.domicilio_fiscal = COALESCE(NULLIF(p.domicilio_fiscal, ''), d.domicilio_fiscal),
                  p.latitud_local    = COALESCE(p.latitud_local, d.latitud_local),
                  p.longitud_local   = COALESCE(p.longitud_local, d.longitud_local)
            WHERE p.id_local = ?`,
          [idDuplicado, idPrincipal],
        );

        await cx.execute('UPDATE tramite SET id_local = ? WHERE id_local = ?', [idPrincipal, idDuplicado]);
        const marca = recortarObservacion(
          `${MARCA_FUSION} ${idPrincipal} (${firmante(req)}, ${hoyISO()}). ${duplicado.local.observaciones ?? ''}`.trim(),
        );
        await cx.execute('UPDATE local SET habilita = 0, observacion = ? WHERE id_local = ?', [marca, idDuplicado]);

        const despues = await situacionDeLocal(idPrincipal, cx);
        await registrarCambio(cx, req, {
          idLocal: idPrincipal,
          anterior: principal.estado,
          nuevo: despues.estado,
          motivo: `Fusión de duplicados: absorbió el local N° ${idDuplicado} (${duplicado.local.nombreLocal}) y sus trámites`,
          accion: 'fusion',
          forzar: true,
        });
        await registrarCambio(cx, req, {
          idLocal: idDuplicado,
          anterior: duplicado.estado,
          nuevo: 'BAJA',
          motivo: `Fusión de duplicados: unificado en el local N° ${idPrincipal}`,
          accion: 'fusion',
          forzar: true,
        });
      }),
    );

    res.json(await localPorId(idPrincipal));
  } catch (e) {
    next(e);
  }
});

/* POST /herramientas/geocodificar  ->  completa las coordenadas faltantes.

   Es el proceso diario de la sección 9.1, disparado a mano desde Herramientas.
   Solo toca los locales SIN coordenada: los que ya la tienen no se recalculan,
   porque una dirección corregida a mano vale más que lo que devuelve el
   geocodificador.

   Si no hay geocodificador configurado (ver backend/geocodificador.js), no
   recorre nada y lo dice: antes "resolvía" casi todo con puntos inventados. */
router.post('/geocodificar', requiereRol('administrativo', 'coordinacion'), async (req, res, next) => {
  try {
    const pendientes = await consultar(
      `SELECT id_local, direccion_local FROM local
        WHERE habilita = 1 AND (latitud_local IS NULL OR longitud_local IS NULL)`,
    );

    if (!geocodificadorConfigurado()) {
      return res.json({ revisados: pendientes.length, resueltos: 0, sinResolver: [], configurado: false });
    }

    let resueltos = 0;
    const sinResolver = [];

    for (const local of pendientes) {
      const geo = await geocodificarDireccion(local.direccionLocal ?? '');
      if (geo.ok) {
        await ejecutar('UPDATE local SET latitud_local = ?, longitud_local = ? WHERE id_local = ?', [
          geo.latitud,
          geo.longitud,
          local.idLocal,
        ]);
        resueltos += 1;
      } else {
        sinResolver.push({ id: local.idLocal, direccion: local.direccionLocal, motivo: geo.motivo });
      }
    }

    res.json({ revisados: pendientes.length, resueltos, sinResolver, configurado: true });
  } catch (e) {
    next(e);
  }
});

/* POST /herramientas/informe-9dj  ->  carga del informe de la prestataria.

   El pliego pide CARGA MANUAL ASISTIDA (sección 9.3): el sistema propone los
   cambios y un agente confirma. Acá llegan las filas YA CONFIRMADAS, así que
   se aplican sin volver a preguntar.

   El contrato informado por la empresa entra con origen INFORME_9DJ, que es lo
   que lo distingue del presentado por el titular: tienen distinto valor
   probatorio (sección 4.6) y el front los muestra con estados distintos.

   TODO O NADA: las filas se validan primero y se aplican en UNA transacción.
   Antes, si fallaba la fila 30 de 40, quedaban 29 aplicadas y no había forma
   de saber cuáles. Un contrato que ya está registrado para ese local (mismo
   número, mismo origen) no se vuelve a cargar: cargar dos veces el mismo
   informe no duplica nada. */
router.post('/informe-9dj', requiereRol('administrativo', 'coordinacion'), async (req, res, next) => {
  try {
    const filas = Array.isArray(req.body?.filas) ? req.body.filas : null;
    if (!filas?.length) return res.status(400).json({ error: 'No llegó ninguna fila del informe' });

    const hoy = hoyISO();
    const errores = [];
    filas.forEach((fila, i) => {
      const n = i + 1;
      if (!esFechaISO(fila.vencimiento)) errores.push(`fila ${n}: el vencimiento no es una fecha válida`);
      else if (fila.vencimiento <= hoy) errores.push(`fila ${n}: el contrato ya está vencido (${fila.vencimiento})`);
      if (!fila.localId && !String(fila.razonSocial ?? '').trim() && !String(fila.direccion ?? '').trim()) {
        errores.push(`fila ${n}: para dar de alta un local hace falta al menos la razón social o la dirección`);
      }
    });
    if (errores.length) {
      return res.status(400).json({ error: `El informe tiene errores, no se aplicó nada. ${errores.slice(0, 5).join('; ')}` });
    }

    const params = await parametros();
    // Las direcciones de las altas se geocodifican antes de abrir la
    // transacción: si algún día el servicio es remoto, no se mantiene la base
    // esperando la red.
    const geos = await Promise.all(filas.map((f) => (f.localId ? null : geocodificarDireccion(f.direccion ?? ''))));

    const resultado = await enFila(() =>
      enTransaccion(async (cx) => {
        const creados = [];
        const actualizados = [];
        const omitidas = [];

        for (const [i, fila] of filas.entries()) {
          let idLocal = Number(fila.localId) || null;
          const numeroContrato = fila.numeroContrato ? String(fila.numeroContrato).trim() : null;

          if (idLocal) {
            const antes = await situacionDeLocal(idLocal, cx);
            if (!antes.local) throw new ErrorActo(400, `fila ${i + 1}: no existe el local N° ${idLocal}`);

            if (numeroContrato) {
              const [ya] = await consultarEn(
                cx,
                `SELECT d.id_tramite FROM documentacion d
                   JOIN tramite t ON t.id_tramite = d.id_tramite
                  WHERE t.id_local = ? AND t.habilita = 1 AND d.numero = ? AND d.origen = 'INFORME_9DJ'
                  LIMIT 1`,
                [idLocal, numeroContrato],
              );
              if (ya) {
                omitidas.push(idLocal);
                continue;
              }
            }

            await ponerAlDia(cx, idLocal, antes.estado);
            const idTramite = await registrarContrato(cx, req, idLocal, fila, numeroContrato, hoy);
            const despues = await situacionDeLocal(idLocal, cx);
            await registrarCambio(cx, req, {
              idLocal,
              anterior: antes.estado,
              nuevo: despues.estado,
              motivo: `Contrato ${numeroContrato ?? 's/n'} informado por la empresa 9 de Julio, vence el ${fila.vencimiento}`,
              accion: 'informe-9dj',
              idTramite,
            });
            actualizados.push(idLocal);
          } else {
            // Alta desde el informe. Lleva prefijo CON en el id original, igual
            // que en el sistema viejo, para saber de dónde salió la ficha.
            const geo = geos[i];
            const [alta] = await cx.execute(
              `INSERT INTO local
                 (cuit, id_original, id_rubro, id_estado, razon_social, nombre_local, direccion_local,
                  latitud_local, longitud_local, observacion, bloqueado, habilita)
               VALUES (?, NULL, 1, ?, ?, ?, ?, ?, ?, 'Creado desde el informe de la prestataria.', 0, 1)`,
              [
                fila.cuit || null,
                ID_ESTADO.REVISION_DATOS,
                fila.razonSocial || null,
                fila.razonSocial || 'SIN NOMBRE',
                fila.direccion ?? '',
                geo?.ok ? geo.latitud : null,
                geo?.ok ? geo.longitud : null,
              ],
            );
            idLocal = alta.insertId;
            await cx.execute('UPDATE local SET id_original = ? WHERE id_local = ?', [
              `CON-${String(idLocal).padStart(4, '0')}`,
              idLocal,
            ]);
            await registrarContrato(cx, req, idLocal, fila, numeroContrato, hoy);
            await registrarAlta(cx, req, idLocal, 'Alta desde el informe de la empresa 9 de Julio', 'informe-9dj');
            creados.push(idLocal);
          }
        }

        return { creados, actualizados, omitidas };
      }),
    );

    res.json({
      aplicadas: resultado.creados.length + resultado.actualizados.length,
      ...resultado,
      // Se devuelve para que la pantalla pueda mostrar con qué regla se calculó.
      modoBisiesto: params.modoBisiesto,
    });
  } catch (e) {
    next(e);
  }
});

/* El contrato de una fila del informe: el trámite y su fila de documentación. */
async function registrarContrato(cx, req, idLocal, fila, numeroContrato, hoy) {
  const [ciclo] = await consultarEn(
    cx,
    'SELECT COALESCE(MAX(nro_ciclo), 1) AS ciclo FROM tramite WHERE id_local = ? AND habilita = 1',
    [idLocal],
  );
  const idTramite = await insertarTramite(cx, {
    idLocal,
    idEstado: ID_ESTADO.DOC_VIGENTE,
    idTtramite: ID_TTRAMITE.PRESENTACION_DOCUMENTACION,
    idUsuario: req.usuario?.id ?? null,
    nroCiclo: Number(ciclo?.ciclo) || 1,
    fechaInicio: hoy,
    fechaVencimiento: fila.vencimiento,
    observaciones: 'Informado por la empresa 9 de Julio.',
  });
  await cx.execute(
    `INSERT INTO documentacion
       (id_tramite, id_tdocumentacion, numero, origen, fecha_emision, fecha_vencimiento, habilita)
     VALUES (?, ?, ?, 'INFORME_9DJ', ?, ?, 1)`,
    [idTramite, ID_TDOC.CONTRATO, numeroContrato, hoy, fila.vencimiento],
  );
  return idTramite;
}

/* POST /herramientas/recalcular-estados  ->  corre ahora la recorrida diaria.

   Es la misma tarea que corre sola todas las noches (backend/tareas-programadas.js):
   anota en la auditoría, como "Sistema", los locales que cambiaron de estado
   por el paso del tiempo. Sirve para no esperar a la noche después de correr
   sql/05-tabla-auditoria.sql por primera vez. */
router.post('/recalcular-estados', requiereRol('coordinacion', 'direccion'), async (_req, res, next) => {
  try {
    res.json(await registrarPasoDelTiempo());
  } catch (e) {
    next(e);
  }
});

export default router;
