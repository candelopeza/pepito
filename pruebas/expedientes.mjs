/* ============================================================================
   pruebas/expedientes.mjs  —  LOS DOS EXPEDIENTES
   ----------------------------------------------------------------------------
   Se ejecuta con:  npm run expedientes   (con el backend corriendo en :3000)

   Hay dos tipos de expediente y significan COSAS OPUESTAS: el de trámite
   documenta que el titular presentó (cumple); el de multa, que no cumplió y se
   lo sanciona. Estas pruebas cubren los dos:

     A. el expediente de TRÁMITE es obligatorio al presentar documentación, no
        se autogenera, y las presentaciones históricas llevan la marca "sin
        expediente registrado" en lugar de un número inventado
     B. el expediente de MULTA recorre habilitado → solicitado → generado con
        su bitácora, el titular ve solo lo público, y el reingreso al circuito
        queda reflejado

   Corre contra la API real y LIMPIA lo que crea (baja lógica + restaurar el
   estado del local usado). La parte B necesita un local real en "Generar
   expediente" con dos entregas fehacientes: si no hay ninguno, esa parte se
   salta avisando.
   ============================================================================ */

import { estadoDeLocal, ID_ESTADO } from '../backend/mapeo.js';
import { pool, consultar } from '../backend/conexion-bd.js';

const BASE = process.env.VITE_API_URL ?? 'http://localhost:3000';
const USUARIO = 'Prueba automática expedientes';

let ok = 0;
let fallas = 0;

function verificar(criterio, condicion, detalle = '') {
  if (condicion) {
    ok += 1;
    console.log(`OK   ${criterio}`);
  } else {
    fallas += 1;
    console.log(`FALLA ${criterio}`);
    if (detalle) console.log(`      ${detalle}`);
  }
}

function seccion(titulo) {
  console.log(`\n=== ${titulo} ===`);
}

async function pedir(ruta, { metodo = 'GET', cuerpo, rol = 'coordinacion', nombre = USUARIO } = {}) {
  const r = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      'x-usuario-nombre': encodeURIComponent(nombre),
      'x-usuario-rol': rol,
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { estado: r.status, cuerpo: await r.json().catch(() => null) };
}

/* ===========================================================================
   LA MÁQUINA DE ESTADOS: solicitado se distingue de habilitado
   =========================================================================== */
seccion('Estados: habilitado lo decide el sistema, solicitado una persona');

{
  const base = { id: 1, estadoInicial: 'REVISION_DATOS', bloqueado: false, cuit: '20123456786', razonSocial: 'X', rubro: 'C' };
  const notif2Vencida = {
    id: 1, tipo: 'NOTIFICACION', instancia: 2, idEstado: 13, fecha: '2026-01-10', fechaVencimiento: '2026-01-20',
  };
  const HOY = '2026-06-15';
  const expediente = (idEstado) => ({ id: 2, tipo: 'EXPEDIENTE', idEstado, fecha: '2026-06-01' });

  verificar('sin trámite de expediente: GENERAR_EXPEDIENTE (habilitado)', estadoDeLocal(base, [notif2Vencida], HOY) === 'GENERAR_EXPEDIENTE');
  verificar(
    'con la solicitud registrada: EXPEDIENTE_SOLICITADO, distinguible',
    estadoDeLocal(base, [notif2Vencida, expediente(ID_ESTADO.EXPEDIENTE_SOLICITADO)], HOY) === 'EXPEDIENTE_SOLICITADO',
  );
  verificar('generado: EXPEDIENTE', estadoDeLocal(base, [notif2Vencida, expediente(ID_ESTADO.EXPEDIENTE_GENERADO)], HOY) === 'EXPEDIENTE');
  verificar('en trámite: sigue siendo EXPEDIENTE (el detalle vive en la bitácora)', estadoDeLocal(base, [notif2Vencida, expediente(ID_ESTADO.EXPEDIENTE_EN_TRAMITE)], HOY) === 'EXPEDIENTE');
  verificar('cerrado: EXPEDIENTE (el reingreso es la vía de salida)', estadoDeLocal(base, [notif2Vencida, expediente(ID_ESTADO.EXPEDIENTE_CERRADO)], HOY) === 'EXPEDIENTE');
}

/* ===========================================================================
   PREPARACIÓN
   =========================================================================== */
const salud = await pedir('/salud').catch(() => null);
if (!salud || salud.estado !== 200) {
  console.log(`No se pudo contactar al backend en ${BASE}. Arrancarlo con: cd backend && npm run dev`);
  process.exit(1);
}

/* ===========================================================================
   A. EL EXPEDIENTE DE TRÁMITE: obligatorio, sin inventos
   =========================================================================== */
seccion('A. El expediente de trámite es obligatorio y no se autogenera');

// Un local de prueba, creado por la vía normal (relevamiento).
const rel = await pedir('/relevamientos', {
  metodo: 'POST',
  rol: 'coordinacion',
  cuerpo: {
    nombreLocal: 'LOCAL DE PRUEBA EXPEDIENTES',
    direccionRelevada: 'CALLE DE PRUEBA 998',
    clasificacion: 'GRAN_GENERADOR',
    observaciones: 'prueba automática, se da de baja al final',
  },
});
const idLocal = rel.cuerpo?.localId ?? rel.cuerpo?.id;
if (!idLocal) {
  console.log('No se pudo crear el local de prueba:', JSON.stringify(rel.cuerpo));
  process.exit(1);
}

{
  const sinNumero = await pedir('/documentacion', {
    metodo: 'POST',
    cuerpo: { localId: idLocal, tipo: 'DDJJ', numero: 'DJ-PRUEBA-1', fechaEmision: '2026-10-14' },
  });
  verificar(
    'presentar sin el número de expediente se rechaza explicando de dónde sale',
    sinNumero.estado === 400 && /expediente/.test(sinNumero.cuerpo?.error ?? ''),
    JSON.stringify(sinNumero.cuerpo),
  );

  // La marca "sin expediente registrado" es SOLO para documentos que ya
  // existían: en una carga nueva sería la puerta para saltearse la
  // obligatoriedad (tildar y guardar sin número).
  const conTilde = await pedir('/documentacion', {
    metodo: 'POST',
    cuerpo: { localId: idLocal, tipo: 'DDJJ', numero: 'DJ-PRUEBA-1', fechaEmision: '2026-10-14', sinExpediente: true },
  });
  verificar('la marca "sin expediente" NO sirve para saltearse la obligatoriedad en una carga nueva', conTilde.estado === 400, JSON.stringify(conTilde.cuerpo));

  const conNumero = await pedir('/documentacion', {
    metodo: 'POST',
    cuerpo: { localId: idLocal, tipo: 'DDJJ', numero: 'DJ-PRUEBA-3', fechaEmision: '2026-10-14', expedienteTramite: 'EXP-PRUEBA-777/2026' },
  });
  verificar(
    'con el número del trámite, la presentación entra y el número queda',
    conNumero.estado === 201 && conNumero.cuerpo?.expedienteTramite === 'EXP-PRUEBA-777/2026',
    JSON.stringify(conNumero.cuerpo).slice(0, 150),
  );
}

/* ===========================================================================
   B. EL EXPEDIENTE DE MULTA: solicitar, generar, bitácora, reingreso
   =========================================================================== */
seccion('B. El expediente de multa: habilitado → solicitado → generado');

/* Hace falta un local real habilitado con debido proceso. Se busca; si no hay,
   esta parte se salta (los endpoints igual quedaron probados en A y en los
   estados de arriba). */
const { cuerpo: locales } = await pedir('/locales');
const { cuerpo: actuaciones } = await pedir('/actuaciones');
const entregasDe = (id) =>
  actuaciones.filter((a) => a.localId === id && a.tipo === 'NOTIFICACION' && ['ENTREGADA', 'SIN_FIRMA', 'FIJADA'].includes(a.resultado)).length;
const candidato = locales.find(
  (l) => l.estado === 'GENERAR_EXPEDIENTE' && l.cuit && l.razonSocial && l.rubro !== 'SIN INFORMAR' && entregasDe(l.id) >= 2,
);

if (!candidato) {
  console.log('(no hay ningún local habilitado con debido proceso y datos completos: la parte B se salta)');
} else {
  console.log(`Local de prueba B: ${candidato.nombreLocal} (N° ${candidato.id})`);
  const [estadoPrevio] = await consultar('SELECT id_estado FROM local WHERE id_local = ?', [candidato.id]);
  const idsCreados = [];

  const canalInvalido = await pedir(`/locales/${candidato.id}/expedientes/solicitud`, {
    metodo: 'POST',
    cuerpo: { canal: 'paloma', observaciones: '' },
  });
  verificar('la solicitud exige un canal conocido', canalInvalido.estado === 400);

  const solicitud = await pedir(`/locales/${candidato.id}/expedientes/solicitud`, {
    metodo: 'POST',
    cuerpo: { canal: 'correo', observaciones: 'prueba automática' },
  });
  verificar('la solicitud se registra', solicitud.estado === 201, JSON.stringify(solicitud.cuerpo).slice(0, 150));
  const idExpediente = solicitud.cuerpo?.id;
  if (idExpediente) idsCreados.push(idExpediente);

  const { cuerpo: localSolicitado } = await pedir(`/locales/${candidato.id}`);
  verificar('el local pasa a EXPEDIENTE_SOLICITADO: se sabe que alguien ya pidió', localSolicitado?.estado === 'EXPEDIENTE_SOLICITADO', localSolicitado?.estado);

  const repetida = await pedir(`/locales/${candidato.id}/expedientes/solicitud`, {
    metodo: 'POST',
    cuerpo: { canal: 'correo', observaciones: 'de nuevo' },
  });
  verificar('no se puede solicitar dos veces (el estado ya no lo permite)', repetida.estado === 409, JSON.stringify(repetida.cuerpo));

  // El formato es "número/año" (175079/2026), con el año en curso o el
  // anterior: en enero conviven expedientes de los dos años.
  const anio = Number(new Date().toISOString().slice(0, 4));
  const malFormato = await pedir(`/locales/${candidato.id}/expedientes`, { metodo: 'POST', cuerpo: { numeroManual: 'EXP-175079' } });
  verificar('un número sin el formato número/año se rechaza con el ejemplo a la vista', malFormato.estado === 400 && /número\/año|numero\/anio|175079/.test(malFormato.cuerpo?.error ?? ''), JSON.stringify(malFormato.cuerpo));
  const anioViejo = await pedir(`/locales/${candidato.id}/expedientes`, { metodo: 'POST', cuerpo: { numeroManual: `175079/${anio - 2}` } });
  verificar('un año que no es el actual ni el anterior se rechaza', anioViejo.estado === 400, JSON.stringify(anioViejo.cuerpo));

  // Llega el número: la carga completa EL MISMO expediente.
  const numero = `${900000 + Math.floor(Math.random() * 99999)}/${anio}`;
  const generado = await pedir(`/locales/${candidato.id}/expedientes`, { metodo: 'POST', cuerpo: { numeroManual: numero } });
  verificar('cuando llega el número, la carga completa el mismo expediente', generado.estado === 201 && generado.cuerpo?.id === idExpediente, JSON.stringify(generado.cuerpo).slice(0, 120));
  verificar('con el número puesto', generado.cuerpo?.numeroExpediente === numero);

  // La bitácora, con su visibilidad.
  const interna = await pedir(`/expedientes/${idExpediente}/novedades`, {
    metodo: 'POST',
    cuerpo: { detalle: 'Observación interna de la oficina (prueba).', publica: false },
  });
  const publica = await pedir(`/expedientes/${idExpediente}/novedades`, {
    metodo: 'POST',
    cuerpo: { detalle: 'El expediente avanza en la dependencia (prueba).', publica: true, nuevoEstado: 'EN_TRAMITE' },
  });
  verificar('la novedad interna se registra', interna.estado === 201);
  verificar('la novedad pública con cambio a «en trámite» también', publica.estado === 201);

  const sinDetalle = await pedir(`/expedientes/${idExpediente}/novedades`, { metodo: 'POST', cuerpo: { detalle: '' } });
  verificar('una novedad sin detalle no entra: sería un cuaderno de notas', sinDetalle.estado === 400);

  const { cuerpo: deOficina } = await pedir('/expedientes/novedades');
  const misNovedades = (deOficina ?? []).filter((n) => n.idTramite === idExpediente);
  verificar('la oficina ve toda la bitácora, con autor', misNovedades.length >= 4 && misNovedades.every((n) => 'usuario' in n), `novedades: ${misNovedades.length}`);

  const { cuerpo: deTitular } = await pedir('/expedientes/novedades', { rol: 'titular', nombre: 'Titular de prueba' });
  const vistasPorTitular = (deTitular ?? []).filter((n) => n.idTramite === idExpediente);
  verificar(
    'el titular ve SOLO las públicas y sin quién hizo cada movimiento',
    vistasPorTitular.length > 0 && vistasPorTitular.every((n) => n.publica && !('usuario' in n)) &&
      !vistasPorTitular.some((n) => /interna/i.test(n.detalle)),
    JSON.stringify(vistasPorTitular).slice(0, 200),
  );

  seccion('El número guardado no se edita: se corrige, con motivo y bitácora');
  {
    const numeroNuevo = `${900000 + Math.floor(Math.random() * 99999)}/${anio}`;
    const sinMotivo = await pedir(`/expedientes/${idExpediente}/numero`, { metodo: 'PUT', cuerpo: { numero: numeroNuevo } });
    verificar('corregir sin motivo se rechaza', sinMotivo.estado === 400, JSON.stringify(sinMotivo.cuerpo));

    // El numero de OTRO expediente no se puede usar: es el error mas caro.
    const { cuerpo: otros } = await pedir('/actuaciones');
    const ajeno = otros.find((a) => a.tipo === 'EXPEDIENTE' && a.id !== idExpediente && /^\d+\/\d{4}$/.test(a.numeroExpediente ?? ''));
    if (ajeno) {
      const duplicado = await pedir(`/expedientes/${idExpediente}/numero`, {
        metodo: 'PUT',
        cuerpo: { numero: ajeno.numeroExpediente, motivo: 'prueba de duplicado' },
      });
      verificar('el número de OTRO comercio se rechaza (el error más caro)', duplicado.estado === 409, JSON.stringify(duplicado.cuerpo));
    }

    const corregido = await pedir(`/expedientes/${idExpediente}/numero`, {
      metodo: 'PUT',
      cuerpo: { numero: numeroNuevo, motivo: 'Error de tipeo en un dígito (prueba automática).' },
    });
    verificar('con motivo, la corrección entra', corregido.estado === 200 && corregido.cuerpo?.numeroExpediente === numeroNuevo, JSON.stringify(corregido.cuerpo).slice(0, 120));

    const { cuerpo: bitacora } = await pedir('/expedientes/novedades');
    const delCambio = (bitacora ?? []).filter((n) => n.idTramite === idExpediente && /corrigió|corrigio/i.test(n.detalle));
    verificar(
      'y la bitácora asienta el número anterior, el nuevo y el motivo, como interna',
      delCambio.length === 1 && delCambio[0].detalle.includes(numero) && delCambio[0].detalle.includes(numeroNuevo) && !delCambio[0].publica,
      JSON.stringify(delCambio).slice(0, 200),
    );
  }

  // El reingreso queda reflejado en la bitácora.
  const reingreso = await pedir(`/locales/${candidato.id}/reingreso`, { metodo: 'POST', cuerpo: { motivo: 'Prueba automática: se revierte enseguida.' } });
  verificar('coordinación reingresa el local al circuito', reingreso.estado === 200, JSON.stringify(reingreso.cuerpo).slice(0, 120));

  const { cuerpo: trasReingreso } = await pedir('/expedientes/novedades');
  const delReingreso = (trasReingreso ?? []).filter((n) => n.idTramite === idExpediente && /devolvi|reingres/i.test(n.detalle));
  verificar('y la bitácora explica por qué hay expediente Y notificación en curso a la vez', delReingreso.length === 1 && delReingreso[0].publica, JSON.stringify(delReingreso).slice(0, 200));

  /* ---- limpieza: la prueba deshace lo que tocó del padrón real ---- */
  await consultar(
    `UPDATE tramite SET habilita = 0
      WHERE id_local = ? AND habilita = 1 AND (id_tramite = ? OR fecha_inicio >= CURDATE())
        AND id_ttramite IN (7, 3)`,
    [candidato.id, idExpediente ?? 0],
  );
  await consultar('UPDATE expediente_novedad SET habilita = 0 WHERE id_tramite = ?', [idExpediente ?? 0]);
  await consultar('UPDATE tramite SET fecha_cierre = NULL WHERE id_tramite = ?', [idExpediente ?? 0]);
  await consultar('UPDATE local SET id_estado = ? WHERE id_local = ?', [estadoPrevio.idEstado, candidato.id]);
  const { cuerpo: restaurado } = await pedir(`/locales/${candidato.id}`);
  verificar('limpieza: el local volvió a su estado anterior', restaurado?.estado === candidato.estado, `quedó ${restaurado?.estado}, era ${candidato.estado}`);
}

seccion('La bandeja del tablero y la vista de Expedientes cuentan lo mismo');
{
  const { bandejas, conEstado } = await import('../src/datos/vistas.js');
  const { cuerpo: locales } = await pedir('/locales');
  const { cuerpo: actuacionesTodas } = await pedir('/actuaciones');
  const todos = conEstado({ locales, actuaciones: actuacionesTodas, solicitudesProrroga: [] });
  const bandeja = bandejas(todos, 'coordinacion').find((b) => b.id === 'expedientes-generar');
  const vista = todos.filter((l) => l.estado === 'GENERAR_EXPEDIENTE');
  verificar(
    'mismo criterio, mismo número: nadie tiene que decidir a cuál creerle',
    bandeja && bandeja.locales.length === vista.length,
    `bandeja: ${bandeja?.locales?.length} · vista: ${vista.length}`,
  );
}

/* ---- limpieza de la parte A ---- */
await consultar('UPDATE documentacion d JOIN tramite t ON t.id_tramite = d.id_tramite SET d.habilita = 0 WHERE t.id_local = ?', [idLocal]);
await consultar('UPDATE tramite SET habilita = 0 WHERE id_local = ?', [idLocal]);
await consultar('UPDATE local SET habilita = 0 WHERE id_local = ?', [idLocal]);
console.log(`limpieza: el local de prueba ${idLocal} quedó dado de baja`);
await pool.end();

console.log(`\n${ok} criterio(s) cumplidos · ${fallas} falla(s)`);
process.exit(fallas ? 1 : 0);
