/* ============================================================================
   RutaProtegida.jsx  —  TAPA EL AGUJERO DE LA URL ESCRITA A MANO
   ----------------------------------------------------------------------------
   POR QUÉ EXISTE: ocultar la tarjeta y el ítem del menú no alcanza. Si un
   relevador escribe /#/expedientes en la barra del navegador, sin esto entra
   igual. Este componente lo manda de vuelta al Inicio.

   CÓMO SE USA: envuelve al elemento de cada <Route> en App.jsx.

       <Route path="expedientes" element={
         <RutaProtegida ruta="/expedientes"><Expediente /></RutaProtegida>
       } />

   OJO: la prop `ruta` tiene que coincidir EXACTO con el campo `ruta` del
   módulo en src/config/modulos.js (con la barra inicial), porque el permiso
   se busca por ese texto. Si no coincide, puedeVerRuta() no encuentra el
   módulo y deja pasar a cualquiera.

   >>>>>>>>>>>>>>>>>>>>>>>>  ESTO NO ES SEGURIDAD  <<<<<<<<<<<<<<<<<<<<<<<<<<<
   Es una comodidad de interfaz: evita que alguien caiga por error en una
   pantalla que no le toca. NO protege datos. Todo esto corre en el navegador
   del usuario, que puede modificarlo. La restricción real va en el backend.
   >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

   SI HAY PROBLEMA ACÁ:
     - "Me rebota al Inicio y no debería": el rol activo no está en el array
       `roles` de ese módulo (src/config/modulos.js), o la prop `ruta` está
       mal escrita.
     - "Entro igual a una pantalla que no me toca": a ese <Route> le falta el
       <RutaProtegida>, o su `ruta` no coincide con la de la tabla.
     - "Loop infinito de redirecciones": pasa si se protege la ruta '/' con
       un rol que no la puede ver. Por eso puedeVerRuta() siempre deja pasar
       el Inicio; no cambies eso sin pensarlo.
   ============================================================================ */

import { Navigate } from 'react-router-dom';
import { useRol } from '../auth/rolContexto';
import { puedeVerRuta } from '../config/modulos';

function RutaProtegida({ ruta, children }) {
  const { rol } = useRol();

  // ===== Caso 1: no le corresponde -> al Inicio =====
  // `replace` reemplaza la entrada en el historial en vez de agregar una.
  // Sin eso, el botón Atrás del navegador lo devuelve a la ruta prohibida y
  // vuelve a rebotar: el usuario queda trabado sin poder retroceder.
  if (!puedeVerRuta(rol, ruta)) {
    return <Navigate to="/" replace />;
  }

  // ===== Caso 2: puede pasar =====
  return children;
}

export default RutaProtegida;
