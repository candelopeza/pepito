-- ============================================================================
-- backend/sql/17-correcciones-19-11.sql
-- ----------------------------------------------------------------------------
-- CUATRO CORRECCIONES (19/11/2026). Se corre UNA vez en HeidiSQL, en una
-- pestaña nueva y vacía (Ctrl+T), con F9. Se puede correr de nuevo sin
-- problema: la segunda vez no cambia nada.
-- ============================================================================

USE smt_grandes_generadores;

-- ----------------------------------------------------------------------------
-- 1) EL CUIL DEL TITULAR NO SE PODÍA GUARDAR
-- ----------------------------------------------------------------------------
-- En esta base la columna local.titular_cuil quedó creada como NÚMERO
-- (int(14)) en vez de texto. El CUIL se guarda con guiones ("20-12345678-9"),
-- que no es un número, y además 11 cifras no entran en un int: por eso al
-- crear o modificar un local con el CUIL cargado saltaba un error, y sin el
-- CUIL no. Por lo mismo tampoco había entrado el local de prueba de la
-- capacitación (sql/15).
--
-- Se pasa a texto, como dice sql/12. Hoy la columna está vacía en todos los
-- locales (se comprobó el 19/11/2026), así que no se pierde ningún dato.
ALTER TABLE local MODIFY COLUMN titular_cuil varchar(13) NULL
  COMMENT 'CUIL de la persona habilitada en el portal (con guiones)';

-- Comprobación: tiene que decir varchar(13).
SHOW COLUMNS FROM local LIKE 'titular_cuil';


-- ----------------------------------------------------------------------------
-- 2) EL RELEVADOR NO VEÍA EL PADRÓN
-- ----------------------------------------------------------------------------
-- El sistema le da al relevador la consulta del padrón, pero desde Accesos ->
-- Tipos de usuario alguien se lo había quitado ("Padrón de locales":
-- relevador = no). Borrar ese renglón lo devuelve a lo que trae el sistema:
-- el relevador VE el padrón, no lo modifica.
-- (Lo mismo se puede hacer desde la app: Accesos -> Tipos de usuario, como
-- administrador.)
DELETE FROM permisos_modulos WHERE modulo = 'locales' AND rol = 'relevador';

-- Comprobación: no tiene que aparecer ninguna fila.
SELECT * FROM permisos_modulos WHERE modulo = 'locales' AND rol = 'relevador';


-- ----------------------------------------------------------------------------
-- 3) LAS CARGAS DE PRUEBA DEL INFORME 9 DE JULIO
-- ----------------------------------------------------------------------------
-- El historial del Informe 9 de Julio mostraba decenas de cargas de prueba
-- (la mayoría de "Prueba automática 9DJ"). Todas están DESCARTADAS (nunca se
-- aplicaron) o ANULADAS (lo que habían creado ya se deshizo al anularlas), así
-- que esconderlas no cambia ningún local, contrato ni estado.
--
-- Es una baja lógica (habilita = 0), como en el resto del sistema: no se
-- borra la fila, deja de mostrarse.
UPDATE informe_9dj
   SET habilita = 0
 WHERE estado IN ('DESCARTADO', 'ANULADO') AND habilita = 1;

-- La carga "informe_9dj_prueba2.xlsx" que quedó a medio revisar (en revisión,
-- nunca aplicada): se descarta y se esconde. Mientras esté abierta, además,
-- no deja cargar un informe nuevo (una revisión a la vez).
UPDATE informe_9dj
   SET estado = 'DESCARTADO', habilita = 0
 WHERE estado = 'EN_REVISION' AND nombre_archivo LIKE '%prueba%';

-- OJO: queda UNA carga APLICADA, "informe3.xlsx" (04/11/2026), que creó 4
-- contratos. Si también fue una prueba, NO se esconde con SQL: primero hay que
-- ANULARLA desde la app (Informe 9 de Julio -> la carga -> Anular, con
-- coordinación o dirección), que es lo que da de baja esos contratos. Después
-- se vuelve a correr este script y desaparece del historial.

-- Comprobación: tienen que quedar solo las cargas reales.
SELECT id_informe, nombre_archivo, fecha_carga, estado
  FROM informe_9dj
 WHERE habilita = 1
 ORDER BY fecha_carga DESC;


-- ----------------------------------------------------------------------------
-- 4) DAR DE ALTA A UN AGENTE CON SU CUIL
-- ----------------------------------------------------------------------------
-- Para dar de alta a alguien en Accesos -> Usuarios hacía falta su número de
-- persona de CiDiTuc, que nadie conoce. Desde ahora se lo da de alta con su
-- CUIL: queda "esperando el primer ingreso", y la primera vez que esa persona
-- entra por CiDiTuc el sistema la reconoce por su documento y la vincula sola.
--
-- ADD COLUMN es ADITIVO: agrega la columna vacía y no toca ningún dato.
ALTER TABLE usuario
  ADD COLUMN IF NOT EXISTS cuil varchar(13) NULL COMMENT 'CUIL del agente (con guiones), para el alta desde Accesos';

-- Comprobación: tiene que aparecer una fila con cuil.
SHOW COLUMNS FROM usuario LIKE 'cuil';
