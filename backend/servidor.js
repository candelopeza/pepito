/* ============================================================================
   backend/servidor.js  —  ARRANQUE DEL SERVIDOR
   ----------------------------------------------------------------------------
   Es el único archivo que se ejecuta directo (npm run dev). Hace cuatro cosas:
     1. crea la app de Express y le pone los middlewares generales
     2. monta las rutas, una carpeta por recurso (ver rutas/)
     3. revisa qué partes opcionales tiene la base (capacidades.js) y programa
        la tarea diaria (tareas-programadas.js)
     4. escucha en el puerto que dice el .env

   Los datos de conexión a MariaDB no están acá: están en conexion-bd.js, que
   los lee del .env. Este archivo no sabe qué base hay detrás.
   ============================================================================ */

/* LA HORA DEL SERVIDOR ES LA DE TUCUMÁN. Todos los plazos se calculan con
   "hoy" (hoyISO en src/dominio/fechas.js), que usa la hora local de la
   máquina. Un servidor en UTC daría "mañana" a partir de las 21 h y vencería
   plazos tres horas antes. Se puede pisar con TZ en el .env. */
process.env.TZ = process.env.TZ || 'America/Argentina/Tucuman';

import express from 'express';
import cors from 'cors';
import { identificarUsuario, aceptaRolDeclarado } from './middlewares/usuario.js';
import { problemaDeConexion } from './conexion-bd.js';
import { capacidades, revisarCapacidades, vigilarCapacidades } from './capacidades.js';
import { modoGeocodificador } from './geocodificador.js';
import { estadoTareas, iniciarTareas } from './tareas-programadas.js';
import rutasLocales from './rutas/locales.js';
import rutasActuaciones from './rutas/actuaciones.js';
import rutasRelevamientos from './rutas/relevamientos.js';
import rutasNotificaciones from './rutas/notificaciones.js';
import rutasDocumentacion from './rutas/documentacion.js';
import rutasProrrogasExpedientes from './rutas/prorrogas-expedientes.js';
import rutasConfiguracion from './rutas/configuracion.js';
import rutasHerramientas from './rutas/herramientas.js';
import rutasArchivos from './rutas/archivos.js';
import rutasInforme9DJ from './rutas/informe-9dj.js';

const app = express();
const PUERTO = Number(process.env.PUERTO) || 3000;

/* --- middlewares generales ------------------------------------------------ */
// El front (Vite) corre en otro puerto: sin esto el navegador bloquea los fetch.
// ORIGEN_FRONT admite varios origenes separados por coma: el front se abre
// desde la PC (localhost) y desde los celulares de la red (la IP de la PC).
app.use(cors({ origin: process.env.ORIGEN_FRONT ? process.env.ORIGEN_FRONT.split(',').map((o) => o.trim()) : true }));
// Lee el JSON que manda el front en el body de los POST/PUT. El límite deja
// lugar a la foto de una entrega (achicada en el celular antes de enviarla).
// El limite deja lugar a la foto de una entrega (achicada en el celular) y
// al informe de la prestataria, que viaja como archivo en base64.
app.use(express.json({ limit: '15mb' }));
// Quién está pidiendo y con qué rol. Provisorio hasta CiDiTuc (ver middlewares/usuario.js).
app.use(identificarUsuario);

/* --- comprobación rápida de que el servidor está vivo ---------------------
   Además dice qué funciones opcionales están prendidas, para saber de un
   vistazo qué scripts de sql/ faltan correr. */
app.get('/salud', (_req, res) => {
  res.json({
    ok: true,
    servidor: 'grandes-generadores',
    hora: new Date().toISOString(),
    zonaHoraria: process.env.TZ,
    capacidades: capacidades(),
    geocodificador: modoGeocodificador(),
    aceptaRolDeclarado: aceptaRolDeclarado(),
    tareaDiaria: estadoTareas(),
  });
});

/* --- rutas, un archivo por recurso --------------------------------------- */
app.use('/locales', rutasLocales);
app.use('/actuaciones', rutasActuaciones);
app.use('/relevamientos', rutasRelevamientos);
app.use('/notificaciones', rutasNotificaciones);
app.use('/documentacion', rutasDocumentacion);
app.use('/', rutasProrrogasExpedientes); // /locales/:id/prorrogas y /locales/:id/expedientes
app.use('/configuracion', rutasConfiguracion);
app.use('/herramientas', rutasHerramientas);
app.use('/informe-9dj', rutasInforme9DJ);
app.use('/archivos', rutasArchivos);

/* --- lo que no matcheó ninguna ruta --------------------------------------- */
app.use((req, res) => {
  res.status(404).json({ error: `No existe ${req.method} ${req.originalUrl}` });
});

/* --- errores: cualquier throw dentro de una ruta termina acá --------------
   Los errores con código (403, 409: una regla del circuito que no se cumple)
   llevan un mensaje escrito para el usuario y se devuelven tal cual. Los
   demás son fallas internas: el detalle técnico (un error de SQL, por
   ejemplo) queda en la consola del servidor y al usuario le llega un mensaje
   que entiende. En desarrollo se agrega el detalle en `detalle`. */
/* Sin base, todos los pedidos fallan igual: se avisa una vez cada 30 segundos
   en la consola (no una traza por pedido) y la pantalla recibe qué revisar. */
let ultimoAvisoSinBase = 0;
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const sinBase = problemaDeConexion(err);
  if (sinBase) {
    if (Date.now() - ultimoAvisoSinBase > 30_000) {
      ultimoAvisoSinBase = Date.now();
      console.error(`[base] ${sinBase} (${err.code})`);
    }
    return res.status(503).json({ error: sinBase });
  }
  const status = Number(err.status) || 500;
  if (status >= 500) {
    console.error(err);
    const cuerpo = { error: 'Error interno del servidor. El detalle quedó registrado en la consola del backend.' };
    if (process.env.NODE_ENV !== 'production') cuerpo.detalle = err.message;
    return res.status(status).json(cuerpo);
  }
  res.status(status).json({ error: err.message || 'No se pudo completar el pedido' });
});

await revisarCapacidades();
vigilarCapacidades();
iniciarTareas();

app.listen(PUERTO, () => {
  const c = capacidades();
  console.log(`API Grandes Generadores escuchando en http://localhost:${PUERTO}`);
  console.log(
    `  auditoría: ${c.auditoria ? 'sí' : 'NO (sql/05)'} · parámetros editables: ${c.parametros ? 'sí' : 'NO (sql/06)'} · ` +
      `accesos: ${c.accesos ? 'sí' : 'NO (sql/07)'} · constancia de impresión: ${c.impresion ? 'sí' : 'NO (sql/04)'} · ` +
      `fotos de entregas: ${c.archivos ? 'sí' : 'NO (sql/08)'}`,
  );
  if (c.error) {
    console.log(`  no se pudo revisar la base: ${c.error}`);
    const explicacion = problemaDeConexion({ code: c.codigoError });
    if (explicacion) console.log(`  → ${explicacion}`);
  }
  if (aceptaRolDeclarado()) console.log('  ATENCIÓN: se acepta el rol declarado por el navegador (ACEPTAR_ROL_DECLARADO=no para apagarlo)');
});
