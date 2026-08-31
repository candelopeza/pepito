import { useState } from 'react';
import PageHeader from '../components/ui/PageHeader';

function Local() {
  const [locales] = useState([
    { id: 1, nombre: 'Supermercado Norte', cuit: '30-12345678-9', direccion: 'Av. Alem 123', rubro: 'Comercial', estado: 'Activo' },
    { id: 2, nombre: 'Industria Sur', cuit: '30-98765432-1', direccion: 'Ruta 9 Km 5', rubro: 'Industrial', estado: 'En trámite' },
    { id: 3, nombre: 'Farmacia Centro', cuit: '30-55555555-5', direccion: 'San Martín 456', rubro: 'Servicios', estado: 'Activo' },
  ]);

  return (
    <>
      <PageHeader etiqueta="LOCALES" titulo="PADRÓN DE ESTABLECIMIENTOS" botonVolver />

      <div className="accesos-header">
        <span>LISTADO</span>
      </div>

      <div className="tabla-contenedor">
        <table className="tabla-datos">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nombre</th>
              <th>CUIT</th>
              <th>Dirección</th>
              <th>Rubro</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {locales.map((l) => (
              <tr key={l.id}>
                <td>{l.id}</td>
                <td>{l.nombre}</td>
                <td>{l.cuit}</td>
                <td>{l.direccion}</td>
                <td>{l.rubro}</td>
                <td><span className={`badge badge-${l.estado === 'Activo' ? 'verde' : 'naranja'}`}>{l.estado}</span></td>
                <td><button className="btn-tabla">Ver</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default Local;