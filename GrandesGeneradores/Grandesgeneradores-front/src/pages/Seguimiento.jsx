import { useState } from 'react';
import PageHeader from '../components/ui/PageHeader';

function Seguimiento() {
  const [pendientes] = useState([
    { id: 1, label: 'Notificaciones pendientes de entrega', cantidad: 8, color: 'naranja' },
    { id: 2, label: 'Plazos próximos a vencer', cantidad: 12, color: 'amarillo' },
    { id: 3, label: 'Documentación pendiente de revisión', cantidad: 5, color: 'azul' },
    { id: 4, label: 'Contratos vencidos', cantidad: 3, color: 'rojo' },
    { id: 5, label: 'Expedientes pendientes de generación', cantidad: 4, color: 'verde' },
  ]);

  return (
    <>
      <PageHeader
        etiqueta="SEGUIMIENTO"
        titulo="ACCIONES PENDIENTES Y VENCIMIENTOS"
        botonVolver
      />

      <div className="accesos-header">
        <span>SITUACIONES QUE REQUIEREN INTERVENCIÓN</span>
      </div>

      <div className="grid-stats">
        {pendientes.map((p) => (
          <div key={p.id} className={`stat-card stat-card-${p.color}`}>
            <span className="stat-numero">{p.cantidad}</span>
            <span className="stat-label">{p.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export default Seguimiento;
