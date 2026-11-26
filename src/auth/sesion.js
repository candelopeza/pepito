/* ============================================================================
   auth/sesion.js  —  EL TOKEN DE CiDiTuc EN EL NAVEGADOR
   ----------------------------------------------------------------------------
   CiDiTuc abre el sistema con un token en la dirección. Acá se lo captura una
   vez, se lo guarda para esta pestaña y se lo saca de la barra de direcciones
   (para que no quede en el historial ni en un marcador). Después, cada pedido
   a la API lo lleva como `Authorization: Bearer …` (datos/api.js) y el
   backend decide quién es la persona (backend/cidituc.js).

   DÓNDE SE BUSCA EL TOKEN: CiDiTuc lo manda en el parámetro `auth` (confirmado
   el 12/11/2026). Se acepta antes o después del "#" del router:
       https://grangenerador.smt.gob.ar/?auth=xxx
       https://grangenerador.smt.gob.ar/#/?auth=xxx
       https://grangenerador.smt.gob.ar/#auth=xxx
   Los otros nombres de PARAMETROS quedan por si cambia.

   SE GUARDA EN localStorage (pedido de la Dirección): la persona sigue
   identificada aunque cierre la pestaña o abra la app instalada. Cuando el
   token vence, el backend lo rechaza y RolProvider lo olvida (olvidarToken).

   >>> VOLVER A ENTRAR DESDE LA APP (27/11/2026) <<<
   En el celular, cuando el token vencía (dura 24 horas), la app quedaba como
   público y no había cómo volver a entrar: había que ir al navegador, entrar a
   CiDiTuc y abrir el sistema desde ahí. Ahora:
     - URL_INGRESO_CIDITUC: la página de CiDiTuc a la que lleva el botón
       "Ingresar" (Navbar.jsx y el aviso de sesión vencida en Layout.jsx).
       Desde ahí CiDiTuc vuelve a abrir el sistema con un token nuevo;
     - venceToken / tokenVencido: leen el vencimiento del token (el `exp` del
       JWT) sin señal, para avisar "tu sesión venció" en vez de quedar mudo;
     - recordarPersona / personaRecordada: la última persona que el backend
       confirmó con ESTE token. Sin señal no se puede preguntar, y la app la
       dejaba afuera; ahora la usa hasta que vuelva la señal (el backend igual
       revisa el token en cada pedido: esto solo decide qué se ve);
     - alCambiarToken: avisa si otra pestaña (o el navegador, en el teléfono
       comparten el almacenamiento con la app instalada) guardó un token nuevo.
   ============================================================================ */

const CLAVE = 'grandes-generadores-token';
const CLAVE_PERSONA = 'grandes-generadores-persona';
const PARAMETROS = ['auth', 'token', 'access_token', 'jwt', 't'];

/* La página de ingreso de CiDiTuc (la que pasó la Dirección el 27/11/2026). Se
   puede cambiar sin tocar el código con VITE_CIDITUC_INGRESO en el .env. */
export const URL_INGRESO_CIDITUC = import.meta.env.VITE_CIDITUC_INGRESO || 'https://cidituc.smt.gob.ar/?destino=derivador#/home';

/* Va a CiDiTuc en la misma ventana (dentro de la app instalada, sin abrir el
   navegador aparte). Al volver, capturarToken() toma el token nuevo. */
export function ingresarConCidituc() {
  window.location.assign(URL_INGRESO_CIDITUC);
}

function sacarDe(params) {
  for (const nombre of PARAMETROS) {
    const valor = params.get(nombre);
    if (valor) {
      PARAMETROS.forEach((n) => params.delete(n));
      return valor;
    }
  }
  return null;
}

/* Lee el token de la dirección (si vino), lo guarda y limpia la dirección.
   Devuelve el token vigente para esta pestaña, o null. */
export function capturarToken() {
  try {
    const url = new URL(window.location.href);
    let token = sacarDe(url.searchParams);

    // Dentro del hash: "#/ruta?token=xxx" o "#token=xxx".
    if (!token && url.hash.includes('=')) {
      const i = url.hash.indexOf('?');
      const ruta = i >= 0 ? url.hash.slice(0, i) : '#/';
      const params = new URLSearchParams(i >= 0 ? url.hash.slice(i + 1) : url.hash.slice(1));
      token = sacarDe(params);
      if (token) {
        const resto = params.toString();
        url.hash = resto ? `${ruta}?${resto}` : ruta;
      }
    }

    if (token) {
      localStorage.setItem(CLAVE, token);
      window.history.replaceState(null, '', url.toString());
    }
  } catch {
    // Sin almacenamiento (ventana privada muy restringida): se sigue sin sesión.
  }
  return leerToken();
}

export function leerToken() {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

export function olvidarToken() {
  try {
    localStorage.removeItem(CLAVE);
    localStorage.removeItem(CLAVE_PERSONA);
  } catch {
    // nada que olvidar
  }
}

/* Cuándo vence el token, en milisegundos, leyendo el `exp` del JWT SIN
   verificar la firma (eso lo hace el backend). null si no es un JWT o no trae
   vencimiento: en ese caso decide el backend. */
export function venceToken(token = leerToken()) {
  try {
    const cuerpo = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof cuerpo.exp === 'number' ? cuerpo.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function tokenVencido(token = leerToken()) {
  const vence = venceToken(token);
  return vence !== null && vence <= Date.now();
}

/* La persona se guarda atada al token con el que se confirmó (sus últimos
   caracteres, que son parte de la firma): con otro token no se usa. */
const huella = (token) => (token ? token.slice(-16) : '');

export function recordarPersona(persona) {
  try {
    localStorage.setItem(CLAVE_PERSONA, JSON.stringify({ token: huella(leerToken()), persona }));
  } catch {
    // Sin almacenamiento: sin señal no se va a poder recordar, nada más.
  }
}

export function personaRecordada() {
  try {
    const guardada = JSON.parse(localStorage.getItem(CLAVE_PERSONA) ?? 'null');
    return guardada && guardada.token === huella(leerToken()) ? guardada.persona : null;
  } catch {
    return null;
  }
}

/* Llama a `avisar` cuando otra ventana del mismo sitio guarda o borra el token.
   Devuelve la función para dejar de escuchar. */
export function alCambiarToken(avisar) {
  const escuchar = (e) => {
    if (e.key === CLAVE || e.key === null) avisar();
  };
  window.addEventListener('storage', escuchar);
  return () => window.removeEventListener('storage', escuchar);
}
