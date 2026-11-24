/* ============================================================================
   HistorialEstados.jsx  —  POR QUÉ ESTADOS PASÓ UN LOCAL, CUÁNDO Y POR QUIÉN
   ----------------------------------------------------------------------------
   Criterio de aceptación del capítulo 10: "Todo cambio de estado queda
   registrado con actor, momento y motivo, y es consultable desde la ficha".

   Lo dibuja la ficha del local (pages/LocalFicha.jsx). Los datos los escribe
   el backend en la tabla `auditoria` (backend/auditoria.js) y llegan con
   cargarAuditoria() del store. Si la base no tiene esa tabla, la ficha no
   muestra esta sección.

   Más reciente arriba, igual que el historial de actuaciones. "Sistema" es el
   actor de los cambios por paso del tiempo (un plazo que venció).
   ============================================================================ */

import Badge from './ui/Badge';
import { Vacio } from './ui/Aviso';
import { etiquetaEstado } from '../dominio/estados';
import { fmtFechaHora } from '../dominio/fechas';

const etiqueta = (codigo) => (codigo === 'BAJA' ? 'Dado de baja' : etiquetaEstado(codigo));

function HistorialEstados({ filas = [] }) {
  if (!filas.length) {
    return <Vacio titulo="Todavía no hay cambios de estado registrados" />;
  }

  return (
    <table className="tabla-datos">
      <thead>
        <tr>
          <th>Cuándo</th>
          <th>De</th>
          <th>A</th>
          <th>Motivo</th>
          <th>Quién</th>
        </tr>
      </thead>
      <tbody>
        {[...filas].reverse().map((f) => (
          <tr key={f.id}>
            <td>{fmtFechaHora(f.momento)}</td>
            <td>{f.anterior ? etiqueta(f.anterior) : '—'}</td>
            <td>
              <strong>{etiqueta(f.nuevo)}</strong>
            </td>
            <td>{f.motivo}</td>
            <td>{f.actor === 'Sistema' ? <Badge color="gris">Sistema</Badge> : f.actor}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default HistorialEstados;
