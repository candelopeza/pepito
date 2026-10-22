/* ============================================================================
   backend/rutas/locales.js  —  EL PADRÓN
   ----------------------------------------------------------------------------
   Reemplaza estas funciones de src/datos/DatosProvider.jsx:

     localesConEstado / localPorId   ->  GET    /locales, GET /locales/:id
     auditoriaDeLocal                ->  GET    /locales/:id/auditoria
     solicitudesProrroga             ->  GET    /locales/solicitudes-prorroga
     guardarLocal (alta)             ->  POST   /locales
     guardarLocal (edición)          ->  PUT    /locales/:id
     eliminarLocal                   ->  DELETE /locales/:id
     bloquearLocal                   ->  POST   /locales/:id/bloqueo
     desbloquearLocal                ->  DELETE /locales/:id/bloqueo

   EL ESTADO sale de estadoDeLocal() (ver backend/mapeo.js): se compone de lo
   que hay guardado en `local.id_estado` y en el último trámite del circuito.

   LA BAJA ES LÓGICA. DELETE no borra la fila: pone habilita = 0. En una base
   con 2.220 locales y trámites administrativos colgando de cada uno, un DELETE
   real se lleva puesto el historial que respalda una intimación.

   Las escrituras pasan por backend/actos.js: si un cambio mueve el estado del
   local (completar el CUIT destraba la segunda notificación, por ejemplo),
   queda anotado en la auditoría con quién lo hizo.
   ============================================================================ */

import { Router } from 'express';
import { consultar, enTransaccion } from '../conexion-bd.js';
import { localPorId, localesConEstado, recortarObservacion, tramitesDeLocal } from '../consultas.js';
import { estadoDeLocal, ID_ESTADO } from '../mapeo.js';
import { requiereRol } from '../middlewares/usuario.js';
import { geocodificarDireccion } from '../geocodificador.js';
import { ErrorActo, ejecutarActo, registrarAlta } from '../actos.js';
import { historialDeLocal, registrarCambio, solicitudesDeProrrogaPendientes } from '../auditoria.js';
import { tiene } from '../capacidades.js';

const router = Router();

/* El front manda el rubro como texto ('GASTRONOMIA'); la base guarda id_rubro.
   Si el rubro no existe en el catálogo se usa SIN INFORMAR (id 1) en vez de
   fallar: el padrón no se puede frenar porque falte una fila de catálogo. */
async function idDeRubro(nombreRubro) {
  if (!nombreRubro) return 1;
  const [fila] = await consultar(
    'SELECT id_rubro FROM rubro WHERE nombre_rubro = ? AND habilita = 1',
    [String(nombreRubro).trim().toUpperCase()],
  );
  return fila?.idRubro ?? 1;
}

/* GET /locales  ->  el padrón completo con el estado de cada local */
router.get('/', async (_req, res, next) => {
  try {
    res.json(await localesConEstado());
  } catch (e) {
    next(e);
  }
});

/* GET /locales/solicitudes-prorroga  ->  lo que pidieron los titulares por el
   portal y coordinación no resolvió todavía. Va ANTES que /:id: si no, Express
   tomaría "solicitudes-prorroga" como el número de un local. Lista vacía si la
   base no tiene la tabla auditoria. */
router.get('/solicitudes-prorroga', async (_req, res, next) => {
  try {
    res.json(await solicitudesDeProrrogaPendientes());
  } catch (e) {
    next(e);
  }
});

/* GET /locales/:id/auditoria  ->  el historial de cambios de estado.
   Va antes que /:id por claridad; Express igual las distingue por la cantidad
   de segmentos. Lista vacía si la base no tiene la tabla auditoria. */
router.get('/:id/auditoria', async (req, res, next) => {
  try {
    res.json(await historialDeLocal(Number(req.params.id)));
  } catch (e) {
    next(e);
  }
});

/* GET /locales/:id  ->  la ficha: el local, su estado, sus actuaciones y sus
   relevamientos. Es lo que consume pages/LocalFicha.jsx. */
router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const local = await localPorId(id);
    if (!local) return res.status(404).json({ error: 'Local no encontrado' });

    const actuaciones = await tramitesDeLocal(id);

    res.json({
      ...local,
      estado: estadoDeLocal(local, actuaciones),
      // El front separa el relevamiento de campo del resto de las actuaciones:
      // son la misma tabla en la base, pero pantallas distintas.
      actuaciones: actuaciones.filter((a) => a.tipo !== 'RELEVAMIENTO'),
      relevamientos: actuaciones.filter((a) => a.tipo === 'RELEVAMIENTO'),
    });
  } catch (e) {
    next(e);
  }
});

/* POST /locales  ->  alta manual (guardarLocal sin id).

   La COORDENADA no se recibe del cliente: se obtiene geocodificando la
   dirección declarada, que es la única fuente válida (sección 9.2). Si el
   front pudiera mandarla, un dato de GPS del celular del relevador terminaría
   guardado como ubicación oficial del establecimiento. */
router.post('/', requiereRol('administrativo', 'coordinacion'), async (req, res, next) => {
  try {
    const datos = req.body ?? {};
    if (!datos.nombreLocal?.trim() || !datos.direccion?.trim()) {
      return res.status(400).json({ error: 'El nombre del local y la dirección son obligatorios' });
    }

    const geo = await geocodificarDireccion(datos.direccion);
    const idRubro = await idDeRubro(datos.rubro);

    const idLocal = await enTransaccion(async (cx) => {
      const [resultado] = await cx.execute(
        `INSERT INTO local
           (cuit, id_original, id_usuario, id_rubro, id_estado, razon_social, nombre_local,
            direccion_local, domicilio_fiscal, latitud_local, longitud_local,
            email_local, telefono_local, observacion, bloqueado, habilita)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
        [
          datos.cuit || null,
          datos.idLegacy || null,
          req.usuario?.id ?? null,
          idRubro,
          ID_ESTADO.REVISION_DATOS,
          datos.razonSocial || null,
          datos.nombreLocal.trim(),
          datos.direccion.trim(),
          datos.domicilioFiscal || null,
          geo.ok ? geo.latitud : null,
          geo.ok ? geo.longitud : null,
          datos.email || null,
          datos.telefono || null,
          datos.observaciones ? recortarObservacion(datos.observaciones) : null,
        ],
      );
      // El CUIL del titular habilitado (portal), solo si la base tiene la
      // columna: sql/11-titular-cuil.sql.
      if (tiene('titularCuil') && datos.titularCuil?.trim()) {
        await cx.execute('UPDATE local SET titular_cuil = ? WHERE id_local = ?', [datos.titularCuil.trim(), resultado.insertId]);
      }
      await registrarAlta(cx, req, resultado.insertId, 'Alta manual en el padrón', 'alta-local');
      return resultado.insertId;
    });

    // `ubicacion` le dice a la pantalla si la dirección se encontró en el mapa.
    res.status(201).json({ ...(await localPorId(idLocal)), ubicacion: { ok: geo.ok, motivo: geo.motivo ?? null } });
  } catch (e) {
    next(e);
  }
});

/* PUT /locales/:id  ->  edición.

   Solo se tocan los campos que vinieron en el body: un PUT con tres campos no
   puede vaciar los otros quince. La dirección, si cambió, se vuelve a
   geocodificar: la coordenada vieja era la de la dirección vieja. */
router.put('/:id', requiereRol('administrativo', 'coordinacion'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const actual = await localPorId(id);
    if (!actual) return res.status(404).json({ error: 'Local no encontrado' });

    const datos = req.body ?? {};
    const campos = [];
    const valores = [];
    // Cada dato que cambia, con lo que decía y lo que dice ahora: va al historial.
    const cambiados = [];

    const asignar = (columna, valor, etiqueta, viejo, nuevo) => {
      campos.push(`${columna} = ?`);
      valores.push(valor);
      if (etiqueta) cambiados.push({ etiqueta, viejo, nuevo });
    };

    const distinto = (nuevo, viejo) => nuevo !== undefined && String(nuevo ?? '') !== String(viejo ?? '');
    const cambio = (campo, columna, etiqueta, valor = (v) => v || null) => {
      if (distinto(datos[campo], actual[campo])) asignar(columna, valor(datos[campo]), etiqueta, actual[campo], datos[campo]);
    };

    cambio('cuit', 'cuit', 'CUIT');
    cambio('razonSocial', 'razon_social', 'razón social');
    cambio('nombreLocal', 'nombre_local', 'nombre', (v) => v);
    cambio('domicilioFiscal', 'domicilio_fiscal', 'domicilio fiscal');
    cambio('email', 'email_local', 'correo');
    cambio('telefono', 'telefono_local', 'teléfono');
    // Sin la columna (sql/11) el dato no tiene dónde guardarse: se ignora.
    if (tiene('titularCuil')) cambio('titularCuil', 'titular_cuil', 'CUIL del titular habilitado');
    cambio('observaciones', 'observacion', 'observaciones del padrón', (v) => (v ? recortarObservacion(v) : null));
    if (distinto(datos.rubro, actual.rubro)) {
      asignar('id_rubro', await idDeRubro(datos.rubro), 'rubro', actual.rubro, datos.rubro);
    }

    let ubicacion;
    if (distinto(datos.direccion, actual.direccion)) {
      const geo = await geocodificarDireccion(datos.direccion);
      ubicacion = { ok: geo.ok, motivo: geo.motivo ?? null };
      asignar('direccion_local', datos.direccion, 'dirección', actual.direccion, datos.direccion);
      asignar('latitud_local', geo.ok ? geo.latitud : null);
      asignar('longitud_local', geo.ok ? geo.longitud : null);
    }

    if (!campos.length) return res.json(actual);

    /* EL HISTORIAL DE LA EDICIÓN. Una línea por dato cambiado, con lo que
       decía y lo que dice ahora: el CUIT y la razón social identifican al
       titular en la cédula, y tiene que poder reconstruirse qué figuraba en
       cada momento. Se anota aunque el estado del local no cambie (antes solo
       quedaba si cambiaba, y sin los valores). Sin la tabla `auditoria`
       (sql/05), no se anota nada y la edición se hace igual. */
    const corto = (v) => {
      const t = String(v ?? '').trim();
      if (!t) return '(vacío)';
      return t.length > 95 ? `${t.slice(0, 94)}…` : t;
    };

    await ejecutarActo(req, {
      idLocal: id,
      nombre: 'editar-local',
      motivo: `Edición del padrón: ${cambiados.map((c) => c.etiqueta).join(', ')}`,
      trabajo: async (cx, antes) => {
        await cx.execute(`UPDATE local SET ${campos.join(', ')} WHERE id_local = ?`, [...valores, id]);
        for (const c of cambiados) {
          await registrarCambio(cx, req, {
            idLocal: id,
            anterior: antes.estado,
            nuevo: antes.estado,
            motivo: `Padrón · ${c.etiqueta}: decía "${corto(c.viejo)}", ahora "${corto(c.nuevo)}"`,
            accion: 'editar-local',
            forzar: true,
          });
        }
        return {};
      },
    });

    // Si cambió la dirección, `ubicacion` dice si se encontró en el mapa.
    res.json({ ...(await localPorId(id)), ...(ubicacion ? { ubicacion } : {}) });
  } catch (e) {
    next(e);
  }
});

/* DELETE /locales/:id  ->  baja lógica del local y de todos sus trámites.

   Los trámites se marcan también: si quedaran habilitados, el local
   desaparecería del padrón pero sus notificaciones seguirían apareciendo en
   las bandejas, colgando de un local que ya no se puede abrir. */
router.delete('/:id', requiereRol('coordinacion'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    await ejecutarActo(req, {
      idLocal: id,
      nombre: 'baja-local',
      motivo: 'Baja del local en el padrón',
      forzarRegistro: true,
      trabajo: async (cx) => {
        await cx.execute('UPDATE local SET habilita = 0 WHERE id_local = ?', [id]);
        await cx.execute('UPDATE tramite SET habilita = 0 WHERE id_local = ?', [id]);
        return {};
      },
    });

    res.json({ ok: true, id });
  } catch (e) {
    next(e);
  }
});

/* POST /locales/:id/bloqueo  ->  bloqueo manual (sección 3.4).

   El local sale del cálculo automático y se congela en el estado que tenía.
   Queda registrado quién lo bloqueó, cuándo y por qué: un bloqueo sin motivo
   es una excepción que nadie puede auditar después. El "cuándo" y el estado
   congelado los guarda la auditoría (la tabla `local` no tiene columna para
   eso); sin auditoría el local vuelve al estado de local.id_estado, como
   antes. */
router.post('/:id/bloqueo', requiereRol('coordinacion'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const motivo = (req.body?.motivo ?? '').trim();
    if (!motivo) return res.status(400).json({ error: 'El bloqueo necesita un motivo' });

    await ejecutarActo(req, {
      idLocal: id,
      accion: 'bloquear',
      controlar: async ({ local }) => (local.bloqueado ? new ErrorActo(409, 'El local ya está bloqueado.') : null),
      motivo: `Bloqueo manual: ${motivo}`,
      forzarRegistro: true,
      trabajo: async (cx) => {
        await cx.execute('UPDATE local SET bloqueado = 1, bloqueado_motivo = ?, id_usuario_bloqueado = ? WHERE id_local = ?', [
          recortarObservacion(motivo),
          req.usuario?.id ?? null,
          id,
        ]);
        return {};
      },
    });

    res.json(await localPorId(id));
  } catch (e) {
    next(e);
  }
});

/* DELETE /locales/:id/bloqueo  ->  levanta el bloqueo y el local vuelve al
   cálculo automático. El motivo del bloqueo se borra del local, pero no se
   pierde: queda en la auditoría junto con el levantamiento. */
router.delete('/:id/bloqueo', requiereRol('coordinacion'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    await ejecutarActo(req, {
      idLocal: id,
      nombre: 'desbloquear',
      controlar: async ({ local }) => (local.bloqueado ? null : new ErrorActo(409, 'El local no está bloqueado.')),
      motivo: (_r, antes) => `Se levantó el bloqueo manual (motivo del bloqueo: ${antes.local.bloqueadoMotivo || '—'})`,
      forzarRegistro: true,
      trabajo: async (cx) => {
        await cx.execute('UPDATE local SET bloqueado = 0, bloqueado_motivo = NULL, id_usuario_bloqueado = NULL WHERE id_local = ?', [id]);
        return {};
      },
    });

    res.json(await localPorId(id));
  } catch (e) {
    next(e);
  }
});

/* POST /locales/:id/cierre   { motivo }   (solo el administrador)

   EL COMERCIO CERRÓ. El local pasa al estado INACTIVO que la base del área ya
   tenía (id_estado 6, "Inactivo / cerrado" en pantalla): sale del padrón, del
   mapa, de las bandejas y de la emisión automática, pero no se borra nada y
   conserva su historial. Es distinto de la baja (DELETE /locales/:id), que es
   para un error de carga y oculta también los trámites. El estado que tenía
   queda en la auditoría (estado_anterior): con eso se lo reabre. */
router.post('/:id/cierre', requiereRol('administrador'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const motivo = (req.body?.motivo ?? '').trim();
    if (!motivo) return res.status(400).json({ error: 'Escribí el motivo: queda en el historial del local' });

    await ejecutarActo(req, {
      idLocal: id,
      accion: 'cerrar-local',
      motivo: `Local cerrado: ${motivo}`,
      forzarRegistro: true,
      trabajo: async (cx) => {
        await cx.execute('UPDATE local SET id_estado = ? WHERE id_local = ?', [ID_ESTADO.LOCAL_INACTIVO, id]);
        return {};
      },
    });

    res.json(await localPorId(id));
  } catch (e) {
    next(e);
  }
});

/* Al reabrir, el local vuelve al estado guardado que tenía. Si tiene trámites
   del circuito, su estado sale de ellos y alcanza con "Revisión de datos"
   (igual que el reingreso). Si no tiene, el estado guardado ES su estado: un
   exento tiene que volver a exento, no entrar al circuito por reabrirlo. */
const ESTADO_GUARDADO_AL_REABRIR = {
  EXENTO_REVISION: ID_ESTADO.EXENTO_PENDIENTE,
  EXENTO_CONFIRMADO: ID_ESTADO.RELEVADO_EXENTO,
  COMPLETAR_DATOS: ID_ESTADO.COMPLETAR_DATOS,
};

/* POST /locales/:id/reapertura   { motivo }   (solo el administrador)

   Se marcó cerrado por error, o el comercio volvió a abrir. El estado anterior
   sale de la auditoría del cierre; si no la hay (un local que ya venía cerrado
   de AppSheet, o una base sin sql/05), vuelve a "Revisión de datos" y desde
   ahí sus trámites deciden. */
router.post('/:id/reapertura', requiereRol('administrador'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const motivo = (req.body?.motivo ?? '').trim();
    if (!motivo) return res.status(400).json({ error: 'Escribí el motivo: queda en el historial del local' });

    let anterior = null;
    if (tiene('auditoria')) {
      const [cierre] = await consultar(
        `SELECT estado_anterior FROM auditoria
          WHERE id_local = ? AND accion = 'cerrar-local' ORDER BY id_auditoria DESC LIMIT 1`,
        [id],
      );
      anterior = cierre?.estadoAnterior ?? null;
    }
    const idEstado = ESTADO_GUARDADO_AL_REABRIR[anterior] ?? ID_ESTADO.REVISION_DATOS;

    await ejecutarActo(req, {
      idLocal: id,
      accion: 'reabrir-local',
      motivo: `Local reabierto: ${motivo}`,
      forzarRegistro: true,
      trabajo: async (cx) => {
        await cx.execute('UPDATE local SET id_estado = ? WHERE id_local = ?', [idEstado, id]);
        return {};
      },
    });

    res.json(await localPorId(id));
  } catch (e) {
    next(e);
  }
});

export default router;
