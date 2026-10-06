-- ============================================================================
-- backend/sql/05-tabla-auditoria.sql
-- ----------------------------------------------------------------------------
-- Agrega a smt_grandes_generadores el HISTORIAL DE CAMBIOS DE ESTADO de cada
-- local (seccion 5.2 de la guia).
--
-- POR QUE HACE FALTA:
-- es criterio de aceptacion del capitulo 10: "Todo cambio de estado queda
-- registrado con actor, momento y motivo, y es consultable desde la ficha".
-- Sin esta tabla nadie puede probar en que estado estaba un local el dia que
-- se le inicio un expediente de multa, y esa es la primera pregunta de una
-- impugnacion.
--
-- QUE HABILITA:
--   - la seccion "Historial de estados" de la ficha del local
--   - el bloqueo manual congela el estado REAL del local (antes volvia al
--     estado del relevamiento) y muestra desde cuando esta bloqueado
--   - la tarea diaria anota como "Sistema" los cambios por vencimientos
--
-- SIN ESTA TABLA el sistema funciona igual que antes: los actos se registran,
-- pero sin historial de estados.
--
-- ES SEGURO CORRERLO:
--   - CREATE TABLE IF NOT EXISTS: no pisa nada
--   - no hay ningun DROP, DELETE ni UPDATE, y no toca ninguna otra tabla
--   - correrlo dos veces no hace nada
--
-- Se corre desde HeidiSQL: Archivo > Cargar archivo SQL > F9.
-- Despues de correrlo no hace falta reiniciar el backend: se da cuenta solo
-- en menos de 5 minutos. Para que anote ya el punto de partida de todos los
-- locales: Herramientas, o POST /herramientas/recalcular-estados.
-- ============================================================================

USE smt_grandes_generadores;

-- Sigue la convencion de la base: nombre en singular y PK id_<tabla>.
-- NO lleva columna `habilita`: una fila de auditoria no se da de baja nunca.
-- Si se pudiera desactivar, dejaria de servir como prueba.
--
-- El estado va como TEXTO ('NOTIF2_PENDIENTE') y no como id_estado: el estado
-- que ve el area es compuesto ("2da notificacion pendiente" no es una fila de
-- la tabla `estado`, se deduce de que vencio la primera).
CREATE TABLE IF NOT EXISTS auditoria (
  id_auditoria     int(11)      NOT NULL AUTO_INCREMENT,
  id_local         int(11)      NOT NULL COMMENT 'El local cuyo estado cambio',
  estado_anterior  varchar(40)  NULL     COMMENT 'NULL en el punto de partida',
  estado_nuevo     varchar(40)  NOT NULL COMMENT 'Codigo del estado (src/dominio/estados.js) o BAJA',
  motivo           varchar(250) NOT NULL COMMENT 'Por que cambio, en castellano',
  accion           varchar(60)  NULL     COMMENT 'Que acto lo produjo: generar-cedula, registrar-entrega, paso-del-tiempo...',
  id_tramite       int(11)      NULL     COMMENT 'El tramite que lo produjo, si lo hubo',
  id_usuario       int(11)      NULL     COMMENT 'Quien, si es un agente cargado en la tabla usuario',
  actor            varchar(120) NOT NULL COMMENT 'Quien, como se lo identifico (legajo) o Sistema',
  momento          datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_auditoria),
  KEY ix_auditoria_local (id_local, id_auditoria),
  KEY ix_auditoria_momento (momento)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- COMPROBACION
-- ============================================================================
SELECT COUNT(*) AS filas_de_auditoria FROM auditoria;
