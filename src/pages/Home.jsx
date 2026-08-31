import { useState } from 'react';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';

function Home() {
  const hoy = new Date();
  const fechaFormateada = hoy.toLocaleDateString('es-ES', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  // Solo entidades operativas: las tablas de configuración (rubros, sedes,
  // estados, etc.) viven en el menú lateral, no acá.
  const modulos = [
    { id: 1, titulo: 'Locales', descripcion: 'Consultar y administrar los establecimientos registrados', ruta: '/locales' },
    { id: 2, titulo: 'Relevamientos', descripcion: 'Registrar y consultar los relevamientos realizados', ruta: '/relevamientos' },
    { id: 3, titulo: 'Trámites', descripcion: 'Gestionar notificaciones, revisiones y actuaciones', ruta: '/tramites' },
    { id: 4, titulo: 'Documentación', descripcion: 'DDJJ, contratos y documentación presentada', ruta: '/documentacion' },
    { id: 5, titulo: 'Expedientes', descripcion: 'Consultar y seguir los expedientes generados', ruta: '/expedientes' },
    { id: 6, titulo: 'Seguimiento', descripcion: 'Pendientes, vencimientos y acciones que requieren intervención', ruta: '/seguimiento' },
  ];

  return (
    <>
      <PageHeader etiqueta="INICIO" titulo="SISTEMA DE GRANDES GENERADORES" />

      <div className="info-bar">
        <div className="admin-badge">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#1976d2">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
          <span>ADMINISTRADOR</span>
        </div>
        <span className="fecha">{fechaFormateada}</span>
      </div>

      <div className="accesos-header">
        <span>MÓDULOS PRINCIPALES</span>
      </div>

      <div className="grid-accesos">
        {modulos.map((m) => (
          <Card key={m.id} titulo={m.titulo} descripcion={m.descripcion} to={m.ruta} />
        ))}
      </div>
    </>
  );
}

export default Home;