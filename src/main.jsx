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

// --- 3. Estilos globales (reset + body). Los de componentes están en App.css ---
import './index.css';

// --- 4. Montaje ---
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
