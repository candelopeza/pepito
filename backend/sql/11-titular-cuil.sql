-- ============================================================================
-- backend/sql/11-titular-cuil.sql
-- ----------------------------------------------------------------------------
-- OPCIONAL. NO hace falta para que el sistema funcione.
--
-- Agrega al local el CUIL del titular habilitado: la persona que puede ver el
-- local desde el portal del contribuyente (CiDiTuc identifica personas por
-- CUIL; el padron identifica locales por el CUIT del titular, que puede ser
-- una empresa).
--
-- QUE HABILITA: el campo "CUIL del titular habilitado" del formulario del
-- local. Hasta ahora se podia escribir pero no se guardaba en ningun lado: la
-- tabla `local` no tenia la columna, y al volver a abrir el formulario el
-- campo aparecia vacio.
--
-- SIN ESTA COLUMNA: el formulario muestra el campo bloqueado con un aviso, y
-- el portal sigue buscando los locales por el CUIT (como hasta ahora).
--
-- ADD COLUMN es ADITIVO: agrega la columna con NULL en todas las filas y no
-- toca ningun dato cargado. Usa IF NOT EXISTS (MariaDB 10.5): correrlo dos
-- veces no hace nada. El backend se entera solo en 5 minutos, o al reiniciarlo.
-- ============================================================================

USE smt_grandes_generadores;

ALTER TABLE local
  ADD COLUMN IF NOT EXISTS titular_cuil varchar(13) NULL COMMENT 'CUIL de la persona habilitada en el portal (con guiones)';

-- Comprobacion: tiene que aparecer una fila con titular_cuil.
SHOW COLUMNS FROM local LIKE 'titular_cuil';
