-- ============================================================================
-- backend/sql/10-expedientes.sql
-- ----------------------------------------------------------------------------
-- El modulo de EXPEDIENTES DE MULTA: los estados que faltan y la bitacora.
--
-- HOY el objeto expediente (id_objeto = 7) tiene dos estados: PENDIENTE DE
-- GENERACION (23) y GENERADO (24). Entre que el sistema habilita el expediente
-- y que llega el numero hay un periodo entero que no se puede distinguir:
-- no se sabe si alguien ya pidio el numero o si nadie lo miro todavia.
--
-- LA SECUENCIA COMPLETA:
--   (habilitado)   lo determina el sistema al recalcular: el local esta en
--                  GENERAR EXPEDIENTE y todavia no hay tramite. No es una
--                  fila de esta tabla: es la ausencia de tramite.
--   SOLICITADO     un agente pidio el numero a la otra dependencia (25)
--   GENERADO       llego el numero y se cargo (24, ya existia)
--   EN TRAMITE     avanza en la otra dependencia (26)  -- TODO-DEFINICION:
--   CERRADO        concluyo (27)                       -- confirmar con la
--                  dependencia que tramita las multas que estados maneja.
--
-- LA BITACORA (expediente_novedad): cada movimiento con que paso, cuando,
-- quien y una observacion. La columna `publica` separa DESDE EL INICIO lo que
-- ve el titular en el portal (que tiene expediente y en que estado esta) de
-- las observaciones internas de la oficina: agregar esa distincion despues
-- obligaria a revisar todos los registros ya cargados.
--
-- ES SEGURO CORRERLO:
--   - los INSERT usan WHERE NOT EXISTS: no duplican si se corre dos veces
--   - CREATE TABLE IF NOT EXISTS: no pisa nada
--   - no hay ningun DROP ni DELETE, y no toca ninguna otra tabla
--
-- Se corre desde HeidiSQL: Archivo > Cargar archivo SQL > F9.
-- ============================================================================

USE smt_grandes_generadores;

-- ----------------------------------------------------------------------------
-- PASO 1: los estados nuevos del objeto expediente
-- ----------------------------------------------------------------------------
-- Con id explicito porque el codigo los referencia (backend/mapeo.js,
-- ID_ESTADO). Si alguno de esos id ya estuviera ocupado por otra cosa, el
-- INSERT correspondiente no inserta nada y hay que avisar al equipo.
INSERT INTO estado (id_estado, nombre_estado, id_objeto, habilita)
SELECT 25, 'SOLICITADO', 7, 1
 WHERE NOT EXISTS (SELECT 1 FROM estado WHERE id_estado = 25)
   AND NOT EXISTS (SELECT 1 FROM estado WHERE nombre_estado = 'SOLICITADO' AND id_objeto = 7);

INSERT INTO estado (id_estado, nombre_estado, id_objeto, habilita)
SELECT 26, 'EN TRAMITE', 7, 1
 WHERE NOT EXISTS (SELECT 1 FROM estado WHERE id_estado = 26)
   AND NOT EXISTS (SELECT 1 FROM estado WHERE nombre_estado = 'EN TRAMITE' AND id_objeto = 7);

INSERT INTO estado (id_estado, nombre_estado, id_objeto, habilita)
SELECT 27, 'CERRADO', 7, 1
 WHERE NOT EXISTS (SELECT 1 FROM estado WHERE id_estado = 27)
   AND NOT EXISTS (SELECT 1 FROM estado WHERE nombre_estado = 'CERRADO' AND id_objeto = 7);

-- ----------------------------------------------------------------------------
-- PASO 2: la bitacora del expediente
-- ----------------------------------------------------------------------------
-- POR QUE NO VA EN `auditoria`: la auditoria es el registro interno y general
-- del sistema. La bitacora del expediente es un dato DEL EXPEDIENTE, que el
-- titular consulta en parte (las novedades publicas) y que acompanya el
-- recorrido en la otra dependencia. Necesita la marca publica/interna por
-- fila, que la auditoria no tiene ni debe tener.
CREATE TABLE IF NOT EXISTS expediente_novedad (
  id_novedad      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_tramite      INT          NOT NULL COMMENT 'el tramite EXPEDIENTE al que pertenece',
  momento         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario         VARCHAR(100) NOT NULL COMMENT 'quien registro el movimiento',
  id_usuario      INT          NULL,
  detalle         VARCHAR(500) NOT NULL COMMENT 'que paso, en palabras',
  id_estado_nuevo INT          NULL     COMMENT 'si el movimiento cambio el estado, a cual',
  publica         TINYINT      NOT NULL DEFAULT 0 COMMENT '1 = el titular la ve en el portal',
  habilita        TINYINT      NOT NULL DEFAULT 1,
  PRIMARY KEY (id_novedad),
  KEY idx_novedad_tramite (id_tramite)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Bitacora del expediente de multa: cada movimiento, con su visibilidad';
