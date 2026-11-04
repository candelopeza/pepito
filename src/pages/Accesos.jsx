/* ============================================================================
   pages/Accesos.jsx  —  ACCESOS  (URL: /#/accesos/usuarios y /#/accesos/tipos-usuario)
   ----------------------------------------------------------------------------
   Quién entra (Usuarios, por id_persona) y qué puede hacer cada tipo (Tipos
<<<<<<< HEAD
   de usuario). Eran dos pestañas; son dos caras de lo mismo. Los tipos de
   usuario los cambia solo el administrador. Desde el 03/11/2026 el
   administrativo también los ve, para consulta y sin la fila del
   administrador (TiposUsuario.jsx).
   ============================================================================ */

import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
=======
   de usuario). Son dos pestañas de una misma pantalla. Los tipos de usuario
   siguen siendo territorio exclusivo del administrador.

   LA PESTAÑA ACTIVA VIVE EN LA DIRECCIÓN, no en un estado interno. Así:
     - la llave de la grilla de Usuarios puede llevar directo a los permisos
       de ese tipo (/accesos/tipos-usuario?rol=notificador) y la ventana se
       abre sola (TiposUsuario lee ?rol=);
     - el botón Atrás del navegador vuelve a la pestaña anterior;
     - un marcador a /accesos/tipos-usuario abre esa pestaña.
   /accesos a secas es Usuarios.
   ============================================================================ */

import { useLocation, useNavigate } from 'react-router-dom';
>>>>>>> 702db7463f4a9f2b84fa898cde5e78ca876911d4
import PageHeader from '../components/ui/PageHeader';
import Usuarios from './accesos/Usuarios';
import TiposUsuario from './accesos/TiposUsuario';
import { useRol } from '../auth/rolContexto';
import { ROL_ADMINISTRADOR } from '../config/modulos';

const SECCIONES = [
<<<<<<< HEAD
  { id: 'usuarios', etiqueta: 'Usuarios', Componente: Usuarios },
  { id: 'tipos', etiqueta: 'Tipos de usuario', Componente: TiposUsuario, roles: ['administrador', 'administrativo'] },
=======
  { id: 'usuarios', etiqueta: 'Usuarios', ruta: '/accesos/usuarios', Componente: Usuarios },
  { id: 'tipos', etiqueta: 'Tipos de usuario', ruta: '/accesos/tipos-usuario', Componente: TiposUsuario, roles: [ROL_ADMINISTRADOR] },
>>>>>>> 702db7463f4a9f2b84fa898cde5e78ca876911d4
];

function Accesos() {
  const { rol } = useRol();
  const { pathname } = useLocation();
  const navegar = useNavigate();

  const visibles = SECCIONES.filter((s) => !s.roles || s.roles.includes(rol));
<<<<<<< HEAD
  const veTipos = visibles.some((s) => s.id === 'tipos');
  // ?rol=... abre los permisos de ese tipo de usuario (TiposUsuario lo lee de la URL).
  const [params, setParams] = useSearchParams();
  const [activa, setActiva] = useState(veTipos && params.get('rol') ? 'tipos' : visibles[0]?.id);
  const seccion = visibles.find((s) => s.id === activa) ?? visibles[0];
=======
  // La que pide la dirección; si no existe o este rol no la ve, la primera.
  const seccion = visibles.find((s) => pathname.startsWith(s.ruta)) ?? visibles[0];
>>>>>>> 702db7463f4a9f2b84fa898cde5e78ca876911d4

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
            onClick={() => navegar(s.ruta)}
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
