-- ############################################################################
-- ##  OBSOLETO - NO EJECUTAR ESTE ARCHIVO
-- ############################################################################
-- Pertenece al esquema que se habia inventado antes de conocer la base real
-- (tablas `locales`, `actuaciones`, `relevamientos`). Ese esquema NO existe.
--
-- La base real es smt_grandes_generadores, con 2.220 locales y 2.441 tramites
-- cargados por el area. Este script empieza con un DROP TABLE y, si por error
-- se corriera contra una base con esos nombres, borraria datos de trabajo.
--
-- Lo que SI hay que correr es sql/03-tablas-faltantes.sql.
-- Se conserva solo como referencia historica del diseno original.
-- ############################################################################

-- ============================================================================
-- backend/sql/01-crear-tablas.sql  —  ESQUEMA DE LA BASE
-- ----------------------------------------------------------------------------
-- Se corre UNA vez desde HeidiSQL: Archivo > Cargar archivo SQL > F9.
-- Las tablas salen de src/datos/semilla.js, que es la base actual de la
-- maqueta. Cuando llegue el Excel del área se ajustan las columnas acá y se
-- vuelve a correr (el script borra y crea de nuevo, ojo con datos cargados).
--
-- Convenciones:
--   - nombres de tabla y columna en snake_case; el backend los pasa a camelCase
--   - fechas sin hora en DATE, con hora en DATETIME
--   - booleanos en TINYINT(1)
--   - NO hay columna `estado` en locales: el estado se calcula (ver README)
-- ============================================================================

CREATE DATABASE IF NOT EXISTS grandes_generadores
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE grandes_generadores;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS auditoria, fusiones, actuaciones, relevamientos, locales,
                     usuarios, rubros, feriados, parametros, secuencias;
SET FOREIGN_KEY_CHECKS = 1;

-- ----------------------------------------------------------------------------
-- CATÁLOGOS (Configuración)
-- ----------------------------------------------------------------------------
CREATE TABLE usuarios (
  id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre  VARCHAR(120) NOT NULL,
  email   VARCHAR(160) NOT NULL,
  rol     ENUM('relevador','notificador','administrativo','coordinacion','direccion','administrador','titular','sistema') NOT NULL,
  activo  TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_email (email)
) ENGINE=InnoDB;

-- Qué ve y qué modifica cada rol (pantalla Accesos → Tipos de usuario).
-- Guarda solo las DIFERENCIAS respecto del reparto por defecto que trae
-- src/config/modulos.js; lo que no está acá vale como lo dice el código.
CREATE TABLE permisos_modulos (
  modulo  VARCHAR(40) NOT NULL,
  rol     ENUM('relevador','notificador','administrativo','coordinacion','direccion','administrador','titular') NOT NULL,
  nivel   ENUM('no','ver','editar') NOT NULL,
  PRIMARY KEY (modulo, rol)
) ENGINE=InnoDB;

-- Tipos de usuario prendidos o apagados (llave "Habilitado" de Accesos →
-- Tipos de usuario). Los roles en sí viven en el código: el circuito depende
-- de ellos, por eso no se crean ni se borran desde la pantalla.
CREATE TABLE tipos_usuario (
  rol        ENUM('relevador','notificador','administrativo','coordinacion','direccion','administrador','titular') NOT NULL,
  habilitado TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (rol)
) ENGINE=InnoDB;

CREATE TABLE rubros (
  id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre  VARCHAR(120) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rubros_nombre (nombre)
) ENGINE=InnoDB;

-- Sección 4.1: tres alcances, porque un asueto municipal también suspende plazos.
CREATE TABLE feriados (
  id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  fecha    DATE NOT NULL,
  motivo   VARCHAR(200) NOT NULL,
  alcance  ENUM('nacional','provincial','municipal') NOT NULL,
  PRIMARY KEY (id),
  KEY ix_feriados_fecha (fecha)
) ENGINE=InnoDB;

-- Una sola fila (id = 1). Solo la edita el rol direccion.
CREATE TABLE parametros (
  id                    TINYINT UNSIGNED NOT NULL,
  plazo_notif1          INT NOT NULL DEFAULT 5,          -- días hábiles
  plazo_notif2          INT NOT NULL DEFAULT 3,          -- días hábiles
  contar_dia_entrega    TINYINT(1) NOT NULL DEFAULT 0,   -- PENDIENTE área legal
  modo_bisiesto         ENUM('28-feb','01-mar') NOT NULL DEFAULT '01-mar',
  exigir_datos_siempre  TINYINT(1) NOT NULL DEFAULT 1,
  emision_automatica    TINYINT(1) NOT NULL DEFAULT 0,   -- sección 9.6
  tope_prorroga_dias    INT NOT NULL DEFAULT 30,         -- 0 = sin tope
  max_prorrogas_por_local INT NOT NULL DEFAULT 1,
  plantilla_cedula      TEXT NOT NULL,                   -- sección 6.4, variables entre {llaves}
  PRIMARY KEY (id)
) ENGINE=InnoDB;

-- Sección 5.4: numeraciones con valor legal, sin reutilización.
CREATE TABLE secuencias (
  nombre  VARCHAR(40) NOT NULL,       -- 'cedula' | 'expediente'
  valor   INT UNSIGNED NOT NULL,      -- último número emitido
  PRIMARY KEY (nombre)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- PADRÓN
-- ----------------------------------------------------------------------------
CREATE TABLE locales (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_legacy         VARCHAR(20) NULL,            -- L-0412 / CON-0042 del sistema viejo
  nombre_local      VARCHAR(200) NOT NULL,
  razon_social      VARCHAR(200) NOT NULL DEFAULT '',
  cuit              VARCHAR(13)  NOT NULL DEFAULT '',   -- 30-12345678-9
  rubro             VARCHAR(120) NOT NULL DEFAULT '',   -- texto, igual que el front (tabla rubros es el desplegable)
  direccion         VARCHAR(250) NOT NULL,
  domicilio_fiscal  VARCHAR(250) NOT NULL DEFAULT '',
  email             VARCHAR(160) NOT NULL DEFAULT '',
  telefono          VARCHAR(40)  NOT NULL DEFAULT '',
  observaciones     TEXT NULL,
  titular_cuil      VARCHAR(13)  NULL,           -- vínculo con el portal del contribuyente
  -- punto de partida del cálculo de estado (lo deja el control administrativo)
  estado_inicial    VARCHAR(30) NOT NULL DEFAULT 'REVISION_DATOS',
  -- bloqueo manual (sección 3.4)
  bloqueado         TINYINT(1) NOT NULL DEFAULT 0,
  bloqueado_motivo  VARCHAR(300) NOT NULL DEFAULT '',
  bloqueado_por     VARCHAR(120) NULL,
  bloqueado_en      DATETIME NULL,
  estado_congelado  VARCHAR(30) NULL,
  -- coordenada del padrón: sale de geocodificar la dirección, NUNCA del GPS (sección 9.2)
  latitud           DECIMAL(9,6) NULL,
  longitud          DECIMAL(9,6) NULL,
  motivo_sin_geo    VARCHAR(200) NULL,
  creado_en         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modificado_en     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_locales_cuit (cuit),
  KEY ix_locales_id_legacy (id_legacy)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- RELEVAMIENTOS (etapa 1 + control administrativo)
-- ----------------------------------------------------------------------------
CREATE TABLE relevamientos (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  local_id            INT UNSIGNED NOT NULL,
  usuario             VARCHAR(120) NOT NULL,       -- relevador que lo cargó
  fecha_hora          DATETIME NOT NULL,
  direccion_relevada  VARCHAR(250) NOT NULL,
  -- coordenada del DISPOSITIVO al guardar: métrica de campo, no ubicación del local
  latitud             DECIMAL(9,6) NULL,
  longitud            DECIMAL(9,6) NULL,
  nombre_local        VARCHAR(200) NOT NULL,
  rubro               VARCHAR(120) NOT NULL DEFAULT '',
  clasificacion       ENUM('GRAN_GENERADOR','GENERADOR_MENOR') NOT NULL,
  -- control administrativo (etapa 2)
  revisado_por        VARCHAR(120) NULL,
  revisado_en         DATETIME NULL,
  resultado_revision  ENUM('EXENTO_CONFIRMADO','GRAN_GENERADOR','HABILITADO') NULL,
  offline             TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_relevamientos_local (local_id),
  CONSTRAINT fk_relevamientos_local FOREIGN KEY (local_id) REFERENCES locales(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- ACTUACIONES: la tabla de eventos y la fuente de verdad del estado (sección 5.1)
-- ----------------------------------------------------------------------------
-- Una sola tabla con las columnas comunes y, en NULL, las que solo usa cada
-- tipo. Es lo que espera dominio/reglas.js (objetos planos por tipo).
CREATE TABLE actuaciones (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  local_id            INT UNSIGNED NOT NULL,
  tipo                ENUM('NOTIFICACION','DDJJ','DDJJ_RECICLAJE','CONTRATO','PRORROGA','EXPEDIENTE','REINGRESO') NOT NULL,
  fecha               DATE NOT NULL,
  usuario             VARCHAR(120) NOT NULL,       -- quién firmó el acto
  observaciones       TEXT NULL,

  -- NOTIFICACION
  instancia           TINYINT NULL,                -- 1 | 2
  numero_cedula       VARCHAR(12) NULL,            -- CED-001275
  notificador_id      INT UNSIGNED NULL,
  fecha_entrega       DATE NULL,
  plazo_dias          INT NULL,
  resultado           ENUM('ENTREGADA','SIN_FIRMA','FIJADA','NO_ENTREGADA') NULL,
  evidencia           VARCHAR(300) NULL,           -- nombre/ruta del archivo de la foto
  impresa_por         VARCHAR(120) NULL,
  impresa_en          DATETIME NULL,

  -- DDJJ / DDJJ_RECICLAJE / CONTRATO
  numero              VARCHAR(40) NULL,
  fecha_emision       DATE NULL,
  origen              ENUM('PRESENTADO_TITULAR','CARGADO_OFICINA','INFORME_9DJ') NULL, -- quién lo cargó: titular por el portal, oficina, informe de la prestataria
  expediente_tramite  VARCHAR(30) NULL,            -- expediente CiDiTuc de la presentación (NO el de multa)
  archivo             VARCHAR(300) NULL,
  validado            TINYINT(1) NULL,

  -- NOTIFICACION / documentos / PRORROGA: vencimiento materializado
  fecha_vencimiento   DATE NULL,

  -- PRORROGA
  dias_otorgados      INT NULL,
  motivo              VARCHAR(300) NULL,

  -- EXPEDIENTE de multa
  numero_expediente   VARCHAR(30) NULL,

  creado_en           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_actuaciones_local (local_id, fecha),
  KEY ix_actuaciones_tipo (tipo),
  UNIQUE KEY uq_actuaciones_cedula (numero_cedula),
  CONSTRAINT fk_actuaciones_local FOREIGN KEY (local_id) REFERENCES locales(id) ON DELETE CASCADE,
  CONSTRAINT fk_actuaciones_notificador FOREIGN KEY (notificador_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- AUDITORÍA: cada cambio de estado (sección 5.2). La escribe el servidor solo.
-- ----------------------------------------------------------------------------
CREATE TABLE auditoria (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  local_id         INT UNSIGNED NOT NULL,
  estado_anterior  VARCHAR(30) NULL,
  estado_nuevo     VARCHAR(30) NOT NULL,
  motivo           VARCHAR(300) NOT NULL,
  actor            VARCHAR(120) NOT NULL,
  momento          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_auditoria_local (local_id, momento)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- FUSIONES de duplicados (sección 9.4): rastro de qué ids se unificaron.
-- ----------------------------------------------------------------------------
CREATE TABLE fusiones (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_principal          INT UNSIGNED NOT NULL,
  id_duplicado          INT UNSIGNED NOT NULL,     -- ya no existe en locales
  id_legacy_duplicado   VARCHAR(20) NULL,
  nombre_duplicado      VARCHAR(200) NOT NULL,
  actor                 VARCHAR(120) NOT NULL,
  momento               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_fusiones_principal (id_principal)
) ENGINE=InnoDB;
