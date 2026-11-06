-- ============================================================================
-- 14-vaciar-usuarios.sql  —  SACAR TODOS LOS USUARIOS CARGADOS (2026-11-06)
-- ----------------------------------------------------------------------------
-- Pedido de la Dirección: que no quede ningún usuario, ni los de prueba ni los
-- administradores que se usaron para probar. Sin usuarios, la barra no ofrece
-- nada y el sistema abre directo en el portal del titular. De acá en más los
-- usuarios se cargan SOLO desde la base (ver al final cómo).
--
-- Se corre UNA vez, en HeidiSQL, sobre la base del sistema. Es seguro
-- correrlo de nuevo: no rompe nada.
--
-- POR QUÉ EN DOS PASOS: los trámites, la auditoría, las fotos y los
-- expedientes guardan `id_usuario` de quien los cargó. Borrar físicamente a un
-- usuario que firmó algo deja esas filas apuntando a nadie (verificar-base.js
-- lo marca como inconsistencia). Por eso: a los que firmaron algo se los da de
-- baja (habilita = 0, como hace la app) y se borra físicamente solo a los que
-- no firmaron nada.
-- ============================================================================

-- 1. Baja lógica de TODOS. Con esto ya ninguno puede entrar ni figura en la
--    barra (el backend solo reconoce usuarios con habilita = 1).
UPDATE usuario SET habilita = 0;

-- 2. Borrar físicamente a los que no dejaron rastro en ninguna tabla.
DELETE u FROM usuario u
 WHERE NOT EXISTS (SELECT 1 FROM tramite t
                    WHERE t.id_usuario = u.id_usuario
                       OR t.id_usuario_asignado = u.id_usuario)
   AND NOT EXISTS (SELECT 1 FROM auditoria a WHERE a.id_usuario = u.id_usuario)
   AND NOT EXISTS (SELECT 1 FROM archivo f WHERE f.id_usuario = u.id_usuario)
   AND NOT EXISTS (SELECT 1 FROM expediente_novedad e WHERE e.id_usuario = u.id_usuario);

-- 3. Qué quedó. Lo esperable: activos = 0; dados_de_baja = los que firmaron
--    trámites de prueba (quedan solo como referencia del historial).
SELECT
  (SELECT COUNT(*) FROM usuario WHERE habilita = 1) AS activos,
  (SELECT COUNT(*) FROM usuario WHERE habilita = 0) AS dados_de_baja;

-- ============================================================================
-- CÓMO CARGAR UN USUARIO REAL DESDE LA BASE (de ahora en más)
-- ----------------------------------------------------------------------------
-- id_persona  = el número de persona del agente en el padrón municipal (el
--               mismo que va a usar CiDiTuc). Es lo que se muestra como legajo.
-- id_tusuario = el tipo:  2 relevador · 3 notificador · 4 administrativo
--                         5 coordinación · 6 dirección · 8 administrador
--               (backend/mapeo.js, ROL_POR_TUSUARIO)
--
-- INSERT INTO usuario (id_persona, id_tusuario, habilita) VALUES ('140849', 8, 1);
--
-- El backend toma el cambio solo, en menos de un minuto (caché de usuarios).
-- Para sacar a alguien: UPDATE usuario SET habilita = 0 WHERE id_persona = '140849';
-- ============================================================================
