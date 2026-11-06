/* ============================================================================
   main.jsx  —  PUNTO DE ENTRADA. Es el primer archivo que corre.
   ----------------------------------------------------------------------------
   QUÉ HACE: agarra el <div id="root"> del index.html y mete la app adentro.
   CADENA:   index.html -> main.jsx -> App.jsx -> Layout.jsx -> pages/*

   SI HAY PROBLEMA ACÁ (pantalla totalmente en blanco, nada carga):
     - ¿existe <div id="root"> en index.html?  Si no, getElementById da null.
     - ¿el error de la consola menciona otro archivo? Entonces el problema
       no es este, es más abajo en la cadena.
   ============================================================================ */

// --- 1. Librerías ---
import React from 'react';
import ReactDOM from 'react-dom/client';

// --- 2. La app ---
import App from './App';

// --- 3. Tipografía: Poppins, empaquetada con la app (no se baja de internet,
//        así anda igual en la red del municipio). Solo alfabeto latino (alcanza
//        para español, con ñ y acentos) y solo los pesos que usa App.css.
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import '@fontsource/poppins/latin-800.css';

// --- 4. Estilos globales (reset + body). Los de componentes están en App.css ---
import './index.css';

// --- 5. Montaje ---
// StrictMode es solo de desarrollo: hace que los efectos corran DOS veces
// a propósito, para detectar bugs. En producción no pasa.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// --- 5. La app guardada en el teléfono para abrir sin señal (public/sw.js) ---
// Solo en la versión compilada: con `npm run dev` se pelearía con Vite. Si el
// navegador no lo permite (sin HTTPS, abierto con doble clic), no pasa nada:
// la app funciona igual, solo que no abre sin señal.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// --- 6. Que el teléfono no borre lo guardado ---
// Las cargas hechas sin señal viven en el dispositivo (datos/colaSinConexion.js).
// Si el teléfono se queda sin espacio, o Safari ve que la página no se abrió en
// 7 días, puede borrarlas sin avisar. Esto le pide que las trate como datos del
// usuario. Solo en teléfonos y tablets (pantalla táctil) o con la app
// instalada: en la PC no hace falta, y Firefox lo preguntaría con un cartel.
// En el iPhone lo que más protege es instalarla en la pantalla de inicio.
const PEDIR_ALMACENAMIENTO_PERSISTENTE = true;
const esTelefono =
  window.matchMedia?.('(pointer: coarse)').matches || window.matchMedia?.('(display-mode: standalone)').matches;
if (PEDIR_ALMACENAMIENTO_PERSISTENTE && esTelefono && navigator.storage?.persist) {
  navigator.storage
    .persisted()
    .then((ya) => ya || navigator.storage.persist())
    .catch(() => {});
}
