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
})
