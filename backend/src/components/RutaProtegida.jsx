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

import { Link, Navigate } from 'react-router-dom';
import { useRol } from '../auth/rolContexto';
import { useDatos } from '../datos/datosContexto';
import { puedeVerRuta } from '../config/modulos';

function RutaProtegida({ ruta, children }) {
  const { rol } = useRol();
  // Lo que el administrador ajustó desde Accesos → Tipos de usuario.
  const { permisos } = useDatos();

  // ===== Caso 1: no le corresponde -> al Inicio =====
  // `replace` reemplaza la entrada en el historial en vez de agregar una.
  // Sin eso, el botón Atrás del navegador lo devuelve a la ruta prohibida y
  // vuelve a rebotar: el usuario queda trabado sin poder retroceder.
  if (!puedeVerRuta(rol, ruta, permisos)) {
    return <Navigate to="/" replace />;
  }

  // ===== Caso 2: puede pasar =====
  return children;
}

/* ----------------------------------------------------------------------------
   EnlaceFicha — EL ENLACE A LA FICHA DE UN LOCAL, SOLO SI LA PUEDE ABRIR
   (04/11/2026). La ficha (/locales/:id) está protegida con ruta="/locales":
   si en Accesos → Tipos de usuario un rol tiene "Padrón de locales" en "no"
   (pasó con el relevador), el enlace lo mandaba de rebote al Inicio. Ahora,
   sin permiso, en lugar del enlace va `sinAcceso`:
     - por defecto, el mismo texto sin enlace (el nombre del local se lee igual);
     - sinAcceso={null}: no se muestra nada ("Abrir la ficha", botón "Ficha").
   ---------------------------------------------------------------------------- */
export function EnlaceFicha({ id, className = 'link-local', children, sinAcceso = children }) {
  const { rol } = useRol();
  const { permisos } = useDatos();
  if (!puedeVerRuta(rol, '/locales', permisos)) return sinAcceso;
  return (
    <Link to={`/locales/${id}`} className={className}>
      {children}
    </Link>
  );
}

export default RutaProtegida;
