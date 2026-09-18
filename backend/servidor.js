/* ============================================================================
   backend/servidor.js  —  ARRANQUE DEL SERVIDOR
   ----------------------------------------------------------------------------
   Es el único archivo que se ejecuta directo (npm run dev). Hace tres cosas:
     1. crea la app de Express y le pone los middlewares generales
     2. monta las rutas, una carpeta por recurso (ver rutas/)
     3. escucha en el puerto que dice el .env

   Los datos de conexión a MariaDB no están acá: están en conexion-bd.js, que
   los lee del .env. Este archivo no sabe qué base hay detrás.
   ============================================================================ */

import express from 'express';
import cors from 'cors';
import { identificarUsuario } from './middlewares/usuario.js';
import rutasLocales from './rutas/locales.js';
import rutasRelevamientos from './rutas/relevamientos.js';
import rutasNotificaciones from './rutas/notificaciones.js';
import rutasDocumentacion from './rutas/documentacion.js';
import rutasProrrogasExpedientes from './rutas/prorrogas-expedientes.js';
import rutasConfiguracion from './rutas/configuracion.js';
import rutasHerramientas from './rutas/herramientas.js';

const app = express();
const PUERTO = Number(process.env.PUERTO) || 3000;

/* --- middlewares generales ------------------------------------------------ */
// El front (Vite) corre en otro puerto: sin esto el navegador bloquea los fetch.
app.use(cors({ origin: process.env.ORIGEN_FRONT || true }));
// Lee el JSON que manda el front en el body de los POST/PUT.
app.use(express.json({ limit: '2mb' }));
// Quién está pidiendo y con qué rol. Provisorio hasta CiDiTuc (ver middlewares/usuario.js).
app.use(identificarUsuario);

/* --- comprobación rápida de que el servidor está vivo --------------------- */
app.get('/salud', (_req, res) => {
  res.json({ ok: true, servidor: 'grandes-generadores', hora: new Date().toISOString() });
});

/* --- rutas, un archivo por recurso --------------------------------------- */
app.use('/locales', rutasLocales);
app.use('/relevamientos', rutasRelevamientos);
app.use('/notificaciones', rutasNotificaciones);
app.use('/documentacion', rutasDocumentacion);
app.use('/', rutasProrrogasExpedientes); // /locales/:id/prorrogas y /locales/:id/expedientes
app.use('/configuracion', rutasConfiguracion);
app.use('/herramientas', rutasHerramientas);

/* --- lo que no matcheó ninguna ruta --------------------------------------- */
app.use((req, res) => {
  res.status(404).json({ error: `No existe ${req.method} ${req.originalUrl}` });
});

/* --- errores: cualquier throw dentro de una ruta termina acá -------------- */
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Error interno' });
});

app.listen(PUERTO, () => {
  console.log(`API Grandes Generadores escuchando en http://localhost:${PUERTO}`);
});
