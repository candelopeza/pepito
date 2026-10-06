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
import { consultar, ejecutar, enTransaccion } from '../conexion-bd.js';
import { enFila, localPorId, recortarObservacion, situacionDeLocal } from '../consultas.js';
import { ID_ESTADO } from '../mapeo.js';
import { requiereRol, firmante } from '../middlewares/usuario.js';
import { geocodificadorConfigurado, geocodificarDireccion } from '../geocodificador.js';
import { LIMITE_ES_OFICIAL, dentroDelMunicipio } from '../limite-municipal.js';
import { ErrorActo } from '../actos.js';
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

/* El informe de la prestataria ya no entra por aca: tiene su modulo propio
   con revision fila por fila en backend/rutas/informe-9dj.js. */

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

/* GET /herramientas/coordenadas-fuera  ->  las ubicaciones sospechosas.

   Locales cuya coordenada guardada NO cae dentro del ejido municipal. El pliego
   pide descartar la que caiga fuera "en lugar de guardarla", pero estas ya
   estaban guardadas cuando llegaron de la importación: borrarlas sin mirar
   sería perder la única ubicación que tienen algunos.

   Se listan para que la oficina las revise. Mientras el límite sea el polígono
   provisorio, además, una coordenada de afuera puede ser un error del polígono:
   por eso se informa `limiteOficial`. */
router.get('/coordenadas-fuera', async (_req, res, next) => {
  try {
    const todos = await consultar(
      `SELECT l.id_local, l.nombre_local, l.direccion_local, l.latitud_local, l.longitud_local, r.nombre_rubro
         FROM local l
         LEFT JOIN rubro r ON r.id_rubro = l.id_rubro
        WHERE l.habilita = 1 AND l.latitud_local IS NOT NULL AND l.longitud_local IS NOT NULL`,
    );

    const fuera = todos
      .filter((l) => !dentroDelMunicipio(Number(l.latitudLocal), Number(l.longitudLocal)))
      .map((l) => ({
        id: l.idLocal,
        nombreLocal: l.nombreLocal,
        direccion: l.direccionLocal,
        rubro: l.nombreRubro,
        latitud: Number(l.latitudLocal),
        longitud: Number(l.longitudLocal),
      }));

    res.json({ total: fuera.length, limiteOficial: LIMITE_ES_OFICIAL, locales: fuera });
  } catch (e) {
    next(e);
  }
});

/* El informe de la prestataria ya no entra por acá: tiene su módulo propio
   con revisión fila por fila en backend/rutas/informe-9dj.js. */

/* ============================================================================
   RECÁLCULO DE COORDENADAS  —  carga manual asistida
   ----------------------------------------------------------------------------
   Para los locales cuya ubicación guardada no se corresponde con su dirección.
   En el padrón real los hay a doce kilómetros de donde dicen estar.

   >>> EL SISTEMA PROPONE, UNA PERSONA CONFIRMA <<<
   Es el mismo criterio que el pliego pide para el informe de la prestataria
   (sección 9.3): "que el sistema muestre una previsualización de los cambios
   que produciría para que un agente confirme antes de aplicar".

   Acá pesa todavía más: una coordenada es la ubicación oficial de un
   establecimiento, alimenta el mapa y el ruteo de los notificadores. Pisar 68
   de una sin que nadie las mire sería cambiar el mismo tipo de dato que se
   quiere arreglar, nada más que en sentido contrario.

   Por eso son DOS endpoints: uno propone sin tocar nada, el otro guarda
   exactamente lo que el agente aprobó.
   ============================================================================ */

/* Cuántos locales se geocodifican por llamada. El geocodificador acepta una
   consulta por segundo, así que un lote de 20 tarda unos 22 segundos: entra
   cómodo en un pedido HTTP y da sensación de avance. */
const LOTE_PROPUESTAS = 20;

/* Distancia en kilómetros entre dos puntos (fórmula del semiverseno).
   Es el dato que le dice al agente cuánto se va a mover el local: una
   corrección de 50 metros es un ajuste, una de 12 km es otro domicilio. */
function distanciaKm(latA, lngA, latB, lngB) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (latB - latA) * rad;
  const dLng = (lngB - lngA) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(latA * rad) * Math.cos(latB * rad) * Math.sin(dLng / 2) ** 2;
  return Number((2 * R * Math.asin(Math.sqrt(a))).toFixed(2));
}

/* POST /herramientas/coordenadas/propuestas   { ids: [1, 2, 3] }

   Geocodifica las direcciones de esos locales y devuelve qué coordenada
   pondría en cada uno. NO GUARDA NADA. */
router.post('/coordenadas/propuestas', requiereRol('administrativo', 'coordinacion', 'direccion'), async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ error: 'Hay que indicar qué locales revisar' });

    const lote = ids.slice(0, LOTE_PROPUESTAS);
    const marcadores = lote.map(() => '?').join(',');
    const locales = await consultar(
      `SELECT id_local, nombre_local, direccion_local, latitud_local, longitud_local
         FROM local WHERE habilita = 1 AND id_local IN (${marcadores})`,
      lote,
    );

    const propuestas = [];
    for (const l of locales) {
      const geo = await geocodificarDireccion(l.direccionLocal ?? '');
      const actual =
        l.latitudLocal !== null && l.longitudLocal !== null
          ? { latitud: Number(l.latitudLocal), longitud: Number(l.longitudLocal) }
          : null;

      propuestas.push({
        id: l.idLocal,
        nombreLocal: l.nombreLocal,
        direccion: l.direccionLocal,
        actual,
        propuesta: geo.ok ? { latitud: geo.latitud, longitud: geo.longitud } : null,
        motivo: geo.ok ? null : geo.motivo,
        distanciaKm: geo.ok && actual ? distanciaKm(actual.latitud, actual.longitud, geo.latitud, geo.longitud) : null,
      });
    }

    res.json({ propuestas, procesados: lote.length, quedan: Math.max(ids.length - lote.length, 0) });
  } catch (e) {
    next(e);
  }
});

/* POST /herramientas/coordenadas/aplicar   { cambios: [{ id, latitud, longitud }] }

   Guarda solo lo que el agente aprobó. Vuelve a validar cada coordenada contra
   el ejido: lo que llega del navegador no se guarda sin revisar, aunque lo haya
   propuesto este mismo sistema un minuto antes. */
router.post('/coordenadas/aplicar', requiereRol('administrativo', 'coordinacion', 'direccion'), async (req, res, next) => {
  try {
    const cambios = Array.isArray(req.body?.cambios) ? req.body.cambios : [];
    if (!cambios.length) return res.status(400).json({ error: 'No llegó ningún cambio para aplicar' });

    const aplicados = [];
    const rechazados = [];

    for (const c of cambios) {
      const id = Number(c.id);
      const lat = Number(c.latitud);
      const lng = Number(c.longitud);

      if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        rechazados.push({ id: c.id, motivo: 'Coordenada mal formada.' });
        continue;
      }
      if (!dentroDelMunicipio(lat, lng)) {
        rechazados.push({ id, motivo: 'La coordenada cae fuera del ejido municipal.' });
        continue;
      }

      const resultado = await ejecutar(
        'UPDATE local SET latitud_local = ?, longitud_local = ? WHERE id_local = ? AND habilita = 1',
        [lat, lng, id],
      );
      if (resultado.affectedRows) aplicados.push(id);
      else rechazados.push({ id, motivo: 'No existe ese local o está dado de baja.' });
    }

    res.json({ aplicados: aplicados.length, rechazados, ids: aplicados });
  } catch (e) {
    next(e);
  }
});

export default router;
