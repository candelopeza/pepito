import { useState } from 'react';
import PageHeader from '../components/ui/PageHeader';

function Expediente() {
  const [expedientes] = useState([
    { id: '2026-00001', local: 'Supermercado Norte', estado: 'En trámite', fecha: '15/08/2026' },
    { id: '2026-00002', local: 'Industria Sur', estado: 'Resuelto', fecha: '20/08/2026' },
  ]);

  return (
    <>
      <PageHeader etiqueta="EXPEDIENTES" titulo="CONSULTA Y SEGUIMIENTO" botonVolver />

      <div className="accesos-header">
        <span>EXPEDIENTES GENERADOS</span>
      </div>

      <div className="tabla-contenedor">
        <table className="tabla-datos">
          <thead>
            <tr>
              <th>N° Expediente</th>
              <th>Local</th>
              <th>Estado</th>
              <th>Fecha</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {expedientes.map((e) => (
              <tr key={e.id}>
                <td>{e.id}</td>
                <td>{e.local}</td>
                <td><span className={`badge badge-${e.estado === 'Resuelto' ? 'verde' : 'naranja'}`}>{e.estado}</span></td>
                <td>{e.fecha}</td>
                <td><button className="btn-tabla">Ver</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default Expediente;