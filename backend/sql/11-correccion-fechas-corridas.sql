-- ============================================================================
-- backend/sql/11-correccion-fechas-corridas.sql
-- ----------------------------------------------------------------------------
-- CORRECCION DE DATOS (2026-10-21): 39 documentos quedaron con la fecha de
-- emision EN EL FUTURO, algo imposible. El patron: en la carga original se
-- guardo el vencimiento real en el campo emision, y el sistema calculo el
-- vencimiento un anio mas alla (ej.: DDJJ cargada el 25/06/2026 con emision
-- 23/06/2027 y vencimiento 23/06/2028; la realidad: emitida el 23/06/2026,
-- vence el 23/06/2027).
--
-- LA CORRECCION: restar UN anio a la emision y al vencimiento (del documento
-- y del tramite). La relacion emision -> vencimiento se conserva tal cual y
-- la emision queda en el pasado, como corresponde.
--
-- ES SEGURO CORRERLO: solo toca los documentos cuya emision es FUTURA al
-- momento de correrlo (ninguna emision legitima puede serlo); correrlo dos
-- veces no vuelve a restar, porque despues de la primera ya no hay futuras.
--
-- Se corre desde HeidiSQL: Archivo > Cargar archivo SQL > F9.
-- ============================================================================

USE smt_grandes_generadores;

-- PASO 1 (mirar antes de tocar): cuales son
SELECT d.id_tramite, t.id_local, d.numero,
       DATE(t.fecha_inicio)      AS cargado_el,
       DATE(d.fecha_emision)     AS emision_imposible,
       DATE(d.fecha_vencimiento) AS vencimiento
  FROM documentacion d
  JOIN tramite t ON t.id_tramite = d.id_tramite
 WHERE d.habilita = 1 AND t.habilita = 1 AND d.fecha_emision > NOW()
 ORDER BY d.fecha_emision;

-- PASO 2: la correccion (un anio menos en los dos campos, con constancia)
UPDATE documentacion d
  JOIN tramite t ON t.id_tramite = d.id_tramite
   SET d.fecha_emision      = DATE_SUB(d.fecha_emision, INTERVAL 1 YEAR),
       d.fecha_vencimiento  = DATE_SUB(d.fecha_vencimiento, INTERVAL 1 YEAR),
       t.fecha_vencimiento  = IF(t.fecha_vencimiento IS NULL, NULL,
                                 DATE_SUB(t.fecha_vencimiento, INTERVAL 1 YEAR)),
       t.observaciones      = LEFT(CONCAT_WS(' · ', NULLIF(t.observaciones, ''),
         'Regularización 21/10/2026: fechas corridas un año en la carga original.'), 150)
 WHERE d.habilita = 1 AND t.habilita = 1 AND d.fecha_emision > NOW();

-- PASO 3 (verificar): tiene que dar CERO
SELECT COUNT(*) AS emisiones_futuras_que_quedan
  FROM documentacion d
  JOIN tramite t ON t.id_tramite = d.id_tramite
 WHERE d.habilita = 1 AND t.habilita = 1 AND d.fecha_emision > NOW();
