/* ============================================================================
   pages/Accesos.jsx  —  ACCESOS  (URL: /#/accesos/usuarios y /#/accesos/tipos-usuario)
   ----------------------------------------------------------------------------
   Quién entra (Usuarios, por id_persona) y qué puede hacer cada tipo (Tipos
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
import PageHeader from '../components/ui/PageHeader';
import Usuarios from './accesos/Usuarios';
import TiposUsuario from './accesos/TiposUsuario';
import { useRol } from '../auth/rolContexto';
import { ROL_ADMINISTRADOR } from '../config/modulos';

const SECCIONES = [
  { id: 'usuarios', etiqueta: 'Usuarios', ruta: '/accesos/usuarios', Componente: Usuarios },
  { id: 'tipos', etiqueta: 'Tipos de usuario', ruta: '/accesos/tipos-usuario', Componente: TiposUsuario, roles: [ROL_ADMINISTRADOR] },
];

function Accesos() {
  const { rol } = useRol();
  const { pathname } = useLocation();
  const navegar = useNavigate();

  const visibles = SECCIONES.filter((s) => !s.roles || s.roles.includes(rol));
  // La que pide la dirección; si no existe o este rol no la ve, la primera.
  const seccion = visibles.find((s) => pathname.startsWith(s.ruta)) ?? visibles[0];

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

      {seccion && <seccion.Componente />}
    </>
  );
}

export default Accesos;
