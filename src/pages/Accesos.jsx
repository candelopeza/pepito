/* ============================================================================
   pages/Accesos.jsx  —  ACCESOS  (URL: /#/accesos)
   ----------------------------------------------------------------------------
   Quién entra (Usuarios, por id_persona) y qué puede hacer cada tipo (Tipos
   de usuario). Eran dos pestañas; son dos caras de lo mismo. Los tipos de
   usuario siguen siendo territorio exclusivo del administrador.
   ============================================================================ */

import { useState } from 'react';
import PageHeader from '../components/ui/PageHeader';
import Usuarios from './accesos/Usuarios';
import TiposUsuario from './accesos/TiposUsuario';
import { useRol } from '../auth/rolContexto';

const SECCIONES = [
  { id: 'usuarios', etiqueta: 'Usuarios', Componente: Usuarios },
  { id: 'tipos', etiqueta: 'Tipos de usuario', Componente: TiposUsuario, roles: ['administrador'] },
];

function Accesos() {
  const { rol } = useRol();
  const visibles = SECCIONES.filter((s) => !s.roles || s.roles.includes(rol));
  const [activa, setActiva] = useState(visibles[0]?.id);
  const seccion = visibles.find((s) => s.id === activa) ?? visibles[0];

  return (
    <>
      <PageHeader etiqueta="ACCESOS" titulo="ACCESOS AL SISTEMA" botonVolver />

      <div className="pestanas-internas">
        {visibles.map((s) => (
          <button
            key={s.id}
            type="button"
            className={s.id === seccion?.id ? 'btn-primario' : 'btn-secundario'}
            onClick={() => setActiva(s.id)}
          >
            {s.etiqueta}
          </button>
        ))}
      </div>

      {seccion && <seccion.Componente />}
    </>
  );
}

export default Accesos;
