-- ============================================================================
-- backend/sql/07-tablas-accesos.sql
-- ----------------------------------------------------------------------------
-- OPCIONAL. Permite guardar desde Accesos > Tipos de usuario que ve y que
-- modifica cada tipo de usuario, y apagar un tipo entero.
--
-- SIN ESTAS TABLAS: rige el reparto por defecto de src/config/modulos.js y las
-- llaves de la pantalla no guardan.
--
-- Son las mismas dos tablas que estaban en sql/01-crear-tablas.sql, que NO se
-- corre nunca (empieza borrando tablas). Aca van solas, con IF NOT EXISTS.
--
--   permisos_modulos  solo las DIFERENCIAS respecto del codigo: si un modulo y
--                     un rol no tienen fila, vale lo que dice modulos.js
--   tipos_usuario     la llave "Habilita" de cada tipo de usuario. No es la
--                     tabla tipo_usuario del area (esa es el catalogo de
--                     tipos, en singular): esta solo guarda cuales estan
--                     apagados
--
-- Los roles van como texto y no como ENUM: si el area suma un tipo de usuario,
-- no hace falta tocar esta tabla.
--
-- ES SEGURO CORRERLO: CREATE TABLE IF NOT EXISTS, sin DROP ni DELETE, no toca
-- ninguna otra tabla, correrlo dos veces no hace nada.
-- ============================================================================

USE smt_grandes_generadores;

CREATE TABLE IF NOT EXISTS permisos_modulos (
  modulo  varchar(40) NOT NULL COMMENT 'id del modulo en src/config/modulos.js',
  rol     varchar(30) NOT NULL COMMENT 'relevador, notificador, administrativo, coordinacion, direccion, administrador, titular',
  nivel   varchar(10) NOT NULL COMMENT 'no | ver | editar',
  PRIMARY KEY (modulo, rol)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tipos_usuario (
  rol         varchar(30) NOT NULL,
  habilitado  int(1)      NOT NULL DEFAULT 1 COMMENT '0 = el tipo de usuario no ve ningun modulo',
  PRIMARY KEY (rol)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT
  (SELECT COUNT(*) FROM permisos_modulos) AS permisos_guardados,
  (SELECT COUNT(*) FROM tipos_usuario WHERE habilitado = 0) AS tipos_apagados;
