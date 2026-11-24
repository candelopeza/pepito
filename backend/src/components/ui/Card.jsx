/* ============================================================================
   ui/Card.jsx  —  TARJETA (pieza reutilizable)
   ----------------------------------------------------------------------------
   OJO: la usan varias páginas. Si la tocás, cambia en todas.
   USADA EN: Home, Tablero, Portal.

   PROPS
     titulo       (obligatorio)
     descripcion  (opcional)
     to           si viene, la tarjeta es un <Link> y navega
     onClick      se ignora si vino `to`
     valor        (opcional) un número grande arriba, para las bandejas
     color        (opcional) color del número: azul verde naranja amarillo rojo
     pie          (opcional) JSX al pie de la tarjeta

   LAS DOS FORMAS: con `to` es un <Link> (navega), sin `to` es un <div> (no).
   Si hacés clic y no pasa nada, a esa tarjeta no le pasaron ni `to` ni
   `onClick`; se arregla en la página, no acá.
   ============================================================================ */

import { Link } from 'react-router-dom';

function Card({ titulo, descripcion, to, onClick, valor, color = 'azul', pie }) {
  const contenido = (
    <>
      {/* El número va arriba del título: en una bandeja lo primero que se
          quiere ver es cuántos hay, no cómo se llama la bandeja. */}
      {valor !== undefined && <span className={`card-valor card-valor-${color}`}>{valor}</span>}
      <h3 className="card-titulo">{titulo}</h3>
      {descripcion && <p className="card-descripcion">{descripcion}</p>}
      {pie && <div className="card-pie">{pie}</div>}
    </>
  );

  if (to) {
    return (
      <Link to={to} className="card-acceso">
        {contenido}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" className="card-acceso card-acceso-boton" onClick={onClick}>
        {contenido}
      </button>
    );
  }

  return <div className="card-acceso">{contenido}</div>;
}

export default Card;
