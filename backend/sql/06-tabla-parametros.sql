-- ============================================================================
-- backend/sql/06-tabla-parametros.sql
-- ----------------------------------------------------------------------------
-- OPCIONAL. Permite que la Direccion cambie los plazos y la plantilla de la
-- cedula desde la aplicacion, sin programador (secciones 4.1 y 6.4 de la
-- guia).
--
-- SIN ESTA TABLA: los valores siguen en backend/parametros-sistema.js y las
-- pantallas de Parametros y Plantilla los muestran, pero no los guardan.
--
-- COMO FUNCIONA: una fila por parametro que la Direccion cambio. Lo que no
-- esta en la tabla vale lo del archivo. Recien creada la tabla esta vacia y el
-- sistema sigue con los valores de siempre (5 y 3 dias habiles, etc.).
--
-- El valor va en JSON: 5, true, "01-mar", o el texto entero de la plantilla.
-- Si alguien lo edita a mano en HeidiSQL y le erra al formato, el backend lo
-- ignora y usa el del archivo, en vez de romper los calculos de plazo.
--
-- OJO: cambiar un plazo NO recalcula los vencimientos ya guardados. Cada
-- notificacion conserva el plazo que se le aplico al entregarse.
--
-- ES SEGURO CORRERLO: CREATE TABLE IF NOT EXISTS, sin DROP ni DELETE, no toca
-- ninguna otra tabla, correrlo dos veces no hace nada.
-- ============================================================================

USE smt_grandes_generadores;

CREATE TABLE IF NOT EXISTS parametro (
  clave           varchar(60)  NOT NULL COMMENT 'plazoNotif1, plazoNotif2, plantillaCedula...',
  valor           mediumtext   NOT NULL COMMENT 'El valor en JSON',
  modificado_por  varchar(120) NULL     COMMENT 'Quien lo cambio por ultima vez',
  modificado_en   datetime     NULL     COMMENT 'Cuando',
  PRIMARY KEY (clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT COUNT(*) AS parametros_guardados FROM parametro;
