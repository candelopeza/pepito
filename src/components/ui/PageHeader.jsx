import { Link } from 'react-router-dom';

function PageHeader({ etiqueta, titulo, botonVolver = false }) {
  return (
    <>
      <h2 className="inicio-tag">{etiqueta}</h2>
      <h1 className="sistema-titulo">{titulo}</h1>
      {botonVolver && (
        <div className="info-bar">
          <Link to="/" className="admin-badge btn-volver">
            <span>← VOLVER AL INICIO</span>
          </Link>
        </div>
      )}
    </>
  );
}

export default PageHeader;