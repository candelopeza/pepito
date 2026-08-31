import { Link } from 'react-router-dom';

function Card({ titulo, descripcion, to, onClick }) {
  const contenido = (
    <>
      <h3 className="card-titulo">{titulo}</h3>
      {descripcion && <p className="card-descripcion">{descripcion}</p>}
    </>
  );

  if (to) {
    return (
      <Link to={to} className="card-acceso">
        {contenido}
      </Link>
    );
  }

  return (
    <div className="card-acceso" onClick={onClick}>
      {contenido}
    </div>
  );
}

export default Card;