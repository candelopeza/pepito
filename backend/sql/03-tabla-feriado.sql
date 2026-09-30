-- ============================================================================
-- backend/sql/03-tabla-feriado.sql
-- ----------------------------------------------------------------------------
-- Agrega a smt_grandes_generadores la UNICA tabla que el sistema necesita y la
-- base no tiene: el calendario de feriados.
--
-- POR QUE NO SE PUEDE RESOLVER EN EL CODIGO:
-- los feriados fijos y los que dependen de la Pascua se podrian calcular, pero
-- los puentes turisticos los fija el Poder Ejecutivo por decreto cada anio y
-- los asuetos municipales salen a veces con dias de aviso. Un feriado que el
-- sistema no conoce produce un vencimiento un dia antes del que corresponde, y
-- esa intimacion es impugnable. La lista tiene que ser un dato editable.
--
-- ES SEGURO CORRERLO:
--   - CREATE TABLE IF NOT EXISTS: no pisa nada
--   - los ALTER del paso 2 corrigen la tabla si ya estaba creada con otra
--     estructura, y no hacen nada si ya esta bien
--   - los INSERT usan WHERE NOT EXISTS: no duplican si se corre dos veces
--   - no hay ningun DROP ni DELETE, y no toca ninguna otra tabla
--
-- Se corre desde HeidiSQL: Archivo > Cargar archivo SQL > F9.
-- ============================================================================

USE smt_grandes_generadores;

-- ----------------------------------------------------------------------------
-- PASO 1: la tabla
-- ----------------------------------------------------------------------------
-- Sigue la convencion de la base: nombre en singular, PK id_<tabla>, campo
-- descriptivo con el sufijo de la tabla, y columna `habilita` para la baja
-- logica.
--
-- fecha_feriado NO lleva indice unico a proposito: puede haber dos feriados el
-- mismo dia (uno nacional y un asueto municipal encima), y un UNIQUE impediria
-- cargar el segundo.
CREATE TABLE IF NOT EXISTS feriado (
  id_feriado      int(4)       NOT NULL AUTO_INCREMENT,
  fecha_feriado   date         NOT NULL COMMENT 'El dia que no es habil. DATE porque el feriado es el dia entero',
  nombre_feriado  varchar(200) NOT NULL COMMENT 'Motivo. Justifica por que un plazo se corrio',
  alcance         varchar(20)  NOT NULL DEFAULT 'nacional' COMMENT 'nacional | provincial | municipal',
  habilita        int(1)       NOT NULL DEFAULT 1 COMMENT 'Baja logica: desactiva sin borrar el historico',
  PRIMARY KEY (id_feriado),
  KEY ix_feriado_fecha (fecha_feriado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- PASO 2: correcciones, por si la tabla ya estaba creada
-- ----------------------------------------------------------------------------
-- El CREATE de arriba no hace nada si la tabla ya existe, aunque su estructura
-- sea distinta. Estas tres sentencias la dejan como corresponde. Si la tabla se
-- acaba de crear con el CREATE, no cambian nada: son idempotentes.

-- nombre_feriado tiene que ser TEXTO. Si quedo como int, ahi no entra
-- "Dia de la Independencia" ni ningun otro motivo.
ALTER TABLE feriado
  MODIFY COLUMN nombre_feriado varchar(200) NOT NULL COMMENT 'Motivo. Justifica por que un plazo se corrio';

-- alcance: nacional | provincial | municipal.
ALTER TABLE feriado
  ADD COLUMN IF NOT EXISTS alcance varchar(20) NOT NULL DEFAULT 'nacional' COMMENT 'nacional | provincial | municipal';

-- Indice por fecha: la tabla se consulta por fecha en cada calculo de plazo.
ALTER TABLE feriado
  ADD INDEX IF NOT EXISTS ix_feriado_fecha (fecha_feriado);

-- ----------------------------------------------------------------------------
-- PASO 3: feriados nacionales y provinciales de Tucuman 2026
-- ----------------------------------------------------------------------------
-- Los asuetos municipales NO estan: los carga el area desde Configuracion a
-- medida que salen los decretos.
INSERT INTO feriado (fecha_feriado, nombre_feriado, alcance, habilita)
SELECT nuevos.f, nuevos.n, nuevos.a, nuevos.h FROM (
  SELECT '2026-01-01' AS f, 'Ano Nuevo' AS n, 'nacional' AS a, 1 AS h UNION ALL
  SELECT '2026-02-16', 'Carnaval', 'nacional', 1 UNION ALL
  SELECT '2026-02-17', 'Carnaval', 'nacional', 1 UNION ALL
  SELECT '2026-03-24', 'Dia de la Memoria', 'nacional', 1 UNION ALL
  SELECT '2026-04-02', 'Dia del Veterano y de los Caidos en Malvinas', 'nacional', 1 UNION ALL
  SELECT '2026-04-03', 'Viernes Santo', 'nacional', 1 UNION ALL
  SELECT '2026-05-01', 'Dia del Trabajador', 'nacional', 1 UNION ALL
  SELECT '2026-05-25', 'Revolucion de Mayo', 'nacional', 1 UNION ALL
  SELECT '2026-06-15', 'Paso a la Inmortalidad del Gral. Guemes', 'nacional', 1 UNION ALL
  SELECT '2026-06-20', 'Paso a la Inmortalidad del Gral. Belgrano', 'nacional', 1 UNION ALL
  SELECT '2026-07-09', 'Dia de la Independencia', 'nacional', 1 UNION ALL
  SELECT '2026-08-17', 'Paso a la Inmortalidad del Gral. San Martin', 'nacional', 1 UNION ALL
  SELECT '2026-09-24', 'Batalla de Tucuman', 'provincial', 1 UNION ALL
  SELECT '2026-10-12', 'Dia del Respeto a la Diversidad Cultural', 'nacional', 1 UNION ALL
  SELECT '2026-11-23', 'Dia de la Soberania Nacional', 'nacional', 1 UNION ALL
  SELECT '2026-12-08', 'Inmaculada Concepcion de Maria', 'nacional', 1 UNION ALL
  SELECT '2026-12-25', 'Navidad', 'nacional', 1
) AS nuevos
WHERE NOT EXISTS (SELECT 1 FROM feriado WHERE feriado.fecha_feriado = nuevos.f);

-- ============================================================================
-- COMPROBACION
-- ============================================================================
SELECT COUNT(*) AS feriados_cargados,
       MIN(fecha_feriado) AS primero,
       MAX(fecha_feriado) AS ultimo
  FROM feriado
 WHERE habilita = 1;
