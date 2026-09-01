/* ============================================================================
   pages/Seguimiento.jsx  —  PENDIENTES Y VENCIMIENTOS  (URL: /#/seguimiento)
   ----------------------------------------------------------------------------
   RUTA EN: App.jsx -> <Route path="seguimiento" ... />
   ESTILOS: App.css -> sección 8 (STAT CARDS)

   Es el TABLERO de números grandes: una tarjeta por situación pendiente.
   Es la única pantalla que usa .stat-card (no reutiliza ui/Card.jsx, porque
   ese componente no muestra números).

   >>> DATOS DE PRUEBA <<<
   Los números (8, 12, 5, 3, 4) están escritos a mano abajo. NO son reales
   ni se calculan: cuando haya backend, estos son los primeros que hay que
   reemplazar, porque son los que más engañan en una demo.

   CÓMO FUNCIONA EL COLOR (importante):
   el campo `color` de cada fila se pega dentro de la clase, así:
       color: 'naranja'  ->  clase "stat-card stat-card-naranja"
   Los únicos valores válidos son: azul, verde, naranja, amarillo, rojo.

   SI HAY PROBLEMA ACÁ:
     - "Un número sale en negro / sin color": el `color` de esa fila está mal
        escrito o no es uno de los 5 de arriba. No hay error en consola:
        simplemente la clase no existe en App.css.
     - "Las tarjetas no son clickeables": correcto, todavía no lo son.
        Lo natural sería que cada una lleve a su listado filtrado, pero esas
        pantallas no existen.
     - "Los números no cambian nunca": son fijos, ver arriba.
   ============================================================================ */

import { useState } from 'react';
import PageHeader from '../components/ui/PageHeader';

function Seguimiento() {

  // ===== A. DATOS (fijos, de prueba) =====
  // `color` DEBE ser uno de: azul | verde | naranja | amarillo | rojo
  const [pendientes] = useState([
    { id: 1, label: 'Notificaciones pendientes de entrega', cantidad: 8, color: 'naranja' },
    { id: 2, label: 'Plazos próximos a vencer', cantidad: 12, color: 'amarillo' },
    { id: 3, label: 'Documentación pendiente de revisión', cantidad: 5, color: 'azul' },
    { id: 4, label: 'Contratos vencidos', cantidad: 3, color: 'rojo' },
    { id: 5, label: 'Expedientes pendientes de generación', cantidad: 4, color: 'verde' },
  ]);

  // ===== B. LO QUE SE DIBUJA =====
  return (
    <>
      {/* ---------- BLOQUE 1: encabezado ---------- */}
      <PageHeader
        etiqueta="SEGUIMIENTO"
        titulo="ACCIONES PENDIENTES Y VENCIMIENTOS"
        botonVolver
      />

      {/* ---------- BLOQUE 2: separador ---------- */}
      <div className="accesos-header">
        <span>SITUACIONES QUE REQUIEREN INTERVENCIÓN</span>
      </div>

      {/* ---------- BLOQUE 3: tarjetas con números ----------
          La clase de color se arma en el template string de abajo. */}
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
