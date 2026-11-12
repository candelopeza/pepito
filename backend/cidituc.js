/* ============================================================================
   backend/cidituc.js  —  QUIÉN ES LA PERSONA SEGÚN EL TOKEN DE CiDiTuc
   ----------------------------------------------------------------------------
   CiDiTuc (el inicio de sesión único del municipio) abre el sistema con un
   TOKEN. El front lo captura de la dirección (src/auth/sesion.js) y lo manda
   en cada pedido como `Authorization: Bearer <token>`. Este archivo hace una
   sola cosa: dado ese token, decir qué persona es, o null si no vale.

   >>> CÓMO SE VERIFICA EL TOKEN LO DECIDE EL .env <<<
   Sistemas no había confirmado el mecanismo al 12/11/2026, así que las tres
   formas habituales están implementadas y se elige con una línea:

     CIDITUC_SECRETO=...         el token es un JWT firmado con un secreto
                                 compartido (HS256). Lo más común.
     CIDITUC_CLAVE_PUBLICA=...   el token es un JWT firmado por CiDiTuc con su
                                 clave privada (RS256 o ES256) y acá se
                                 verifica con la pública. Va el PEM entero en
                                 una línea, con \n donde van los saltos.
     CIDITUC_URL_VALIDAR=...     no se verifica acá: se le pregunta a CiDiTuc
                                 (GET a esa URL con el mismo Bearer; con
                                 CIDITUC_URL_METODO=POST manda { token } en el
                                 body) y se usa el JSON que devuelve.

   Sin ninguna de las tres, CiDiTuc está APAGADO: ningún token vale y nadie se
   identifica (todo el mundo es público, como antes). GET /salud lo muestra en
   `cidituc`.

   EL TOKEN REAL (12/11/2026): JWT HS256 firmado con el secreto compartido,
   llega en el parámetro `auth` de la URL y su cuerpo es
       { id: 151880, iat: ..., exp: ... }      (vence a las 24 horas)
   o sea que el número de persona viene como `id`.

   QUÉ SE LEE DEL TOKEN (o de la respuesta de la API):
     CIDITUC_CAMPO_PERSONA  (por defecto id_persona, y si no está, id)  el
                            número de persona en el padrón municipal. Es la
                            llave: con él se busca en la tabla `usuario`
                            (middlewares/usuario.js).
     CIDITUC_CAMPO_CUIL     (por defecto cuil)        para el portal del
                            titular, que vincula los locales por CUIL/CUIT.
     CIDITUC_CAMPO_NOMBRE   (por defecto nombre)      solo para saludar.
   Admiten ruta con puntos si el dato viene anidado: usuario.id_persona.
   Si el campo configurado no está, se prueban los nombres más comunes
   (idPersona, id_persona, persona, sub) antes de darse por vencido.
   ============================================================================ */

import crypto from 'node:crypto';

export function modoCidituc() {
  if (process.env.CIDITUC_URL_VALIDAR) return 'api';
  if (process.env.CIDITUC_CLAVE_PUBLICA) return 'jwt-clave-publica';
  if (process.env.CIDITUC_SECRETO) return 'jwt-secreto';
  return 'apagado';
}

/* ---------------------------------------------------------------------------
   1. JWT: cabecera.cuerpo.firma, cada parte en base64url
   --------------------------------------------------------------------------- */
function parteJson(parte) {
  return JSON.parse(Buffer.from(parte, 'base64url').toString('utf8'));
}

function pem(valor) {
  // En el .env va en una sola línea con "\n" literal: acá se vuelve multilínea.
  return String(valor).replace(/\\n/g, '\n').trim();
}

/* Devuelve el cuerpo del JWT si la firma es válida y no venció; null si no. */
function verificarJwt(token) {
  const partes = String(token).split('.');
  if (partes.length !== 3) return null;
  const [cab64, cuerpo64, firma64] = partes;

  let cabecera;
  try {
    cabecera = parteJson(cab64);
  } catch {
    return null;
  }
  const datos = Buffer.from(`${cab64}.${cuerpo64}`);
  const firma = Buffer.from(firma64, 'base64url');
  let valida = false;

  try {
    if (process.env.CIDITUC_CLAVE_PUBLICA) {
      // RS256 (RSA) y ES256 (curva elíptica): las dos usan SHA-256. Para ES256
      // la firma del JWT viene "cruda" (r||s), que es lo que pide ieee-p1363.
      const clave = { key: pem(process.env.CIDITUC_CLAVE_PUBLICA), dsaEncoding: 'ieee-p1363' };
      valida = ['RS256', 'ES256'].includes(cabecera.alg) && crypto.verify('sha256', datos, clave, firma);
    } else if (process.env.CIDITUC_SECRETO) {
      const esperada = crypto.createHmac('sha256', process.env.CIDITUC_SECRETO).update(datos).digest();
      valida = cabecera.alg === 'HS256' && esperada.length === firma.length && crypto.timingSafeEqual(esperada, firma);
    }
  } catch {
    valida = false;
  }
  if (!valida) return null;

  let cuerpo;
  try {
    cuerpo = parteJson(cuerpo64);
  } catch {
    return null;
  }
  const ahora = Math.floor(Date.now() / 1000);
  if (cuerpo.exp && Number(cuerpo.exp) < ahora) return null;
  if (cuerpo.nbf && Number(cuerpo.nbf) > ahora) return null;
  return cuerpo;
}

/* ---------------------------------------------------------------------------
   2. Preguntarle a CiDiTuc
   --------------------------------------------------------------------------- */
async function validarPorApi(token) {
  const url = process.env.CIDITUC_URL_VALIDAR;
  const porPost = String(process.env.CIDITUC_URL_METODO ?? 'GET').toUpperCase() === 'POST';
  const respuesta = await fetch(url, {
    method: porPost ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: porPost ? JSON.stringify({ token }) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  if (!respuesta.ok) return null;
  return respuesta.json();
}

/* ---------------------------------------------------------------------------
   3. Sacar la persona de lo que vino
   --------------------------------------------------------------------------- */
function valorEn(objeto, ruta) {
  if (!objeto || !ruta) return undefined;
  return String(ruta)
    .split('.')
    .reduce((acc, parte) => (acc == null ? undefined : acc[parte]), objeto);
}

function primero(objeto, rutas) {
  for (const r of rutas) {
    const v = valorEn(objeto, r);
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return null;
}

function personaDelCuerpo(cuerpo) {
  // El token real de CiDiTuc (visto el 12/11/2026) trae el número de persona
  // como `id`: { id: 151880, iat, exp }. Se deja primero `id_persona` por si
  // alguna vez lo mandan con el nombre de la tabla.
  const idPersona = primero(cuerpo, [
    process.env.CIDITUC_CAMPO_PERSONA || 'id_persona',
    'id_persona',
    'id',
    'idPersona',
    'persona',
    'usuario.id_persona',
    'sub',
  ]);
  if (idPersona === null) return null;
  return {
    idPersona: String(idPersona).trim(),
    cuil: primero(cuerpo, [process.env.CIDITUC_CAMPO_CUIL || 'cuil', 'cuil', 'cuit', 'usuario.cuil']),
    nombre: primero(cuerpo, [process.env.CIDITUC_CAMPO_NOMBRE || 'nombre', 'nombre', 'name', 'usuario.nombre']),
    vence: cuerpo?.exp ? new Date(Number(cuerpo.exp) * 1000).toISOString() : null,
  };
}

/* Caché corta por token: en modo API evita preguntarle a CiDiTuc en cada
   pedido (la app hace varios por pantalla). Un minuto, como la de usuarios. */
const cache = new Map();
const DURACION_CACHE_MS = 60_000;

/* { idPersona, cuil, nombre, vence } o null si el token no vale (firma mala,
   vencido, CiDiTuc apagado, o sin número de persona adentro). */
export async function personaDelToken(token) {
  if (!token || modoCidituc() === 'apagado') return null;

  const guardada = cache.get(token);
  if (guardada && Date.now() < guardada.vence) return guardada.persona;

  let cuerpo = null;
  try {
    cuerpo = modoCidituc() === 'api' ? await validarPorApi(token) : verificarJwt(token);
  } catch {
    cuerpo = null;
  }
  const persona = cuerpo ? personaDelCuerpo(cuerpo) : null;

  if (cache.size > 500) cache.clear();
  cache.set(token, { persona, vence: Date.now() + DURACION_CACHE_MS });
  return persona;
}

/* El token del pedido: `Authorization: Bearer xxx`. */
export function tokenDelPedido(req) {
  const cabecera = req.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(cabecera.trim());
  return m ? m[1].trim() : null;
}
