import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
export default defineConfig({
  // Rutas relativas: necesario para abrir el build desde el disco (file://).
  base: './',
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
