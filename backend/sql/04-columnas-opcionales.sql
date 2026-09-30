-- ============================================================================
-- backend/sql/04-columnas-opcionales.sql
-- ----------------------------------------------------------------------------
-- OPCIONAL. NO hace falta para que el sistema funcione.
--
-- Agrega tres columnas que habilitan dos funciones hoy desactivadas. Se dejan
-- preparadas acá para el dia que se necesiten; mientras no se corran, el
-- backend funciona igual y avisa que esas dos funciones no estan disponibles.
--
-- ADD COLUMN es ADITIVO: agrega la columna con NULL en todas las filas y no
-- toca ningun dato cargado. Con 2.200 y 2.400 filas es instantaneo. Ademas usa
-- IF NOT EXISTS (MariaDB 10.5), asi que correrlo dos veces no hace nada.
-- ============================================================================

USE smt_grandes_generadores;

-- ----------------------------------------------------------------------------
-- 1. Constancia de impresion de la cedula (seccion 9.6)
-- ----------------------------------------------------------------------------
-- QUE HABILITA: el endpoint POST /notificaciones/:id/impresion, que hoy
-- responde 501. Sirve para saber si una cedula ya se imprimio y quien lo hizo,
-- y asi evitar tanto la reimpresion innecesaria como el olvido.
--
-- SIN ESTAS COLUMNAS: el area no tiene forma de saber desde el sistema si una
-- cedula salio por la impresora.
ALTER TABLE tramite
  ADD COLUMN IF NOT EXISTS impresa_por varchar(120) NULL COMMENT 'Quien imprimio la cedula',
  ADD COLUMN IF NOT EXISTS impresa_en  datetime     NULL COMMENT 'Cuando se imprimio la cedula';

-- ----------------------------------------------------------------------------
-- 2. Fusion de duplicados (seccion 9.4)
-- ----------------------------------------------------------------------------
-- QUE HABILITA: guardar en un campo propio en que local se unifico una ficha
-- duplicada, en vez de dejar la marca dentro de `local.observacion`.
--
-- SIN ESTA COLUMNA: la fusion funciona igual, pero el rastro queda como texto
-- en la observacion ("FUSIONADO EN LOCAL 567 ..."), que es legible para una
-- persona pero fragil para consultarlo desde una consulta SQL.
ALTER TABLE local
  ADD COLUMN IF NOT EXISTS id_fusionado_en int(6) NULL COMMENT 'Si se fusiono, id_local del principal que lo absorbio';

-- Si ya habia fusiones hechas con la marca de texto, esto las pasa a la columna
-- nueva. Es seguro correrlo aunque no haya ninguna: no actualiza nada.
UPDATE local
   SET id_fusionado_en = CAST(REGEXP_SUBSTR(observacion, '[0-9]+') AS UNSIGNED)
 WHERE habilita = 0
   AND observacion LIKE 'FUSIONADO EN LOCAL%'
   AND id_fusionado_en IS NULL;

-- ============================================================================
-- DESPUES DE CORRER ESTE SCRIPT
-- ----------------------------------------------------------------------------
-- Hay que habilitar el codigo que las usa, que quedo escrito y comentado:
--   backend/rutas/notificaciones.js  -> POST /:id/impresion
--   backend/mapeo.js                 -> impresaPor / impresaEn en aActuacionFront
-- ============================================================================

SELECT 'Columnas agregadas (deben ser 3)' AS control,
       (SELECT COUNT(*) FROM information_schema.columns
         WHERE table_schema = 'smt_grandes_generadores'
           AND ((table_name = 'local'   AND column_name = 'id_fusionado_en')
             OR (table_name = 'tramite' AND column_name IN ('impresa_por', 'impresa_en')))) AS valor;
