/* ============================================================================
   backend/entorno.js  —  CARGA DEL .env
   ----------------------------------------------------------------------------
   Tiene que ser el PRIMER import de todo archivo que se ejecute directo
   (servidor.js y los scripts de npm run). En ES modules los import se evalúan
   antes que el resto del código, así que un dotenv.config() puesto más abajo
   llegaría tarde: conexion-bd.js ya habría leído process.env vacío.

   Lee backend/.env (al lado de este archivo), no el de la carpeta desde donde
   se lanzó node. Si no hay .env, no falla: se usan las variables del sistema.
   Lo que ya esté definido en el sistema NO se pisa con el .env.
   ============================================================================ */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({
  path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env'),
  quiet: true,
});

/* LA HORA DEL SERVIDOR ES LA DE TUCUMÁN. Todos los plazos se calculan con
   "hoy" (hoyISO en src/dominio/fechas.js), que usa la hora local de la
   máquina. Un servidor en UTC daría "mañana" a partir de las 21 h y vencería
   plazos tres horas antes. Se puede pisar con TZ en el .env. */
process.env.TZ = process.env.TZ || 'America/Argentina/Tucuman';
