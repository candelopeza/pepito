/* ============================================================================
   backend/personas.js  —  EL NOMBRE QUE SE MUESTRA DE CADA AGENTE
   ----------------------------------------------------------------------------
   >>> EL NÚMERO DE PERSONA NO SE MUESTRA NUNCA (18/11/2026) <<<
   La tabla `usuario` identifica a cada agente por su número de persona de
   CiDiTuc (id_persona). Ese número es un dato sensible: no tiene que aparecer
   en ninguna pantalla, ni en el historial, ni en una firma. Hasta ahora el
   sistema lo usaba como "nombre" porque la base no tenía otro.

   De dónde sale el nombre ahora:
     1. la columna usuario.nombre_completo (sql/16-nombre-usuario.sql), que se
        llena sola cuando el agente entra por CiDiTuc (middlewares/usuario.js)
        o a mano desde Accesos → Usuarios;
     2. si todavía no tiene nombre: su tipo de usuario y el número INTERNO del
        usuario (id_usuario, un correlativo de la tabla, no un dato de la
        persona): "Relevador N° 3, sin nombre".

   Lo viejo guardado con el número (el autor de cada trámite, el `actor` de la
   auditoría, "Aprobada por 151880" en las observaciones, quién imprimió) se
   traduce al LEER con nombreDeActor() y sinNumerosDePersona(): no se reescribe
   la base.
   ============================================================================ */

import { consultar } from './conexion-bd.js';
import { tiene } from './capacidades.js';
import { ROL_POR_TUSUARIO } from './mapeo.js';

const ETIQUETA_ROL = {
  relevador: 'Relevador',
  notificador: 'Notificador',
  administrativo: 'Administrativo',
  coordinacion: 'Coordinación',
  direccion: 'Dirección',
  administrador: 'Administrador',
  titular: 'Titular',
  sistema: 'Sistema',
};

/* El texto para alguien que no está en la tabla de usuarios: un titular que
   pidió una prórroga, o un agente borrado. Nunca el número. */
export const SIN_NOMBRE = 'Persona sin nombre registrado';

export function etiquetaRol(rol) {
  return ETIQUETA_ROL[rol] ?? 'Agente';
}

/* El nombre visible de una fila de `usuario` (ya pasada a camelCase). */
export function nombreVisible(fila) {
  const nombre = String(fila?.nombreCompleto ?? '').trim();
  if (nombre) return nombre;
  const rol = ROL_POR_TUSUARIO[fila?.idTusuario] ?? 'sistema';
  return `${etiquetaRol(rol)} N° ${fila?.idUsuario ?? '?'}, sin nombre`;
}

/* Caché número de persona → nombre visible, con TODOS los usuarios (también
   los dados de baja: firmaron trámites viejos). Se renueva cada minuto. */
let porPersona = new Map();
let vence = 0;
const DURACION_MS = 60_000;

export async function asegurarPersonas(fresco = false) {
  if (!fresco && Date.now() < vence) return;
  try {
    const columnas = tiene('nombreUsuario') ? 'id_usuario, id_persona, id_tusuario, nombre_completo' : 'id_usuario, id_persona, id_tusuario';
    const filas = await consultar(`SELECT ${columnas} FROM usuario`);
    porPersona = new Map(filas.map((f) => [String(f.idPersona ?? '').trim(), nombreVisible(f)]));
    vence = Date.now() + DURACION_MS;
  } catch {
    // Si la base no responde se queda con lo que tenía: peor es mostrar números.
  }
}

export function olvidarPersonas() {
  vence = 0;
}

/* Un autor guardado como texto: si es un número de persona, su nombre. Los
   textos que ya son nombres ("Sistema", "Candelaria Peza") pasan igual. */
export function nombreDeActor(texto) {
  if (texto === null || texto === undefined) return texto;
  const t = String(texto).trim();
  if (!/^\d+$/.test(t)) return texto;
  return porPersona.get(t) ?? SIN_NOMBRE;
}

/* Observaciones viejas que llevan el número de quien firmó: "Aprobada por
   151880", "Rechazada por 151880", y la marca de una fusión de duplicados:
   "(151880, 2026-11-10)". Solo números de 5 dígitos o más en esos dos
   lugares, para no tocar "por 30 días" ni un número de local. */
export function sinNumerosDePersona(texto) {
  if (!texto) return texto;
  return String(texto)
    .replace(/\b(por) (\d{5,})\b/gi, (_m, por, numero) => `${por} ${nombreDeActor(numero)}`)
    .replace(/\((\d{5,}), (\d{4}-\d{2}-\d{2})\)/g, (_m, numero, fecha) => `(${nombreDeActor(numero)}, ${fecha})`);
}

/* ============================================================================
   ALTA POR CUIL (19/11/2026)
   ----------------------------------------------------------------------------
   Quien da de alta a un agente en Accesos no conoce su número de persona de
   CiDiTuc (ni tiene por qué). Lo da de alta con su CUIL: la fila queda en
   `usuario` con id_persona vacío ("esperando el primer ingreso"). La primera
   vez que esa persona entra por CiDiTuc, CiDiTuc nos dice su documento
   (documento_persona, en cidituc.js) y el número de persona (el token): si el
   documento corresponde al CUIL de una fila pendiente, se completa el
   id_persona y desde ahí entra con su rol (middlewares/usuario.js).

   CiDiTuc puede devolver el CUIL entero o solo el DNI. Los dos sirven: el DNI
   son los 8 números del medio del CUIL (20-12345678-9 -> 12345678).
   ============================================================================ */

/* Solo los números. "20-12.345.678-9" -> "20123456789". */
export function soloDigitos(texto) {
  return String(texto ?? '').replace(/\D/g, '');
}

/* Un CUIL escrito de cualquier forma -> "20-12345678-9", o null si no tiene
   11 números. */
export function formatoCuil(texto) {
  const d = soloDigitos(texto);
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : null;
}

/* ¿El documento que devolvió CiDiTuc es de la persona de este CUIL? */
export function mismaPersona(documento, cuil) {
  const doc = soloDigitos(documento);
  const c = soloDigitos(cuil);
  if (c.length !== 11 || !doc) return false;
  if (doc.length === 11) return doc === c;
  if (doc.length >= 6 && doc.length <= 8) return c.slice(2, 10).replace(/^0+/, '') === doc.replace(/^0+/, '');
  return false;
}
