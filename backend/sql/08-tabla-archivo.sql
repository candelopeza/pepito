-- ============================================================================
-- backend/sql/08-tabla-archivo.sql
-- ----------------------------------------------------------------------------
-- OPCIONAL. Guarda las FOTOS de las entregas de cedulas (y despues, los
-- documentos que se adjunten).
--
-- POR QUE HACE FALTA:
-- la seccion 6.2 de la guia dice que la foto del local es OBLIGATORIA cuando
-- la entrega no se concreta: es la unica prueba de que el notificador estuvo
-- en el domicilio. Hoy la foto no se guarda en ningun lado.
--
-- COMO FUNCIONA: el archivo va a una carpeta del servidor (CARPETA_ARCHIVOS
-- del .env, o backend/archivos/). En esta tabla queda de que tramite es, la
-- ruta, el nombre, el tamano, la huella SHA-256 (para probar que nadie lo
-- cambio), quien lo subio y cuando. Esa carpeta tiene que entrar en el
-- respaldo del servidor, igual que la base.
--
-- SIN ESTA TABLA: la entrega se registra sin foto, como hasta ahora, y la
-- pantalla avisa que la foto todavia no se puede guardar.
--
-- ES SEGURO CORRERLO: CREATE TABLE IF NOT EXISTS, sin DROP ni DELETE, no toca
-- ninguna otra tabla, correrlo dos veces no hace nada.
-- ============================================================================

USE smt_grandes_generadores;

-- No lleva `habilita`: una evidencia no se da de baja. Si se cargo mal, se
-- carga otra; la primera queda como parte de la historia del tramite.
CREATE TABLE IF NOT EXISTS archivo (
  id_archivo       int(11)      NOT NULL AUTO_INCREMENT,
  id_tramite       int(11)      NOT NULL COMMENT 'El tramite al que respalda (la notificacion entregada)',
  tipo_archivo     varchar(40)  NOT NULL COMMENT 'evidencia-entrega, documento...',
  ruta             varchar(255) NOT NULL COMMENT 'Relativa a la carpeta de archivos del servidor',
  nombre_original  varchar(200) NULL,
  tipo_mime        varchar(60)  NULL,
  tamano           int(11)      NULL     COMMENT 'En bytes',
  hash_sha256      char(64)     NOT NULL COMMENT 'Huella del archivo',
  subido_por       varchar(120) NOT NULL,
  id_usuario       int(11)      NULL,
  subido_en        datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_archivo),
  KEY ix_archivo_tramite (id_tramite)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT COUNT(*) AS archivos_guardados FROM archivo;
