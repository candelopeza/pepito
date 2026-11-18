-- ============================================================================
-- backend/sql/16-nombre-usuario.sql
-- ----------------------------------------------------------------------------
-- EL NOMBRE DE CADA AGENTE (18/11/2026).
--
-- La tabla `usuario` guarda solo el número de persona de CiDiTuc (id_persona),
-- y el sistema lo mostraba como si fuera el nombre: en el desplegable de
-- notificadores, en Accesos, en el historial, en las firmas. El número de
-- persona es un dato sensible y no tiene que verlo nadie. Este script agrega
-- la columna donde se guarda el nombre real.
--
-- CÓMO SE LLENA:
--   - Solo: cada vez que un agente entra por CiDiTuc, el backend guarda el
--     nombre que le devuelve CiDiTuc (CIDITUC_URL_PERSONA en backend/.env).
--   - A mano: en Accesos → Usuarios, el campo "Nombre y apellido". Sirve para
--     los agentes que todavía no entraron nunca.
--   Mientras un agente no tenga nombre, el sistema muestra su tipo de usuario
--   y el número interno del usuario (por ejemplo "Relevador N° 3, sin nombre"),
--   nunca su número de persona.
--
-- ADD COLUMN es ADITIVO: agrega la columna con NULL en todas las filas y no
-- toca ningún dato. Usa IF NOT EXISTS (MariaDB 10.5): correrlo dos veces no
-- hace nada. El backend se entera solo en 5 minutos, o al reiniciarlo.
-- ============================================================================

USE smt_grandes_generadores;

ALTER TABLE usuario
  ADD COLUMN IF NOT EXISTS nombre_completo varchar(150) NULL COMMENT 'Nombre y apellido del agente (de CiDiTuc o cargado en Accesos)';

-- Comprobación: tiene que aparecer una fila con nombre_completo.
SHOW COLUMNS FROM usuario LIKE 'nombre_completo';

-- OPCIONAL: cargar ya los nombres de los agentes que conozcas, para no
-- esperar a que entren. Cambiar el nombre y el número de persona.
-- UPDATE usuario SET nombre_completo = 'Nombre Apellido' WHERE id_persona = '000000';
