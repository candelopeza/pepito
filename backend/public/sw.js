/* ============================================================================
   public/sw.js  —  LA APP GUARDADA EN EL TELÉFONO, PARA ABRIR SIN SEÑAL
   ----------------------------------------------------------------------------
   Es un "service worker": un archivo que el navegador instala aparte y que se
   pone en el medio de los pedidos de la página. Hace UNA cosa: guardar los
   archivos de la aplicación (el index.html, que con vite-plugin-singlefile ya
   trae adentro todo el JavaScript y el CSS) para que la app abra aunque no
   haya señal. Sección 6.2: trabajo sin conexión, requisito no negociable.

   LOS DATOS NO PASAN POR ACÁ. Las llamadas a la API se dejan pasar tal cual:
   la copia de los datos y la cola de cargas sin señal las maneja la propia
   app (src/datos/almacenLocal.js y colaSinConexion.js).

   ESTRATEGIA: primero la red, y si no hay red, lo guardado. Así, con señal,
   siempre se usa la versión más nueva de la app, y la guardada se actualiza
   sola en cada visita.

   CONDICIONES (las pone el navegador, no este archivo):
     - solo funciona con HTTPS, o en http://localhost para probar;
     - no funciona abriendo el index.html con doble clic (file://).
   Se registra desde src/main.jsx, y solo en la versión compilada (npm run
   build): con npm run dev no se instala, para no pelearse con Vite.
   ============================================================================ */

const VERSION = 'grandes-generadores-v1';
const DESTINOS_DE_LA_APP = ['document', 'script', 'style', 'image', 'font', 'manifest'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(['./', './index.html']))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  // Solo los archivos de la propia app. La API (otro puerto u otro servidor,
  // o un fetch sin destino) va directo a la red.
  if (url.origin !== self.location.origin) return;
  if (pedido.mode !== 'navigate' && !DESTINOS_DE_LA_APP.includes(pedido.destination)) return;

  evento.respondWith(
    fetch(pedido)
      .then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(VERSION).then((cache) => cache.put(pedido, copia));
        }
        return respuesta;
      })
      .catch(() =>
        caches
          .match(pedido)
          .then((guardada) => guardada ?? (pedido.mode === 'navigate' ? caches.match('./index.html') : Response.error())),
      ),
  );
});
