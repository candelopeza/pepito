/* ============================================================================
   ui/Card.jsx  —  TARJETA CLICKEABLE (pieza reutilizable)
   ----------------------------------------------------------------------------
   OJO: esto lo usan VARIAS páginas. Si lo tocás, cambia en todas.
   USADO EN: Home, Relevamiento, Tramite, Documentacion
   ESTILOS:  App.css -> sección 7 (TARJETAS)

   PROPS:
     titulo      (texto, obligatorio)  título grande de la tarjeta
     descripcion (texto, opcional)     si no se pasa, no se dibuja el <p>
     to          (ruta, opcional)      si viene -> la tarjeta es un <Link>
     onClick     (función, opcional)   si viene `to`, esto se IGNORA

   LAS DOS FORMAS DE LA TARJETA (mirá el `if (to)` de abajo):
     - CON `to`  -> se dibuja un <Link>: navega a otra pantalla.
     - SIN `to`  -> se dibuja un <div>: no navega a ningún lado.

   SI HAY PROBLEMA ACÁ:
     - "Hago clic en una tarjeta y no pasa NADA":
        no es un bug de este archivo. A esa tarjeta no le pasaron `to` ni
        `onClick`. Hoy están así a propósito casi todas las de Relevamiento,
        Tramite y Documentacion, porque esas pantallas todavía no existen.
        Se arregla en la página, agregándole el to=.
     - "La tarjeta se ve como link pero lleva al lugar equivocado":
        el `to` de la página no coincide con el `path` de App.jsx.
     - "Falta la descripción": no se la pasaron (es opcional, ver arriba).
   ============================================================================ */

import { Link } from 'react-router-dom';

function Card({ titulo, descripcion, to, onClick }) {

  // ===== 1. El contenido interno: es el mismo en las dos formas =====
  const contenido = (
    <>
      <h3 className="card-titulo">{titulo}</h3>
      {/* La descripción solo se dibuja si realmente vino */}
      {descripcion && <p className="card-descripcion">{descripcion}</p>}
    </>
  );

  // ===== 2. FORMA A: tarjeta que navega (le pasaron `to`) =====
  if (to) {
    return (
      <Link to={to} className="card-acceso">
        {contenido}
      </Link>
    );
  }

  // ===== 3. FORMA B: tarjeta suelta (sin `to`) =====
  // Si tampoco le pasaron onClick, el clic no hace nada. No es un error del
  // componente: es que la pantalla de destino todavía no está hecha.
  return (
    <div className="card-acceso" onClick={onClick}>
      {contenido}
    </div>
  );
}

export default Card;
