/* ============================================================================
   datos/datosContexto.js  —  EL "CABLE" DE LOS DATOS + EL HOOK PARA LEERLOS
   ----------------------------------------------------------------------------
   Mitad LECTURA del store. La mitad escritura está en DatosProvider.jsx.
   Están separados por el mismo motivo que auth/rolContexto.js: un archivo que
   exporta solo funciones mantiene el recambio en caliente de Vite y el lint
   sin avisos.

   ESTE ES EL QUE VAS A IMPORTAR SIEMPRE:

       import { useDatos } from '../datos/datosContexto';

       function LoQueSea() {
         const { localesConEstado, generarCedula } = useDatos();
       }
   ============================================================================ */

import { createContext, useContext } from 'react';

export const DatosContext = createContext(null);

export function useDatos() {
  const contexto = useContext(DatosContext);
  if (contexto === null) {
    throw new Error('useDatos() debe usarse dentro de <DatosProvider>. Revisá App.jsx.');
  }
  return contexto;
}
