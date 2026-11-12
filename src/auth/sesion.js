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
   ============================================================================ */

const CLAVE = 'grandes-generadores-token';
const PARAMETROS = ['auth', 'token', 'access_token', 'jwt', 't'];

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
  } catch {
    // nada que olvidar
  }
}
