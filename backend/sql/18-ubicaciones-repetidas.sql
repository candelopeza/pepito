-- ============================================================================
-- backend/sql/18-ubicaciones-repetidas.sql
-- ----------------------------------------------------------------------------
-- LOCALES CON UNA UBICACIÓN QUE NO ES LA SUYA (24/11/2026).
--
-- Ambiente detectó que toda dirección sobre la avenida Belgrano quedaba en la
-- Belgrano 2642. La causa: cuando el mapa (OpenStreetMap) no tiene cargada la
-- altura de una calle, el geocodificador devolvía un punto de LA CALLE (o de
-- LA CIUDAD) y el sistema lo guardaba como si fuera la dirección. El código ya
-- está corregido (backend/geocodificador.js). Este script limpia lo que quedó
-- mal en la base: el 24/11/2026 eran 247 locales repartidos en 87 puntos, cada
-- punto compartido por direcciones distintas (J. B. Justo 1100 a 1592 en un
-- mismo punto, Entre Ríos 3098 a 3388, 9 de Julio, Las Heras...).
--
-- QUÉ HACE: a esos locales les saca la coordenada. Quedan "sin ubicación" y
-- aparecen en Mapa -> Geocodificación pendiente. Ahí:
--   1. "Reintentar geocodificación" ubica solos los que el mapa tiene con
--      esa altura (con el código nuevo, sin inventar);
--   2. el resto se ubica a mano con "Ubicar en el mapa".
-- Mientras estén sin ubicación no aparecen en el mapa ni en la hoja de ruta
-- de los notificadores: es preferible a mandarlos a un lugar equivocado.
--
-- ANTES DE BORRAR, GUARDA UN RESPALDO en la tabla respaldo_coordenadas_241126
-- (id, latitud, longitud, dirección). Para deshacer, el bloque del final.
--
-- Se corre UNA vez en HeidiSQL, en una pestaña nueva (Ctrl+T), con F9.
-- ============================================================================

USE smt_grandes_generadores;

-- 1) Cuáles son (solo mirar): tiene que dar cerca de 247 filas.
SELECT l.id_local, l.nombre_local, l.direccion_local, l.latitud_local, l.longitud_local
  FROM local l
  JOIN (SELECT * FROM (
          SELECT latitud_local la, longitud_local lo
            FROM local
           WHERE habilita = 1 AND latitud_local IS NOT NULL
           GROUP BY latitud_local, longitud_local
          HAVING COUNT(DISTINCT UPPER(TRIM(direccion_local))) > 1) x) g
    ON l.latitud_local = g.la AND l.longitud_local = g.lo
 WHERE l.habilita = 1
 ORDER BY l.latitud_local, l.longitud_local, l.direccion_local;

-- 2) El respaldo.
CREATE TABLE IF NOT EXISTS respaldo_coordenadas_241126 AS
SELECT l.id_local, l.direccion_local, l.latitud_local, l.longitud_local, NOW() AS respaldado_en
  FROM local l
  JOIN (SELECT * FROM (
          SELECT latitud_local la, longitud_local lo
            FROM local
           WHERE habilita = 1 AND latitud_local IS NOT NULL
           GROUP BY latitud_local, longitud_local
          HAVING COUNT(DISTINCT UPPER(TRIM(direccion_local))) > 1) x) g
    ON l.latitud_local = g.la AND l.longitud_local = g.lo
 WHERE l.habilita = 1;

-- Comprobación: la misma cantidad que el paso 1.
SELECT COUNT(*) AS respaldados FROM respaldo_coordenadas_241126;

-- 3) Sacarles la coordenada (solo a los del respaldo).
UPDATE local l
  JOIN respaldo_coordenadas_241126 r ON r.id_local = l.id_local
   SET l.latitud_local = NULL, l.longitud_local = NULL;

-- Comprobación: ya no tiene que quedar ningún punto compartido por direcciones distintas.
SELECT COUNT(*) AS puntos_repetidos_que_quedan FROM (
  SELECT 1 FROM local
   WHERE habilita = 1 AND latitud_local IS NOT NULL
   GROUP BY latitud_local, longitud_local
  HAVING COUNT(DISTINCT UPPER(TRIM(direccion_local))) > 1) x;

-- ----------------------------------------------------------------------------
-- PARA DESHACER (devolver las coordenadas de antes), descomentar y correr:
-- ----------------------------------------------------------------------------
-- UPDATE local l
--   JOIN respaldo_coordenadas_241126 r ON r.id_local = l.id_local
--    SET l.latitud_local = r.latitud_local, l.longitud_local = r.longitud_local
--  WHERE l.latitud_local IS NULL;
