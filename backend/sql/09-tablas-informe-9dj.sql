-- ============================================================================
-- backend/sql/09-tablas-informe-9dj.sql
-- ----------------------------------------------------------------------------
-- Las dos tablas del modulo INFORME 9 DE JULIO (seccion 9.3 del pliego,
-- modelo de foto): una por cada informe que manda la prestataria, y una por
-- cada fila de ese informe con la decision que tomo el agente.
--
-- POR QUE NO ALCANZA CON tramite + documentacion:
-- tramite guarda las actuaciones DE UN LOCAL, y una fila del informe puede no
-- corresponder a ningun local del padron (es justamente el caso "no
-- encontrado" que el modulo tiene que mostrar). Ademas el modulo necesita:
--   - la HUELLA del archivo, para avisar "este informe ya se cargo" aunque lo
--     hayan renombrado;
--   - GUARDAR EL AVANCE: la revision de 250 filas no se hace de una sentada,
--     y lo tildado no se puede perder al cerrar la pantalla;
--   - comparar contra el INFORME ANTERIOR (que filas aparecieron, cuales se
--     retiraron) para proponer las bajas;
--   - la TRAZABILIDAD fila por fila (quien decidio que, cuando) y la
--     ANULACION de una carga aplicada por error, que exige saber exactamente
--     que toco cada fila al aplicarse.
-- Nada de eso es una actuacion de un local: es el expediente del informe.
--
-- ES SEGURO CORRERLO:
--   - CREATE TABLE IF NOT EXISTS: no pisa nada
--   - no hay ningun DROP ni DELETE, y no toca ninguna otra tabla
--
-- Se corre desde HeidiSQL: Archivo > Cargar archivo SQL > F9.
-- ============================================================================

USE smt_grandes_generadores;

-- ----------------------------------------------------------------------------
-- TABLA 1: el informe (una fila por archivo cargado)
-- ----------------------------------------------------------------------------
-- `estado` recorre: EN_REVISION (recien cargado, el agente decide fila por
-- fila) -> APLICADO (produjo efectos en el padron) o DESCARTADO (se cargo el
-- archivo equivocado y no produjo nada). APLICADO puede pasar a ANULADO, que
-- revierte sus efectos y exige motivo y usuario.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS informe_9dj (
  id_informe        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre_archivo    VARCHAR(255) NOT NULL,
  huella            CHAR(64)     NOT NULL COMMENT 'SHA-256 del archivo: detecta la doble carga',
  periodo           VARCHAR(30)  NULL     COMMENT 'que mes/fecha dice cubrir, lo ingresa el agente',
  formato           VARCHAR(10)  NOT NULL DEFAULT 'planilla',
  advertencia       VARCHAR(255) NULL     COMMENT 'ej.: vino en PDF, cotejar contra el crudo',
  estado            VARCHAR(15)  NOT NULL DEFAULT 'EN_REVISION',
  usuario_carga     VARCHAR(100) NOT NULL,
  fecha_carga       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_aplicacion VARCHAR(100) NULL,
  fecha_aplicacion  DATETIME     NULL,
  usuario_anulacion VARCHAR(100) NULL,
  fecha_anulacion   DATETIME     NULL,
  motivo_anulacion  VARCHAR(255) NULL,
  habilita          TINYINT      NOT NULL DEFAULT 1,
  PRIMARY KEY (id_informe),
  KEY idx_informe_huella (huella),
  KEY idx_informe_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Cada informe de contratos que mando la prestataria 9 de Julio';

-- ----------------------------------------------------------------------------
-- TABLA 2: las filas del informe, con el cruce y la decision
-- ----------------------------------------------------------------------------
-- `cruce` dice que encontro el sistema: ENCONTRADO (un local del padron),
-- NO_ENCONTRADO (nada seguro) o BAJA (fila sintetica que se agrega al aplicar,
-- por cada local que tenia contrato y no figura en esta foto: queda el
-- registro de la baja y de quien la confirmo).
--
-- `decision` es lo que resolvio el agente: SIN_REVISAR (nadie la miro),
-- CONFIRMADA (tildada: el contrato vale), RECHAZADA (destildada: no produce
-- efecto), VINCULADA (no encontrado que el agente ato a un local existente),
-- ALTA (no encontrado que sera un local nuevo) o PENDIENTE (se decide en otra
-- sesion; no frena la aplicacion del resto).
--
-- `efecto` + `id_tramite` + `id_local` se completan AL APLICAR y son lo que
-- permite anular: dicen exactamente que produjo cada fila en el padron.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS informe_9dj_fila (
  id_fila           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_informe        INT UNSIGNED NOT NULL,
  nro_fila          INT          NOT NULL COMMENT 'el renglon en el archivo original',
  cuit              VARCHAR(11)  NULL,
  cuit_valido       TINYINT      NOT NULL DEFAULT 0,
  motivo_cuit       VARCHAR(150) NULL,
  razon_social      VARCHAR(255) NULL,
  direccion         VARCHAR(255) NULL,
  numero_contrato   VARCHAR(50)  NULL,
  fecha_vencimiento DATE         NULL,
  crudo             VARCHAR(500) NULL COMMENT 'la fila tal como vino en el archivo',
  cruce             VARCHAR(15)  NOT NULL DEFAULT 'NO_ENCONTRADO',
  id_local          INT          NULL COMMENT 'el local del padron (propuesto, vinculado o creado)',
  candidatos        VARCHAR(200) NULL COMMENT 'ids posibles cuando el CUIT da varios locales',
  decision          VARCHAR(12)  NOT NULL DEFAULT 'SIN_REVISAR',
  usuario_decision  VARCHAR(100) NULL,
  fecha_decision    DATETIME     NULL,
  id_tramite        INT          NULL COMMENT 'el tramite que esta fila creo o toco al aplicarse',
  efecto            VARCHAR(30)  NULL COMMENT 'CONTRATO_CREADO / CONTRATO_CONFIRMADO / LOCAL_Y_CONTRATO_CREADOS / CONTRATO_RETIRADO',
  habilita          TINYINT      NOT NULL DEFAULT 1,
  PRIMARY KEY (id_fila),
  KEY idx_fila_informe (id_informe),
  KEY idx_fila_local (id_local),
  CONSTRAINT fk_fila_informe FOREIGN KEY (id_informe) REFERENCES informe_9dj (id_informe)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Cada fila de cada informe 9DJ, con su cruce contra el padron y la decision del agente';

-- ----------------------------------------------------------------------------
-- AGREGADO (2026-10-07): los datos del alta, editados por el agente
-- ----------------------------------------------------------------------------
-- Cuando una fila no encontrada se decide como ALTA, el agente revisa y puede
-- corregir los datos con el mismo formulario del padron (nombre, rubro,
-- contacto...). Lo editado queda aca como JSON y es lo que usa la aplicacion
-- del informe para crear el local. Si esta vacio, se usan los datos crudos de
-- la fila, como antes.
ALTER TABLE informe_9dj_fila ADD COLUMN IF NOT EXISTS datos_alta TEXT NULL
  COMMENT 'JSON con los datos del alta revisados por el agente';
