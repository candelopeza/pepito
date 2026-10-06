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
import { historialDeLocal, solicitudesDeProrrogaPendientes } from '../auditoria.js';

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
      await registrarAlta(cx, req, resultado.insertId, 'Alta manual en el padrón', 'alta-local');
      return resultado.insertId;
    });

    res.status(201).json(await localPorId(idLocal));
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
    const cambiados = [];

    const asignar = (columna, valor, etiqueta) => {
      campos.push(`${columna} = ?`);
      valores.push(valor);
      if (etiqueta) cambiados.push(etiqueta);
    };

    const distinto = (nuevo, viejo) => nuevo !== undefined && String(nuevo ?? '') !== String(viejo ?? '');

    if (distinto(datos.cuit, actual.cuit)) asignar('cuit', datos.cuit || null, 'CUIT');
    if (distinto(datos.razonSocial, actual.razonSocial)) asignar('razon_social', datos.razonSocial || null, 'razón social');
    if (distinto(datos.nombreLocal, actual.nombreLocal)) asignar('nombre_local', datos.nombreLocal, 'nombre');
    if (distinto(datos.domicilioFiscal, actual.domicilioFiscal)) asignar('domicilio_fiscal', datos.domicilioFiscal || null, 'domicilio fiscal');
    if (distinto(datos.email, actual.email)) asignar('email_local', datos.email || null, 'correo');
    if (distinto(datos.telefono, actual.telefono)) asignar('telefono_local', datos.telefono || null, 'teléfono');
    if (distinto(datos.observaciones, actual.observaciones)) {
      asignar('observacion', datos.observaciones ? recortarObservacion(datos.observaciones) : null, 'observaciones');
    }
    if (distinto(datos.rubro, actual.rubro)) asignar('id_rubro', await idDeRubro(datos.rubro), 'rubro');

    if (distinto(datos.direccion, actual.direccion)) {
      const geo = await geocodificarDireccion(datos.direccion);
      asignar('direccion_local', datos.direccion, 'dirección');
      asignar('latitud_local', geo.ok ? geo.latitud : null);
      asignar('longitud_local', geo.ok ? geo.longitud : null);
    }

    if (!campos.length) return res.json(actual);

    await ejecutarActo(req, {
      idLocal: id,
      nombre: 'editar-local',
      motivo: `Edición del padrón: ${cambiados.join(', ')}`,
      trabajo: async (cx) => {
        await cx.execute(`UPDATE local SET ${campos.join(', ')} WHERE id_local = ?`, [...valores, id]);
        return {};
      },
    });

    res.json(await localPorId(id));
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

export default router;
