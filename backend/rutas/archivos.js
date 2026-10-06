/* ============================================================================
   backend/rutas/archivos.js  —  VER UNA FOTO O DOCUMENTO GUARDADO
   ----------------------------------------------------------------------------
     GET /archivos/:id   ->  el archivo, para mostrarlo en la ficha del local

   Los archivos se guardan con backend/archivos.js (por ahora, las fotos de las
   entregas). Este endpoint solo los devuelve. Pide que el usuario esté
   identificado, como el resto: las fotos son de establecimientos y de
   domicilios, no se publican.
   ============================================================================ */

import { Router } from 'express';
import { archivoPorId, rutaEnDisco } from '../archivos.js';

const router = Router();

router.get('/:id', async (req, res, next) => {
  try {
    if (!req.usuario) return res.status(401).json({ error: 'Falta identificar al usuario' });
    const fila = await archivoPorId(Number(req.params.id));
    if (!fila) return res.status(404).json({ error: 'No existe ese archivo' });

    res.type(fila.tipoMime || 'application/octet-stream');
    res.sendFile(rutaEnDisco(fila.ruta), (err) => {
      if (!err) return;
      if (err.code === 'ENOENT') {
        res.status(404).json({ error: 'El archivo está registrado pero no aparece en la carpeta del servidor' });
      } else {
        next(err);
      }
    });
  } catch (e) {
    next(e);
  }
});

export default router;
