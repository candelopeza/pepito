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

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
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

/* --- todo lo que sale, comprimido -----------------------------------------
   Cada vez que se abre la app, y DESPUÉS DE CADA GUARDADO, el front vuelve a
   pedir el padrón, las actuaciones y los relevamientos: con la base del área
   son unos 2 MB de JSON. Comprimidos (gzip) son unos 200 KB, diez veces menos.
   La app compilada baja de 1,9 MB a unos 580 KB. En el teléfono, con poca
   señal, es la diferencia entre esperar 15 segundos y uno o dos; y gasta diez
   veces menos datos. Las fotos y PDF no se tocan (ya vienen comprimidos). Se
   apaga con COMPRIMIR=no en el .env (por ejemplo, si el servidor de Sistemas
   ya comprime por su cuenta). */
if (String(process.env.COMPRIMIR ?? 'si').trim().toLowerCase() !== 'no') app.use(compression());

/* --- la aplicación misma, en la misma dirección (opcional) ----------------
   Con CARPETA_FRONT en el .env (la carpeta que arma `npm run build`, por
   ejemplo ../dist), este servidor entrega también la aplicación: la página en
   "/", y sw.js, el manifest y los íconos. Así una sola dirección HTTPS sirve
   para todo, que es lo que necesitan los teléfonos para el GPS y para abrir
   sin señal. La app se compila con VITE_API_URL=/ (mismo servidor).
   Va antes que todo lo demás: un archivo de la app no necesita usuario ni
   base. Ningún archivo de la app se llama como una ruta de la API. Sin la
   variable, no cambia nada: la app se sigue sirviendo aparte, como antes. */
const CARPETA_FRONT = process.env.CARPETA_FRONT
  ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), process.env.CARPETA_FRONT)
  : null;
if (CARPETA_FRONT) {
  if (fs.existsSync(path.join(CARPETA_FRONT, 'index.html'))) {
    app.use(express.static(CARPETA_FRONT, { index: 'index.html' }));
  } else {
    console.warn(`[front] CARPETA_FRONT=${process.env.CARPETA_FRONT}: no hay index.html ahí. ¿Falta npm run build?`);
  }
}
/* --- plantillas para descargar ------------------------------------------
   Formularios en blanco que el titular baja, completa y vuelve a adjuntar:
   hoy, el Form D.A 03 (DDJJ de separación de residuos secos y limpios) que
   el portal ofrece al presentar una DDJJ de reciclaje. Son archivos
   públicos del área, no datos de nadie: por eso van antes de identificar
   al usuario y sin pasar por la base. Para agregar otro, se copia el PDF a
   backend/datos/plantillas/ y se lo enlaza desde el front. */
app.use('/plantillas', express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), 'datos', 'plantillas')));

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
  if (CARPETA_FRONT) console.log(`  la aplicación también se sirve acá, desde ${CARPETA_FRONT}`);
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
