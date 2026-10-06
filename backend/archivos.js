/* ============================================================================
   backend/archivos.js  —  LAS FOTOS DE LAS ENTREGAS (y lo que venga después)
   ----------------------------------------------------------------------------
   Sección 6.2: la foto del local es OBLIGATORIA cuando la entrega no se
   concreta. Es la única prueba de que el notificador estuvo en el domicilio.
   Sección 5.1 (entidad `archivo`): ruta, nombre original, hash, quién lo subió
   y cuándo.

   DÓNDE QUEDAN
     el archivo  en una carpeta del servidor: CARPETA_ARCHIVOS del .env, o
                 backend/archivos/ si no se define (está en .gitignore: las
                 fotos no van al repositorio). Hay que incluirla en el respaldo
                 del servidor, igual que la base.
     los datos   en la tabla opcional `archivo` (sql/08-tabla-archivo.sql).
                 Sin esa tabla las fotos no se guardan y la entrega se registra
                 sin foto, como hasta ahora.

   EL HASH (SHA-256) es la huella del archivo: si alguien lo cambia en el disco,
   la huella deja de coincidir y se nota. También sirve para reconocer un
   reenvío de la misma foto (la cola sin conexión reintenta).

   Las fotos llegan ya achicadas desde el celular (FormEntrega.jsx), como
   imagen en base64 dentro del JSON. El límite de 6 MB es amplio a propósito.
   ============================================================================ */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { consultar, consultarEn } from './conexion-bd.js';
import { tiene } from './capacidades.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const CARPETA = path.resolve(process.env.CARPETA_ARCHIVOS || path.join(AQUI, 'archivos'));

const TIPOS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
// Los documentos respaldatorios (DDJJ, contrato) también pueden venir en PDF.
const TIPOS_DOCUMENTO = { ...TIPOS, 'application/pdf': 'pdf' };
const MAXIMO = 6 * 1024 * 1024;

export function archivosDisponibles() {
  return tiene('archivos');
}

/* "data:image/jpeg;base64,...." -> { contenido, tipo, extension, hash }.
   Devuelve { error } si no es una imagen que se pueda guardar. */
export function leerImagen(dataUrl) {
  return leerAdjunto(dataUrl, TIPOS, 'La foto tiene que ser una imagen JPG, PNG o WEBP');
}

/* El documento respaldatorio de una presentación: imagen o PDF. */
export function leerDocumento(dataUrl) {
  return leerAdjunto(dataUrl, TIPOS_DOCUMENTO, 'El documento tiene que ser un PDF o una imagen JPG, PNG o WEBP');
}

function leerAdjunto(dataUrl, tipos, mensaje) {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl ?? ''));
  if (!m || !tipos[m[1]]) return { error: mensaje };
  const contenido = Buffer.from(m[2], 'base64');
  if (!contenido.length) return { error: 'La foto llegó vacía' };
  if (contenido.length > MAXIMO) return { error: 'La foto es demasiado grande (máximo 6 MB)' };
  const hash = crypto.createHash('sha256').update(contenido).digest('hex');
  return { contenido, tipo: m[1], extension: tipos[m[1]], hash };
}

/* Escribe el archivo y su fila, dentro de la transacción del acto. Si la
   transacción después falla, el archivo queda en el disco sin fila: es un
   sobrante inofensivo (no aparece en ningún lado) y no un dato perdido. */
export async function guardarImagen(cx, req, { idTramite, imagen, tipoArchivo, nombreOriginal }) {
  const hoy = new Date();
  const subcarpeta = path.join(String(hoy.getFullYear()), String(hoy.getMonth() + 1).padStart(2, '0'));
  const nombre = `tramite-${idTramite}-${imagen.hash.slice(0, 16)}.${imagen.extension}`;
  const relativa = path.join(subcarpeta, nombre).split(path.sep).join('/');

  await fs.mkdir(path.join(CARPETA, subcarpeta), { recursive: true });
  await fs.writeFile(path.join(CARPETA, relativa), imagen.contenido);

  const [resultado] = await cx.execute(
    `INSERT INTO archivo
       (id_tramite, tipo_archivo, ruta, nombre_original, tipo_mime, tamano, hash_sha256, subido_por, id_usuario, subido_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      idTramite,
      tipoArchivo,
      relativa,
      String(nombreOriginal || nombre).slice(0, 200),
      imagen.tipo,
      imagen.contenido.length,
      imagen.hash,
      String(req.usuario?.nombre ?? 'Sistema').slice(0, 120),
      req.usuario?.id ?? null,
    ],
  );
  return resultado.insertId;
}

/* ¿Este trámite ya tiene un archivo con esta misma huella? */
export async function existeHash(cx, idTramite, hash) {
  const [fila] = await consultarEn(cx, 'SELECT id_archivo FROM archivo WHERE id_tramite = ? AND hash_sha256 = ? LIMIT 1', [
    idTramite,
    hash,
  ]);
  return Boolean(fila);
}

/* Los archivos de una lista de trámites, agrupados por trámite. Sin la tabla
   devuelve un mapa vacío. */
export async function archivosPorTramite(idsTramite = null, cx = null) {
  const mapa = new Map();
  if (!archivosDisponibles()) return mapa;
  if (Array.isArray(idsTramite) && !idsTramite.length) return mapa;
  const filas = Array.isArray(idsTramite)
    ? await consultarEn(
        cx,
        `SELECT id_archivo, id_tramite, tipo_archivo, nombre_original, subido_por, subido_en FROM archivo
          WHERE id_tramite IN (${idsTramite.map(() => '?').join(',')}) ORDER BY id_archivo`,
        idsTramite,
      )
    : await consultarEn(
        cx,
        'SELECT id_archivo, id_tramite, tipo_archivo, nombre_original, subido_por, subido_en FROM archivo ORDER BY id_archivo',
      );
  for (const f of filas) {
    if (!mapa.has(f.idTramite)) mapa.set(f.idTramite, []);
    mapa.get(f.idTramite).push({
      id: f.idArchivo,
      tipo: f.tipoArchivo,
      nombre: f.nombreOriginal,
      subidoPor: f.subidoPor,
      subidoEn: f.subidoEn ? String(f.subidoEn).replace(' ', 'T') : null,
    });
  }
  return mapa;
}

export async function archivoPorId(id) {
  if (!archivosDisponibles()) return null;
  const [fila] = await consultar('SELECT * FROM archivo WHERE id_archivo = ?', [id]);
  return fila ?? null;
}

/* La ruta en disco de un archivo, sin dejar que una ruta guardada con ".."
   salga de la carpeta de archivos. */
export function rutaEnDisco(relativa) {
  const completa = path.resolve(CARPETA, relativa);
  if (!completa.startsWith(CARPETA + path.sep)) throw new Error('Ruta de archivo inválida');
  return completa;
}
