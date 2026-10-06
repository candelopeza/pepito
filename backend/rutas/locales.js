/* ============================================================================
   backend/rutas/locales.js  —  EL PADRÓN
   ----------------------------------------------------------------------------
   Reemplaza estas funciones de src/datos/DatosProvider.jsx:

     localesConEstado / localPorId   ->  GET    /locales, GET /locales/:id
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
   ============================================================================ */

import { Router } from 'express';
import { consultar, ejecutar, enTransaccion } from '../conexion-bd.js';
import {
  localPorId,
  localesConEstado,
  tramitesDeLocal,
} from '../consultas.js';
import { estadoDeLocal, ID_ESTADO } from '../mapeo.js';
import { requiereRol } from '../middlewares/usuario.js';
import { geocodificar } from '../geocodificador.js';

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

/* GET /locales/:id  ->  la ficha: el local, su estado, sus actuaciones y su
   historial de auditoría. Es lo que consume pages/LocalFicha.jsx. */
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
router.post('/', requiereRol('administrativo', 'coordinacion', 'direccion'), async (req, res, next) => {
  try {
    const datos = req.body ?? {};
    if (!datos.nombreLocal?.trim() || !datos.direccion?.trim()) {
      return res.status(400).json({ error: 'El nombre del local y la dirección son obligatorios' });
    }

    const geo = await geocodificar(datos.direccion);
    const idRubro = await idDeRubro(datos.rubro);

    const idLocal = await enTransaccion(async (cx) => {
      const [resultado] = await cx.execute(
        `INSERT INTO local
           (cuit, id_original, id_usuario, id_rubro, id_estado, razon_social, nombre_local,
            direccion_local, domicilio_fiscal, latitud_local, longitud_local,
            email_local, telefono_local, observacion, bloqueado, habilita)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
        [
          datos.cuit ?? null,
          datos.idLegacy ?? null,
          idRubro,
          ID_ESTADO.REVISION_DATOS,
          datos.razonSocial ?? null,
          datos.nombreLocal.trim(),
          datos.direccion.trim(),
          datos.domicilioFiscal ?? null,
          geo.ok ? geo.latitud : null,
          geo.ok ? geo.longitud : null,
          datos.email ?? null,
          datos.telefono ?? null,
          datos.observaciones ?? null,
        ],
      );
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
   geocodificar. */
router.put('/:id', requiereRol('administrativo', 'coordinacion', 'direccion'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const actual = await localPorId(id);
    if (!actual) return res.status(404).json({ error: 'Local no encontrado' });

    const datos = req.body ?? {};
    const campos = [];
    const valores = [];

    const asignar = (columna, valor) => {
      campos.push(`${columna} = ?`);
      valores.push(valor);
    };

    if (datos.cuit !== undefined) asignar('cuit', datos.cuit || null);
    if (datos.razonSocial !== undefined) asignar('razon_social', datos.razonSocial || null);
    if (datos.nombreLocal !== undefined) asignar('nombre_local', datos.nombreLocal);
    if (datos.domicilioFiscal !== undefined) asignar('domicilio_fiscal', datos.domicilioFiscal || null);
    if (datos.email !== undefined) asignar('email_local', datos.email || null);
    if (datos.telefono !== undefined) asignar('telefono_local', datos.telefono || null);
    if (datos.observaciones !== undefined) asignar('observacion', datos.observaciones || null);
    if (datos.rubro !== undefined) asignar('id_rubro', await idDeRubro(datos.rubro));

    if (datos.direccion !== undefined && datos.direccion !== actual.direccion) {
      const geo = await geocodificar(datos.direccion);
      asignar('direccion_local', datos.direccion);
      asignar('latitud_local', geo.ok ? geo.latitud : null);
      asignar('longitud_local', geo.ok ? geo.longitud : null);
    }

    if (!campos.length) return res.json(actual);

    valores.push(id);
    await ejecutar(`UPDATE local SET ${campos.join(', ')} WHERE id_local = ?`, valores);

    res.json(await localPorId(id));
  } catch (e) {
    next(e);
  }
});

/* DELETE /locales/:id  ->  baja lógica del local y de todos sus trámites.

   Los trámites se marcan también: si quedaran habilitados, el local
   desaparecería del padrón pero sus notificaciones seguirían apareciendo en
   las bandejas, colgando de un local que ya no se puede abrir. */
router.delete('/:id', requiereRol('coordinacion', 'direccion'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const local = await localPorId(id);
    if (!local) return res.status(404).json({ error: 'Local no encontrado' });

    await enTransaccion(async (cx) => {
      await cx.execute('UPDATE local SET habilita = 0 WHERE id_local = ?', [id]);
      await cx.execute('UPDATE tramite SET habilita = 0 WHERE id_local = ?', [id]);
    });

    res.json({ ok: true, id });
  } catch (e) {
    next(e);
  }
});

/* POST /locales/:id/bloqueo  ->  bloqueo manual (sección 3.4).

   El local sale del cálculo automático y se congela en el estado que tenía.
   Queda registrado quién lo bloqueó y por qué: un bloqueo sin motivo es una
   excepción que nadie puede auditar después. */
router.post('/:id/bloqueo', requiereRol('coordinacion', 'direccion'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const motivo = (req.body?.motivo ?? '').trim();
    if (!motivo) return res.status(400).json({ error: 'El bloqueo necesita un motivo' });

    const local = await localPorId(id);
    if (!local) return res.status(404).json({ error: 'Local no encontrado' });

    await ejecutar('UPDATE local SET bloqueado = 1, bloqueado_motivo = ?, id_usuario_bloqueado = ? WHERE id_local = ?', [
      motivo,
      req.usuario?.id ?? null,
      id,
    ]);

    res.json(await localPorId(id));
  } catch (e) {
    next(e);
  }
});

/* DELETE /locales/:id/bloqueo  ->  levanta el bloqueo y el local vuelve al
   cálculo automático. */
router.delete('/:id/bloqueo', requiereRol('coordinacion', 'direccion'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const local = await localPorId(id);
    if (!local) return res.status(404).json({ error: 'Local no encontrado' });

    await ejecutar('UPDATE local SET bloqueado = 0, bloqueado_motivo = NULL, id_usuario_bloqueado = NULL WHERE id_local = ?', [id]);

    res.json(await localPorId(id));
  } catch (e) {
    next(e);
  }
});

export default router;
