-- ============================================================================
-- backend/sql/15-local-capacitacion.sql
-- ----------------------------------------------------------------------------
-- LOCAL DE PRUEBA PARA LA CAPACITACIÓN (17/11/2026).
--
-- Da de alta un local inventado y lo vincula con una persona, para mostrar en
-- la capacitación cómo ve el sistema un titular de local desde el portal.
--
-- >>> CÓMO VINCULA EL PORTAL A UN TITULAR CON SUS LOCALES <<<
-- Por el CUIL, no por el usuario. Cuando la persona entra por CiDiTuc, el
-- backend le pide a CiDiTuc su CUIL (CIDITUC_URL_PERSONA en backend/.env) y el
-- portal muestra los locales cuyo `titular_cuil` es ese CUIL. Por eso:
--   1. Hay que escribir abajo, en @cuil, el CUIL de la persona que va a
--      entrar como titular en la demostración.
--   2. El backend del servidor tiene que estar actualizado y con la línea
--      CIDITUC_URL_PERSONA: sin eso no llega el CUIL y el portal no encuentra
--      el local. Se comprueba en GET /salud: tiene que aparecer
--      "ciditucNombre" con "resultado": "ok" después de entrar.
--   3. La persona tiene que entrar con el rol TITULAR. Si está cargada en la
--      tabla `usuario` con otro tipo (por ejemplo administrador), el portal no
--      se le muestra. Para la demostración, cambiarle el tipo a 7 (titular) y
--      después devolverle el suyo. Está al final, comentado.
--
-- `id_usuario` = 2 queda como quien dio de alta el local, como pidió cande.
-- El local arranca en "Revisión de datos pendiente" (id_estado 2), igual que
-- un alta manual del sistema: no entra a la cola de emisión hasta que
-- coordinación lo habilite. Así se puede mostrar el circuito entero desde los
-- dos lados (oficina y portal) avanzándolo a mano durante la capacitación.
--
-- OJO: si en la capacitación se emite una cédula para este local, usa un
-- número de cédula real de la secuencia. Y el local suma en tablero y
-- reportes mientras exista. Para sacarlo, el bloque de BAJA del final.
-- ============================================================================

USE smt_grandes_generadores;

-- >>> COMPLETAR: el CUIL de quien va a entrar como titular, con guiones. <<<
SET @cuil = '27-00000000-0';

INSERT INTO local
  (cuit, id_usuario, id_rubro, id_estado, razon_social, nombre_local,
   direccion_local, observacion, bloqueado, habilita, titular_cuil)
VALUES
  (@cuil, 2, 1, 2, 'LOCAL DE PRUEBA SRL', 'LOCAL DE PRUEBA - CAPACITACION',
   '24 DE SEPTIEMBRE 1', 'Local inventado para la capacitacion del 17/11/2026. No es real.',
   0, 1, @cuil);

-- Comprobación: tiene que aparecer una fila con el CUIL que escribiste.
SELECT id_local, nombre_local, titular_cuil, id_estado, habilita
  FROM local
 WHERE nombre_local = 'LOCAL DE PRUEBA - CAPACITACION';

-- ----------------------------------------------------------------------------
-- PARA LA DEMOSTRACIÓN: entrar como titular (descomentar y poner el número
-- de persona de CiDiTuc de quien va a entrar).
-- ----------------------------------------------------------------------------
-- SELECT id_usuario, id_persona, id_tusuario FROM usuario WHERE id_usuario = 2;   -- anotar el id_tusuario actual
-- UPDATE usuario SET id_tusuario = 7 WHERE id_usuario = 2;                       -- 7 = titular
-- ...y al terminar, devolverle el que tenía (8 = administrador):
-- UPDATE usuario SET id_tusuario = 8 WHERE id_usuario = 2;

-- ----------------------------------------------------------------------------
-- BAJA DEL LOCAL DE PRUEBA, después de la capacitación. Es la baja lógica que
-- usa el sistema (habilita = 0): sale del padrón, del tablero y del portal.
-- No se borra porque, si se le emitió una cédula, hay trámites que lo apuntan.
-- ----------------------------------------------------------------------------
-- UPDATE tramite SET habilita = 0
--  WHERE id_local IN (SELECT id_local FROM local WHERE nombre_local = 'LOCAL DE PRUEBA - CAPACITACION');
-- UPDATE local SET habilita = 0 WHERE nombre_local = 'LOCAL DE PRUEBA - CAPACITACION';
