-- ============================================================================
-- 13-frecuencia-recoleccion.sql  —  LA FRECUENCIA DE RECOLECCIÓN DEL CONTRATO
-- ----------------------------------------------------------------------------
-- Pedido de coordinación (4/11/2026): cuántas veces por semana pasa la
-- prestataria por el local, según el contrato. El informe de 9 de Julio NO
-- trae ese dato: lo carga coordinación desde Herramientas → Informe 9 de
-- Julio, en la tabla de contratos vigentes del último informe aplicado.
-- Sirve para dimensionar a grandes rasgos el volumen de generación.
--
-- Va en la tabla `documentacion` porque es un dato DEL CONTRATO (una
-- renovación puede traer otra frecuencia), no del local.
--
-- Idempotente: se puede correr más de una vez. Sin esta columna el sistema
-- funciona igual y la tabla de frecuencias avisa que falta correrlo
-- (backend/capacidades.js, capacidad `frecuencia`).
-- ============================================================================

USE smt_grandes_generadores;

ALTER TABLE documentacion
  ADD COLUMN IF NOT EXISTS frecuencia_semanal TINYINT UNSIGNED NULL
    COMMENT 'Veces por semana que pasa la prestataria (1 a 7). La carga coordinación; el informe 9DJ no la trae.';
