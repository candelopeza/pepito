-- ============================================================================
-- backend/sql/13-notificacion-por-correo.sql
-- ----------------------------------------------------------------------------
-- OPCIONAL. Habilita mandar la cedula de notificacion por correo electronico
-- al local, cuando tiene un correo cargado en el padron.
--
-- QUE HABILITA: al generar una cedula, el sistema pregunta por que medio va:
--   papel    la cedula impresa que lleva el notificador (como hasta ahora)
--   correo   se manda al correo del local y queda registrada como entregada
--            ese dia (TODO-DEFINICION: la Direccion tiene que confirmar la
--            validez de la notificacion electronica antes de usar este medio
--            solo; mientras tanto conviene "ambos")
--   ambos    se manda por correo Y sale en papel; el plazo lo fija la entrega
--            en papel, como siempre
-- Tambien se puede mandar despues, desde la ficha del local ("Enviar por
-- correo"), por ejemplo si el envio fallo o si la cedula se regenero.
--
-- ADEMAS hace falta configurar el servidor de correo en backend/.env
-- (CORREO_HOST, CORREO_DESDE, ...; ver .env.ejemplo). Sin eso, o sin estas
-- columnas, la opcion no aparece y todo sigue como antes.
--
-- ADD COLUMN es ADITIVO: agrega columnas en NULL y no toca ningun dato. Usa
-- IF NOT EXISTS (MariaDB 10.5): correrlo dos veces no hace nada. El backend
-- se entera solo en 5 minutos, o al reiniciarlo.
-- ============================================================================

USE smt_grandes_generadores;

ALTER TABLE tramite
  ADD COLUMN IF NOT EXISTS medio_notificacion varchar(10)  NULL COMMENT 'papel | correo | ambos (solo notificaciones)',
  ADD COLUMN IF NOT EXISTS correo_enviado_a   varchar(160) NULL COMMENT 'A que direccion se mando la cedula',
  ADD COLUMN IF NOT EXISTS correo_enviado_en  datetime     NULL COMMENT 'Cuando se mando';

-- Comprobacion: tienen que aparecer 3 filas.
SHOW COLUMNS FROM tramite LIKE '%correo%';
SHOW COLUMNS FROM tramite LIKE 'medio_notificacion';
