import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
export default defineConfig({
  // Rutas relativas: necesario para abrir el build desde el disco (file://).
  base: './',
  /* >>> PUERTO FIJO: ESTE PROYECTO ES SIEMPRE http://localhost:5174 <<<
     El 5173 es el puerto por defecto de TODOS los proyectos Vite y se lo
     queda el primero que arranca: si trabajocampo corre primero, este se
     corría al 5174 y parecía que "se mezclaban" los proyectos. Con el puerto
     clavado y strictPort, Grandes Generadores vive en el 5174 pase lo que
     pase (y si alguna vez está ocupado, avisa con un error en vez de
     mudarse en silencio a otro). */
  server: {
    port: 5174,
    strictPort: true,
  },
  plugins: [
    react(),
    // Incrusta el JS y el CSS dentro del propio index.html.
    // Sin archivos externos que cargar, el navegador no aplica el bloqueo
    // CORS que sufren los módulos ES abiertos con doble clic.
    viteSingleFile(),
  ],
  build: {
    rollupOptions: {
      // jsPDF (cédulas y hoja de ruta en PDF) las carga solo para pasar HTML
      // o SVG a PDF, cosa que la app no hace: afuera, son ~800 KB menos.
      external: ['html2canvas', 'canvg', 'dompurify'],
    },
  },
})
