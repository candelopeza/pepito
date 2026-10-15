/* ============================================================================
   SelectorRol.jsx  —  ELEGIR EL USUARIO (identificación provisoria)
   ----------------------------------------------------------------------------
   El desplegable de la barra con los usuarios REALES de la base, por su
   id_persona (el mismo identificador de CiDiTuc). Elegir uno define quién
   firma cada acto y qué módulos se ven; el backend reconoce a esa persona y
   le aplica el rol QUE DICE LA BASE, no el que declare el navegador.

   Cuando los agentes estén registrados en CiDiTuc, la Dirección reemplaza en
   Accesos → Usuarios los identificadores de arranque (RELEVADOR-1, etc.) por
   el id_persona real de cada uno. Y cuando el sistema se sume al login único,
   este componente entero se reemplaza por la sesión de CiDiTuc.
   ============================================================================ */

import { useRol } from '../auth/rolContexto';
import { LISTA_ROLES } from '../auth/roles';
import { useDatos } from '../datos/datosContexto';

function SelectorRol() {
  const { agente, elegirAgente } = useRol();
  const { usuarios } = useDatos();
  const activos = usuarios.filter((u) => u.activo !== false);

  return (
    <div className="selector-rol">
      <span
        className="selector-rol-aviso"
        title="Identificación provisoria por id_persona: cuando el sistema se sume a CiDiTuc, acá va la sesión del ingreso único"
      >
        USUARIO
      </span>
      <select
        className="selector-rol-select"
        value={agente?.id ?? ''}
        onChange={(e) => elegirAgente(activos.find((u) => String(u.id) === e.target.value) ?? null)}
        aria-label="Elegí tu usuario"
      >
        <option value="">Elegí tu usuario…</option>
        {activos.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nombre} — {LISTA_ROLES.find((r) => r.id === u.rol)?.etiqueta ?? u.rol}
          </option>
        ))}
      </select>
    </div>
  );
}

export default SelectorRol;
