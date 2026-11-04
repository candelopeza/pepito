/* ============================================================================
   pages/Accesos.jsx  —  ACCESOS  (URL: /#/accesos)
   ----------------------------------------------------------------------------
   Quién entra (Usuarios, por id_persona) y qué puede hacer cada tipo (Tipos
   de usuario). Eran dos pestañas; son dos caras de lo mismo. Los tipos de
   usuario los cambia solo el administrador. Desde el 03/11/2026 el
   administrativo también los ve, para consulta y sin la fila del
   administrador (TiposUsuario.jsx).
   ============================================================================ */

import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import Usuarios from './accesos/Usuarios';
import TiposUsuario from './accesos/TiposUsuario';
import { useRol } from '../auth/rolContexto';

const SECCIONES = [
  { id: 'usuarios', etiqueta: 'Usuarios', Componente: Usuarios },
  { id: 'tipos', etiqueta: 'Tipos de usuario', Componente: TiposUsuario, roles: ['administrador', 'administrativo'] },
];

function Accesos() {
  const { rol } = useRol();
  const visibles = SECCIONES.filter((s) => !s.roles || s.roles.includes(rol));
  const veTipos = visibles.some((s) => s.id === 'tipos');
  // ?rol=... abre los permisos de ese tipo de usuario (TiposUsuario lo lee de la URL).
  const [params, setParams] = useSearchParams();
  const [activa, setActiva] = useState(veTipos && params.get('rol') ? 'tipos' : visibles[0]?.id);
  const seccion = visibles.find((s) => s.id === activa) ?? visibles[0];

  /* La llave de Usuarios: pasa a la pestaña Tipos de usuario con los permisos
     del tipo de esa persona abiertos. Antes llevaba a /accesos/tipos-usuario,
     que desde que las dos pantallas son pestañas redirige acá sin el ?rol= y
     no abría nada. Solo la recibe quien ve Tipos de usuario. */
  const abrir = useCallback(
    (idRol) => {
      setActiva('tipos');
      setParams({ rol: idRol });
    },
    [setParams],
  );
  const abrirPermisos = veTipos ? abrir : undefined;

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

      {seccion && <seccion.Componente abrirPermisos={abrirPermisos} />}
    </>
  );
}

export default Accesos;
