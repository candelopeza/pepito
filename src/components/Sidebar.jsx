/* ============================================================================
   Sidebar.jsx  —  MENÚ LATERAL IZQUIERDO (filtrado por rol)
   ----------------------------------------------------------------------------
   Los ítems YA NO ESTÁN ESCRITOS ACÁ: salen de src/config/modulos.js, filtrados
   según el rol activo. Cada usuario ve solo lo suyo.

   Sigue dividido en 2 grupos:
       GRUPO 1 "Operativo"      -> módulos con grupo: 'operativo'
       GRUPO 2 "Configuración"  -> módulos con grupo: 'configuracion'
   Si a un rol no le queda ningún ítem en un grupo, el grupo entero no se
   dibuja (ni su título ni la línea separadora). Sin eso, un relevador vería
   un título "Configuración" con la nada abajo.

   USADO EN: components/Layout.jsx
   ESTILOS:  App.css -> sección 3 (SIDEBAR)

   IMPORTANTE — usa NavLink, no Link:
   NavLink le pone solo la clase "active" al ítem de la URL actual. Por eso
   el resaltado azul del ítem seleccionado no se programa acá: sale gratis.
   El `end` del link de Inicio es necesario: sin él, "Inicio" queda resaltado
   en TODAS las páginas (porque "/" es prefijo de todo).

   SI HAY PROBLEMA ACÁ:
     - "A un rol le falta un ítem del menú": NO se toca este archivo.
        Se agrega ese rol al array `roles` del módulo en config/modulos.js.
     - "Agregué un módulo y no aparece en el menú": ¿le pusiste `grupo`?
        Si el grupo no es 'operativo' ni 'configuracion', no entra en ninguno
        de los dos bloques y no se dibuja en ningún lado.
     - "Un ítem no lleva a nada": la `ruta` de config/modulos.js no coincide
        con el `path` de App.jsx.
     - "Quedan dos ítems resaltados a la vez": es el `end` del NavLink.
     - "En el celular no hay menú": es a propósito (App.css sección 11).
        El menú hamburguesa está pendiente.
   ============================================================================ */

import { NavLink } from 'react-router-dom';
import { useRol } from '../auth/rolContexto';
import { modulosPorRolYGrupo } from '../config/modulos';

function Sidebar() {
  // ===== A. QUÉ VE ESTE USUARIO =====
  const { rol } = useRol();
  const operativos = modulosPorRolYGrupo(rol, 'operativo');
  const configuracion = modulosPorRolYGrupo(rol, 'configuracion');

  // ===== B. LO QUE SE DIBUJA =====
  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">

        {/* ============ GRUPO 1: OPERATIVO ============
            "Inicio" está fijo acá y no en config/modulos.js: lo ven todos los
            roles siempre, así que no necesita entrada en la tabla de permisos. */}
        <div className="nav-group">
          <span className="nav-label">Operativo</span>

          <NavLink to="/" end className="nav-link">Inicio</NavLink>

          {operativos.map((m) => (
            <NavLink key={m.id} to={m.ruta} className="nav-link">
              {m.titulo}
            </NavLink>
          ))}
        </div>

        {/* ============ GRUPO 2: CONFIGURACIÓN ============
            Solo se dibuja si al rol le corresponde al menos un ítem.
            Hoy es exclusivo del administrador. */}
        {configuracion.length > 0 && (
          <>
            {/* Separador: va acá adentro para que no quede una línea suelta
                cuando el grupo de abajo no se muestra. */}
            <div className="nav-divider"></div>

            <div className="nav-group">
              <span className="nav-label">Configuración</span>
              {configuracion.map((m) => (
                <NavLink key={m.id} to={m.ruta} className="nav-link">
                  {m.titulo}
                </NavLink>
              ))}
            </div>
          </>
        )}

      </nav>
    </aside>
  );
}

export default Sidebar;
