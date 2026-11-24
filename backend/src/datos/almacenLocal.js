/* ============================================================================
   datos/almacenLocal.js  —  LO QUE QUEDA GUARDADO EN EL DISPOSITIVO
   ----------------------------------------------------------------------------
   Un cajón de clave → valor en IndexedDB, la base de datos que trae cualquier
   navegador. Lo usan dos cosas del trabajo sin conexión (sección 6.2, requisito
   no negociable):

     'copia-datos'   la última copia de los datos que mandó el servidor, para
                     poder abrir la app sin señal (datos/DatosProvider.jsx)
     'cola-campo'    los relevamientos y entregas cargados sin señal, que
                     esperan para enviarse (datos/colaSinConexion.js)

   POR QUÉ INDEXEDDB Y NO localStorage: localStorage tiene un límite de unos
   5 MB y guarda solo texto. La copia del padrón (2.200 locales con sus
   trámites) y las fotos de las entregas no entran.

   SI EL NAVEGADOR NO DEJA (ventana privada, almacenamiento bloqueado): todo
   sigue andando con conexión. Las funciones no tiran error: devuelven null y
   la app se comporta como antes.
   ============================================================================ */

const NOMBRE_BASE = 'grandes-generadores';
const ALMACEN = 'datos';

let abierta = null;

function abrir() {
  if (abierta) return abierta;
  abierta = new Promise((resolver) => {
    try {
      if (typeof indexedDB === 'undefined') return resolver(null);
      const pedido = indexedDB.open(NOMBRE_BASE, 1);
      pedido.onupgradeneeded = () => pedido.result.createObjectStore(ALMACEN);
      pedido.onsuccess = () => resolver(pedido.result);
      pedido.onerror = () => resolver(null);
      pedido.onblocked = () => resolver(null);
    } catch {
      resolver(null);
    }
  });
  return abierta;
}

function operar(modo, accion) {
  return abrir().then(
    (bd) =>
      new Promise((resolver) => {
        if (!bd) return resolver(null);
        try {
          const tx = bd.transaction(ALMACEN, modo);
          const pedido = accion(tx.objectStore(ALMACEN));
          pedido.onsuccess = () => resolver(pedido.result ?? null);
          pedido.onerror = () => resolver(null);
        } catch {
          resolver(null);
        }
      }),
  );
}

export function leer(clave) {
  return operar('readonly', (almacen) => almacen.get(clave));
}

export function guardar(clave, valor) {
  return operar('readwrite', (almacen) => almacen.put(valor, clave));
}

export function borrar(clave) {
  return operar('readwrite', (almacen) => almacen.delete(clave));
}
