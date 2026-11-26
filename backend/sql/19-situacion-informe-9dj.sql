-- ============================================================================
-- backend/sql/19-situacion-informe-9dj.sql
-- ----------------------------------------------------------------------------
-- LA SITUACIÓN DE CADA CONTRATO DEL INFORME 9 DE JULIO (26/11/2026).
--
-- El informe de la prestataria trae una columna "VIGENTE/SUSP". Decisión de
-- cande: un contrato SUSPENDIDO no cuenta como contrato. El sistema lo lee,
-- lo guarda en esta columna y rechaza esa fila solo; no se puede confirmar.
-- Si el local tenía un contrato de 9 de Julio, aparece entre las bajas
-- propuestas al aplicar el informe.
--
-- ADD COLUMN es ADITIVO: agrega la columna vacía y no toca ningún dato. Se
-- puede correr dos veces sin problema. Se corre en HeidiSQL con F9.
-- ============================================================================

USE smt_grandes_generadores;

ALTER TABLE informe_9dj_fila
  ADD COLUMN IF NOT EXISTS situacion VARCHAR(15) NULL COMMENT 'VIGENTE / SUSPENDIDO, según la columna del informe';

-- Comprobación: tiene que aparecer una fila con situacion.
SHOW COLUMNS FROM informe_9dj_fila LIKE 'situacion';
