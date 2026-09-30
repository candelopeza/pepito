/* ============================================================================
   backend/rutas/herramientas.js  —  DUPLICADOS, GEOCODIFICACIÓN, INFORME 9DJ
   ----------------------------------------------------------------------------
   Reemplaza estas funciones de src/datos/DatosProvider.jsx:

     fusiones (lista)          ->  GET  /herramientas/fusiones
     fusionarLocales           ->  POST /herramientas/fusiones   { idPrincipal, idDuplicado }
     geocodificarPendientes    ->  POST /herramientas/geocodificar
     aplicarInforme9DJ         ->  POST /herramientas/informe-9dj  { filas: [...] }

   La DETECCIÓN de duplicados sigue corriendo en el front (src/dominio/
   duplicados.js) sobre la lista de locales: es solo lectura y no necesita
   base. Lo que está acá es la fusión, que sí escribe.

   NO HAY endpoint de auditoría: no existe una tabla de auditoría. El historial
   de un local es su lista de trámites, que ya trae GET /locales/:id.
   ============================================================================ */

import { Router } from 'express';
import { consultar, ejecutar, enTransaccion } from '../conexion-bd.js';
import {
  cicloActual,
  insertarTramite,
  localPorId,
  parametros,
  recortarObservacion,
} from '../consultas.js';
import { ID_ESTADO, ID_TDOC, ID_TTRAMITE } from '../mapeo.js';
import { requiereRol, firmante } from '../middlewares/usuario.js';
import { geocodificar } from '../../src/dominio/geo.js';
import { hoyISO } from '../../src/dominio/fechas.js';

const router = Router();

/* La marca que queda en `local.observacion` del duplicado. Es un prefijo fijo
   para poder buscarlo después con LIKE.

   >>> POR QUÉ EN UN CAMPO DE TEXTO <<<
   Lo correcto sería una columna `local.id_fusionado_en`, que se decidió no
   agregar por ahora. Mientras tanto la marca va en la observación: el dato
   queda visible para cualquiera que abra la ficha, que es lo que más importa.
   Si algún día se agrega la columna, esto se migra con un UPDATE. */
const MARCA_FUSION = 'FUSIONADO EN LOCAL';

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
router.post('/fusiones', requiereRol('coordinacion', 'direccion'), async (req, res, next) => {
  try {
    const idPrincipal = Number(req.body?.idPrincipal);
    const idDuplicado = Number(req.body?.idDuplicado);

    if (!idPrincipal || !idDuplicado || idPrincipal === idDuplicado) {
      return res.status(400).json({ error: 'Hacen falta dos locales distintos para fusionar' });
    }

    const [principal, duplicado] = await Promise.all([localPorId(idPrincipal), localPorId(idDuplicado)]);
    if (!principal) return res.status(404).json({ error: `No existe el local ${idPrincipal}` });
    if (!duplicado) return res.status(404).json({ error: `No existe el local ${idDuplicado}` });

    await enTransaccion(async (cx) => {
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
        `${MARCA_FUSION} ${idPrincipal} (${firmante(req)}, ${hoyISO()}). ${duplicado.observaciones ?? ''}`.trim(),
      );
      await cx.execute('UPDATE local SET habilita = 0, observacion = ? WHERE id_local = ?', [marca, idDuplicado]);
    });

    res.json(await localPorId(idPrincipal));
  } catch (e) {
    next(e);
  }
});

/* POST /herramientas/geocodificar  ->  completa las coordenadas faltantes.

   Es el proceso diario de la sección 9.1, disparado a mano desde Herramientas.
   Solo toca los locales SIN coordenada: los que ya la tienen no se recalculan,
   porque una dirección corregida a mano vale más que lo que devuelve el
   geocodificador. */
router.post('/geocodificar', requiereRol('administrativo', 'coordinacion', 'direccion'), async (req, res, next) => {
  try {
    const pendientes = await consultar(
      `SELECT id_local, direccion_local FROM local
        WHERE habilita = 1 AND (latitud_local IS NULL OR longitud_local IS NULL)`,
    );

    let resueltos = 0;
    const sinResolver = [];

    for (const local of pendientes) {
      const geo = geocodificar(local.direccionLocal ?? '');
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

    res.json({ revisados: pendientes.length, resueltos, sinResolver });
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
   probatorio (sección 4.6) y el front los muestra con estados distintos. */
router.post('/informe-9dj', requiereRol('administrativo', 'coordinacion', 'direccion'), async (req, res, next) => {
  try {
    const filas = Array.isArray(req.body?.filas) ? req.body.filas : null;
    if (!filas?.length) return res.status(400).json({ error: 'No llegó ninguna fila del informe' });

    const params = await parametros();
    const hoy = hoyISO();
    const creados = [];
    const actualizados = [];

    for (const fila of filas) {
      let idLocal = Number(fila.localId) || null;

      if (!idLocal) {
        // Alta desde el informe. Lleva prefijo CON en el id original, igual
        // que en el sistema viejo, para saber de dónde salió la ficha.
        const geo = geocodificar(fila.direccion ?? '');
        const resultado = await ejecutar(
          `INSERT INTO local
             (cuit, id_original, id_rubro, id_estado, razon_social, nombre_local, direccion_local,
              latitud_local, longitud_local, observacion, bloqueado, habilita)
           VALUES (?, NULL, 1, ?, ?, ?, ?, ?, ?, 'Creado desde el informe de la prestataria.', 0, 1)`,
          [
            fila.cuit ?? null,
            ID_ESTADO.REVISION_DATOS,
            fila.razonSocial ?? null,
            fila.razonSocial ?? 'SIN NOMBRE',
            fila.direccion ?? '',
            geo.ok ? geo.latitud : null,
            geo.ok ? geo.longitud : null,
          ],
        );
        idLocal = resultado.insertId;
        await ejecutar('UPDATE local SET id_original = ? WHERE id_local = ?', [
          `CON-${String(idLocal).padStart(4, '0')}`,
          idLocal,
        ]);
        creados.push(idLocal);
      } else {
        actualizados.push(idLocal);
      }

      const ciclo = await cicloActual(idLocal);
      await enTransaccion(async (cx) => {
        const idTramite = await insertarTramite(cx, {
          idLocal,
          idEstado: ID_ESTADO.DOC_VIGENTE,
          idTtramite: ID_TTRAMITE.PRESENTACION_DOCUMENTACION,
          idUsuario: req.usuario?.id ?? null,
          nroCiclo: ciclo,
          fechaInicio: hoy,
          fechaVencimiento: fila.vencimiento ?? null,
          observaciones: 'Informado por la empresa 9 de Julio.',
        });
        await cx.execute(
          `INSERT INTO documentacion
             (id_tramite, id_tdocumentacion, numero, origen, fecha_emision, fecha_vencimiento, habilita)
           VALUES (?, ?, ?, 'INFORME_9DJ', ?, ?, 1)`,
          [idTramite, ID_TDOC.CONTRATO, fila.numeroContrato ?? null, hoy, fila.vencimiento ?? null],
        );
      });
    }

    res.json({
      aplicadas: filas.length,
      creados,
      actualizados,
      // Se devuelve para que la pantalla pueda mostrar con qué regla se calculó.
      modoBisiesto: params.modoBisiesto,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
