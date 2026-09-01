/* ============================================================================
   pages/Expediente.jsx  —  CONSULTA DE EXPEDIENTES  (URL: /#/expedientes)
   ----------------------------------------------------------------------------
   RUTA EN: App.jsx -> <Route path="expedientes" ... />
   ESTILOS: App.css -> sección 9 (TABLAS + BADGES)

   Es la misma estructura que pages/Local.jsx (encabezado + separador + tabla),
   pero con otras columnas. Si arreglás un problema de tabla en uno,
   revisá si el otro tiene el mismo.

   >>> DATOS DE PRUEBA <<<
   Los 2 expedientes están escritos a mano abajo. No hay backend.

   SI HAY PROBLEMA ACÁ:
     - "El botón Ver no hace nada": todavía no tiene onClick, falta la
        pantalla de detalle del expediente.
     - "Un estado sale sin color": la regla es por TEXTO EXACTO ->
        'Resuelto' = verde, cualquier otra cosa = naranja. Solo hay 2 colores.
     - OJO CON LAS FECHAS: están guardadas como TEXTO ('15/08/2026'), no como
        Date. Por eso hoy no se pueden ordenar ni comparar. Si más adelante
        hay que ordenar por fecha, esto se cambia primero.
     - `id` acá es el número de expediente (texto '2026-00001'), no un número.
   ============================================================================ */

import { useState } from 'react';
import PageHeader from '../components/ui/PageHeader';

function Expediente() {

  // ===== A. DATOS (fijos, de prueba) =====
  const [expedientes] = useState([
    { id: '2026-00001', local: 'Supermercado Norte', estado: 'En trámite', fecha: '15/08/2026' },
    { id: '2026-00002', local: 'Industria Sur', estado: 'Resuelto', fecha: '20/08/2026' },
  ]);

  // ===== B. LO QUE SE DIBUJA =====
  return (
    <>
      {/* ---------- BLOQUE 1: encabezado ---------- */}
      <PageHeader etiqueta="EXPEDIENTES" titulo="CONSULTA Y SEGUIMIENTO" botonVolver />

      {/* ---------- BLOQUE 2: separador ---------- */}
      <div className="accesos-header">
        <span>EXPEDIENTES GENERADOS</span>
      </div>

      {/* ---------- BLOQUE 3: tabla ----------
          PENDIENTE: sin filtro por estado, sin búsqueda por número,
          sin paginado y sin orden por fecha. */}
      <div className="tabla-contenedor">
        <table className="tabla-datos">

          {/* --- Columnas (mismo orden que los <td> de abajo) --- */}
          <thead>
            <tr>
              <th>N° Expediente</th>
              <th>Local</th>
              <th>Estado</th>
              <th>Fecha</th>
              <th>Acciones</th>
            </tr>
          </thead>

          {/* --- Una fila por expediente --- */}
          <tbody>
            {expedientes.map((e) => (
              <tr key={e.id}>
                <td>{e.id}</td>
                <td>{e.local}</td>

                {/* 'Resuelto' -> verde ; cualquier otro estado -> naranja */}
                <td><span className={`badge badge-${e.estado === 'Resuelto' ? 'verde' : 'naranja'}`}>{e.estado}</span></td>

                {/* Fecha como texto tal cual vino, sin formatear */}
                <td>{e.fecha}</td>

                {/* Botón sin acción todavía */}
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
