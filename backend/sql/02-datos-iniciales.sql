-- ############################################################################
-- ##  OBSOLETO - NO EJECUTAR ESTE ARCHIVO
-- ############################################################################
-- Pertenece al esquema que se habia inventado antes de conocer la base real
-- (tablas `locales`, `actuaciones`, `relevamientos`). Ese esquema NO existe.
--
-- La base real es smt_grandes_generadores, con 2.220 locales y 2.441 tramites
-- cargados por el area. Este script empieza con un DROP TABLE y, si por error
-- se corriera contra una base con esos nombres, borraria datos de trabajo.
--
-- Lo que SI hay que correr es sql/03-tablas-faltantes.sql.
-- Se conserva solo como referencia historica del diseno original.
-- ############################################################################

-- ============================================================================
-- backend/sql/02-datos-iniciales.sql  —  LO MÍNIMO PARA QUE EL SISTEMA ARRANQUE
-- ----------------------------------------------------------------------------
-- Se corre después de 01-crear-tablas.sql, desde HeidiSQL.
-- Son los catálogos y parámetros de src/datos/semilla.js. NO carga locales de
-- prueba: el padrón real viene del Excel del área (importador pendiente).
-- ============================================================================
USE grandes_generadores;

-- Parámetros del sistema (sección 4.1) + plantilla de la cédula (sección 6.4)
INSERT INTO parametros (id, plazo_notif1, plazo_notif2, contar_dia_entrega, modo_bisiesto,
                        exigir_datos_siempre, emision_automatica, tope_prorroga_dias,
                        max_prorrogas_por_local, plantilla_cedula)
VALUES (1, 5, 3, 0, '01-mar', 1, 0, 30, 1,
'MUNICIPALIDAD DE SAN MIGUEL DE TUCUMÁN
Secretaría de Ambiente y Sustentabilidad — Dirección de Ambiente

CÉDULA DE NOTIFICACIÓN N° {numeroCedula}
{instanciaTexto}

Establecimiento: {nombreLocal}
Razón social: {razonSocial}
CUIT: {cuit}
Domicilio: {direccion}
Rubro: {rubro}

Por la presente se intima al titular del establecimiento a acreditar, en el
plazo de {plazoDias} días hábiles contados desde la recepción de esta cédula,
la gestión de sus residuos por vía propia, mediante alguna de las siguientes
formas:

  a) contrato vigente con prestador habilitado del servicio de recolección;
  b) Declaración Jurada de gestión de residuos;
  c) Declaración Jurada de Separación de Residuos (reciclaje).

La falta de presentación en el plazo indicado dará lugar a las actuaciones
administrativas que correspondan.

San Miguel de Tucumán, {fechaEmision}.');

-- Secuencias (sección 5.4): arrancan del último número emitido en el sistema viejo
INSERT INTO secuencias (nombre, valor) VALUES
  ('cedula', 1284),
  ('expediente', 96);

-- Rubros (sección 5.2)
INSERT INTO rubros (nombre) VALUES
  ('Supermercado'), ('Industria'), ('Gastronomía'), ('Hotelería'),
  ('Salud'), ('Comercio mayorista'), ('Servicios'), ('Shopping / Galería');

-- Feriados 2026 (sección 4.1). Los años siguientes se cargan desde Configuración → Feriados.
INSERT INTO feriados (fecha, motivo, alcance) VALUES
  ('2026-01-01', 'Año Nuevo', 'nacional'),
  ('2026-03-24', 'Día de la Memoria', 'nacional'),
  ('2026-04-02', 'Día del Veterano y de los Caídos en Malvinas', 'nacional'),
  ('2026-05-01', 'Día del Trabajador', 'nacional'),
  ('2026-05-25', 'Revolución de Mayo', 'nacional'),
  ('2026-06-20', 'Paso a la Inmortalidad del Gral. Belgrano', 'nacional'),
  ('2026-07-09', 'Día de la Independencia', 'nacional'),
  ('2026-08-17', 'Paso a la Inmortalidad del Gral. San Martín', 'nacional'),
  ('2026-09-24', 'Batalla de Tucumán', 'provincial'),
  ('2026-10-12', 'Día del Respeto a la Diversidad Cultural', 'nacional'),
  ('2026-10-24', 'Fundación de San Miguel de Tucumán (asueto)', 'municipal'),
  ('2026-11-23', 'Día de la Soberanía Nacional', 'nacional'),
  ('2026-12-08', 'Inmaculada Concepción', 'nacional'),
  ('2026-12-25', 'Navidad', 'nacional');

-- Usuarios (sección 7.1). Identidad institucional; alta y baja desde Configuración → Usuarios.
INSERT INTO usuarios (nombre, email, rol, activo) VALUES
  ('Mariano Agustín',       'magustin@smt.gob.ar', 'coordinacion',   1),
  ('Candelaria Peza',       'cpeza@smt.gob.ar',    'administrativo', 1),
  ('Jorge Medina',          'jmedina@smt.gob.ar',  'relevador',      1),
  ('Lucía Sosa',            'lsosa@smt.gob.ar',    'notificador',    1),
  ('Raúl Ibáñez',           'ribanez@smt.gob.ar',  'notificador',    1),
  ('Dirección de Ambiente', 'ambiente@smt.gob.ar', 'direccion',      1),
  ('Sistema',               'sistema@smt.gob.ar',  'sistema',        1);
