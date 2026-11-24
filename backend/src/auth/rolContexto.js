/* ============================================================================
   auth/rolContexto.js  —  EL "CABLE" POR DONDE VIAJA EL ROL + EL HOOK PARA LEERLO
   ----------------------------------------------------------------------------
   Este archivo es la MITAD LECTURA del sistema de roles.
   La otra mitad (quién guarda el rol) está en auth/RolProvider.jsx.

   ¿Por qué están separados? Porque este archivo NO exporta componentes, solo
   funciones. Si el provider y el hook viven juntos, Vite pierde el recambio en
   caliente de ese archivo y cada cambio recarga la página entera. Separarlos
   mantiene el desarrollo ágil (y el `npm run lint` sin avisos).

   ---------------------------------------------------------------------------
   ESTE ES EL ARCHIVO QUE VAS A IMPORTAR EL 99% DE LAS VECES:

       import { useRol } from '../auth/rolContexto';

       function LoQueSea() {
         const { rol, datosRol } = useRol();
         // rol      -> 'administrador' | 'inspector' | 'relevador' | 'notificador'
         // datosRol -> { id, etiqueta, descripcion }  (para mostrar en pantalla)
       }
   ---------------------------------------------------------------------------

   SI HAY PROBLEMA ACÁ:
     - Error "useRol() debe usarse dentro de <RolProvider>": el componente que
       lo llamó quedó fuera del provider. Revisá App.jsx.
     - "Importé RolContext directo y me da undefined": no lo hagas, usá
       useRol(). El contexto pelado se exporta solo para el provider.
   ============================================================================ */

import { createContext, useContext } from 'react';

// ===== A. EL CONTEXTO =====
// Arranca en null a propósito: así detectamos si alguien lo usa sin provider
// y avisamos con un error claro, en vez de fallar de formas raras.
// Solo lo usa auth/RolProvider.jsx. Desde una pantalla, usá useRol().
export const RolContext = createContext(null);

// ===== B. EL HOOK =====
// Es la única forma correcta de leer el rol desde una pantalla.
export function useRol() {
  const contexto = useContext(RolContext);
  if (contexto === null) {
    throw new Error('useRol() debe usarse dentro de <RolProvider>. Revisá App.jsx.');
  }
  return contexto;
}
