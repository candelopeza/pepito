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

/* ---------------------------------------------------------------------------
   4. El nombre (y el CUIL) de la persona
   ---------------------------------------------------------------------------
   El token real solo trae el número de persona, no el nombre ni el CUIL. Para
   saludar ("Hola, Candelaria"), mostrar el nombre en la barra y dejar que el
   portal del titular filtre los locales por CUIL, se le piden esos datos a
   CiDiTuc con CIDITUC_URL_PERSONA.

   >>> EL ENDPOINT REAL (visto en el front de CiDiTuc el 13/11/2026) <<<
       CIDITUC_URL_PERSONA=https://estadisticas.smt.gob.ar:5000/usuarios/authStatus
   Así lo hace CiDiTuc: un GET a esa dirección con el token en la cabecera
   Authorization TAL CUAL, sin la palabra "Bearer" adelante. Devuelve
       { usuarioSinContraseña: { nombre_persona, apellido_persona,
                                 documento_persona, id_persona, ... } }
   De ahí sale el nombre (nombre_persona + apellido_persona) y el CUIL
   (documento_persona). El número de persona ya lo sabíamos por el token; este
   pedido es solo para ponerle nombre y CUIL.

   Variantes (por si Sistemas cambia el servicio):
     - Si la URL lleva {id}, se reemplaza por el número de persona.
     - CIDITUC_PERSONA_BEARER=si  manda "Bearer <token>" en vez del token crudo
       (para una API que siga el estándar en vez del estilo de CiDiTuc).
   Sin CIDITUC_URL_PERSONA no hay nombre ni CUIL: la barra muestra el legajo y
   el portal pide "Ingresá con CiDiTuc para ver tus locales". */
const cacheDatos = new Map();
const DURACION_NOMBRE_MS = 10 * 60_000;
const VACIO = { nombre: null, cuil: null };

/* >>> NUNCA SE CAMBIA UN DATO BUENO POR UNO VACÍO (19/11/2026) <<<
   Al abrir la app salen 15 pedidos juntos y cada uno le preguntaba a CiDiTuc
   por la misma persona. Si uno fallaba (CiDiTuc lento, demasiados pedidos a
   la vez), su respuesta vacía pisaba a la buena y la persona quedaba sin
   nombre ni CUIL: el titular perdía sus locales al recargar. Ahora:
     - los pedidos simultáneos por la misma persona esperan UNA sola consulta;
     - lo último bueno de cada persona se guarda y se usa si CiDiTuc falla. */
const enCurso = new Map();
const ultimoBueno = new Map();

async function datosDeLaPersona(idPersona, token) {
  if (!process.env.CIDITUC_URL_PERSONA) return VACIO;
  const guardado = cacheDatos.get(idPersona);
  if (guardado && Date.now() < guardado.vence) return guardado.datos;
  if (enCurso.has(idPersona)) return enCurso.get(idPersona);
  const pedido = consultarPersona(idPersona, token).finally(() => enCurso.delete(idPersona));
  enCurso.set(idPersona, pedido);
  return pedido;
}

async function consultarPersona(idPersona, token) {
  const plantilla = process.env.CIDITUC_URL_PERSONA;

  let datosPersona = VACIO;
  let resultado;
  try {
    const url = plantilla.replace('{id}', encodeURIComponent(idPersona));
    const conBearer = String(process.env.CIDITUC_PERSONA_BEARER ?? '').toLowerCase() === 'si';
    const respuesta = await fetch(url, {
      headers: { Authorization: conBearer ? `Bearer ${token}` : token, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!respuesta.ok) resultado = `CiDiTuc respondió HTTP ${respuesta.status}`;
    if (respuesta.ok) {
      const cuerpo = await respuesta.json();
      // CiDiTuc envuelve a la persona en "usuarioSinContraseña"; otras APIs la
      // mandan en "usuario", "persona" o "data", o directamente sin envoltura.
      const p = cuerpo?.usuarioSinContraseña ?? cuerpo?.usuario ?? cuerpo?.persona ?? cuerpo?.data ?? cuerpo;
      const campo = process.env.CIDITUC_CAMPO_NOMBRE;
      const directo = primero(p, [campo, 'nombre_completo', 'nombreCompleto', 'name'].filter(Boolean));
      const partes = [
        primero(p, ['nombre_persona', 'nombre', 'nombres']),
        primero(p, ['apellido_persona', 'apellido', 'apellidos']),
      ].filter(Boolean);
      let nombre = directo ?? (partes.length ? partes.join(' ') : null);
      if (nombre) nombre = String(nombre).trim();
      const cuil = primero(p, [process.env.CIDITUC_CAMPO_CUIL || 'documento_persona', 'documento_persona', 'cuil', 'cuit']);
      datosPersona = { nombre, cuil: cuil ? String(cuil).trim() : null };
      // Sin nombre: se anotan solo los NOMBRES de los campos que vinieron (no
      // los valores), para ver en /salud cómo llama CiDiTuc a cada dato.
      resultado = nombre ? 'ok' : `respondió sin nombre; campos: ${Object.keys(p ?? {}).join(', ') || '(ninguno)'}`;
    }
  } catch (e) {
    datosPersona = VACIO;
    resultado = `no se pudo consultar: ${e?.cause?.code ?? e?.name ?? 'error'} ${e?.message ?? ''}`.trim();
  }
  ultimoPedido = { momento: new Date().toISOString(), resultado };
  if (resultado !== 'ok') {
    ultimoError = ultimoPedido;
    console.warn(`[CiDiTuc] nombre de la persona: ${resultado}`);
  }
  if (datosPersona.nombre || datosPersona.cuil) {
    if (ultimoBueno.size > 5000) ultimoBueno.clear();
    ultimoBueno.set(idPersona, datosPersona);
  } else if (ultimoBueno.has(idPersona)) {
    // CiDiTuc falló, pero ya sabíamos quién es: se usa lo último bueno.
    datosPersona = ultimoBueno.get(idPersona);
  }
  // Un fallo se recuerda solo 5 segundos: el front vuelve a preguntar a los 6
  // (auth/RolProvider.jsx) y para entonces se intenta de nuevo.
  const duracion = resultado === 'ok' ? DURACION_NOMBRE_MS : 5_000;
  if (cacheDatos.size > 2000) cacheDatos.clear();
  cacheDatos.set(idPersona, { datos: datosPersona, vence: Date.now() + duracion });
  return datosPersona;
}

/* Para GET /salud: si está configurado y cómo salió el último pedido de
   nombre. No incluye nombres, CUIL ni tokens. */
let ultimoPedido = null;
let ultimoError = null;
export function estadoNombres() {
  return {
    configurado: Boolean(process.env.CIDITUC_URL_PERSONA),
    url: process.env.CIDITUC_URL_PERSONA || null,
    ultimoPedido,
    // El último que NO salió bien, aunque después hayan salido otros bien.
    ultimoError,
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
  // El token (modo jwt-secreto) solo trae el número de persona. Si falta el
  // nombre o el CUIL, se los pedimos a CiDiTuc (un solo pedido trae los dos).
  let completa = true;
  if (persona && (!persona.nombre || !persona.cuil)) {
    const extra = await datosDeLaPersona(persona.idPersona, token);
    if (!persona.nombre) persona.nombre = extra.nombre;
    if (!persona.cuil) persona.cuil = extra.cuil;
    completa = Boolean(persona.nombre || persona.cuil);
  }

  // Si quedó sin nombre ni CUIL no se guarda: el próximo pedido reintenta.
  if (completa) {
    if (cache.size > 500) cache.clear();
    cache.set(token, { persona, vence: Date.now() + DURACION_CACHE_MS });
  }
  return persona;
}

/* El token del pedido: `Authorization: Bearer xxx`. */
export function tokenDelPedido(req) {
  const cabecera = req.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(cabecera.trim());
  return m ? m[1].trim() : null;
}
