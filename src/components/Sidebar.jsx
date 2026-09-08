/* ============================================================================
   Sidebar.jsx  —  MENÚ LATERAL IZQUIERDO (plegable, filtrado por rol)
   ----------------------------------------------------------------------------
   Los ítems YA NO ESTÁN ESCRITOS ACÁ: salen de src/config/modulos.js, filtrados
   según el rol activo. Cada usuario ve solo lo suyo.

   FORMA DEL MENÚ:
       INICIO                    <- link suelto, siempre visible, sin flecha
       OPERATIVO            ⌄    <- sección plegable
           Locales
           Relevamientos
           ...
       CONFIGURACIÓN        ⌄    <- sección plegable
           Rubros
           Sedes

   Las secciones salen del campo `grupo` de cada módulo ('operativo' /
   'configuracion'). Si a un rol no le queda ningún ítem en una sección, la
   sección entera no se dibuja (ni el título ni la flecha). Sin eso, un
   relevador vería un título "CONFIGURACIÓN" con la nada abajo.

   QUÉ SECCIÓN ARRANCA ABIERTA: la que contiene la pantalla en la que estás.
   Si estás en el Inicio (o en una ruta que no está en ninguna sección), se
   abre la primera. Así nunca entrás a una pantalla y ves su propio ítem
   escondido dentro de una sección cerrada.

   USADO EN: components/Layout.jsx
   ESTILOS:  App.css -> sección 3 (SIDEBAR)

   PROPS:
     onNavegar (función)  la manda Layout.jsx. Se llama al tocar cualquier
                          link. Sirve para cerrar el menú: como se dibuja
                          ENCIMA del contenido, si quedara abierto taparía
                          justo la pantalla que acabás de abrir.

   IMPORTANTE — usa NavLink, no Link:
   NavLink le pone solo la clase "active" al ítem de la URL actual. Por eso
   el resaltado azul del ítem seleccionado no se programa acá: sale gratis.
   El `end` del link de Inicio es necesario: sin él, "Inicio" queda resaltado
   en TODAS las páginas (porque "/" es prefijo de todo).

   SI HAY PROBLEMA ACÁ:
     - "A un rol le falta un ítem del menú": NO se toca este archivo.
        Se agrega ese rol al array `roles` del módulo en config/modulos.js.
     - "Agregué un módulo y no aparece en el menú": ¿le pusiste `grupo`?
        Si el grupo no es 'operativo' ni 'configuracion', no entra en ninguna
        de las dos secciones y no se dibuja en ningún lado.
     - "Quiero una sección nueva en el menú": se agrega al array SECCIONES de
        acá abajo Y se usa ese mismo id en el `grupo` de los módulos.
     - "Un ítem no lleva a nada": la `ruta` de config/modulos.js no coincide
        con el `path` de App.jsx.
     - "Quedan dos ítems resaltados a la vez": es el `end` del NavLink.
     - "Toco el título y no se abre": el estado es `abiertas`, más abajo.
     - "No veo el menú": lo esconde el botón ☰ de la navbar (el que decide
        mostrarlo es Layout.jsx, no este archivo).
   ============================================================================ */

import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { useRol } from '../auth/rolContexto';
import { modulosPorRolYGrupo } from '../config/modulos';

// Las secciones del menú, en el orden en que se muestran.
// `id` tiene que coincidir con el campo `grupo` de config/modulos.js.
const SECCIONES = [
  { id: 'operativo', titulo: 'Oficina' },
  { id: 'campo', titulo: 'Campo' },
  { id: 'herramientas', titulo: 'Herramientas' },
  { id: 'configuracion', titulo: 'Configuración' },
  { id: 'portal', titulo: 'Portal del titular' },
];

function Sidebar({ onNavegar }) {
  // ===== A. QUÉ VE ESTE USUARIO =====
  const { rol } = useRol();
  const { pathname } = useLocation();

  // Cada sección con sus módulos ya filtrados por rol. Las que quedaron
  // vacías se descartan acá, así abajo no hay que preguntarlo de nuevo.
  const secciones = SECCIONES
    .map((s) => ({ ...s, modulos: modulosPorRolYGrupo(rol, s.id) }))
    .filter((s) => s.modulos.length > 0);

  // ===== B. QUÉ SECCIONES ESTÁN ABIERTAS =====
  // Es un array de ids. Se puede tener más de una abierta a la vez (no es un
  // acordeón de "una sola"): si alguien despliega dos, que queden las dos.
  //
  // El useState con función se ejecuta UNA sola vez, al montarse. Si se
  // pusiera el cálculo directo, se recalcularía en cada render y se volvería
  // a cerrar la sección que el usuario acaba de abrir a mano.
  const [abiertas, setAbiertas] = useState(() => {
    const laDeLaPantallaActual = secciones.find((s) =>
      s.modulos.some((m) => pathname.startsWith(m.ruta))
    );
    // Si no estamos parados en ningún módulo (por ejemplo, en el Inicio),
    // se abre la primera para que el menú no arranque todo cerrado.
    const inicial = laDeLaPantallaActual ?? secciones[0];
    return inicial ? [inicial.id] : [];
  });

  function alternarSeccion(id) {
    setAbiertas((previas) =>
      previas.includes(id) ? previas.filter((x) => x !== id) : [...previas, id]
    );
  }

  // ===== C. LO QUE SE DIBUJA =====
  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">

        {/* ============ INICIO ============
            Está fijo acá y no en config/modulos.js: lo ven todos los roles
            siempre, así que no necesita entrada en la tabla de permisos.
            Va suelto, fuera de toda sección, como en el diseño. */}
        <NavLink to="/" end className="nav-item" onClick={onNavegar}>Inicio</NavLink>

        {/* ============ SECCIONES PLEGABLES ============ */}
        {secciones.map((seccion) => {
          const abierta = abiertas.includes(seccion.id);

          return (
            <div className="nav-seccion" key={seccion.id}>

              {/* Es un <button> y no un <div>: así se abre con Enter o barra
                  espaciadora, y el lector de pantalla avisa si está desplegado
                  o no (eso lo hace el aria-expanded). */}
              <button
                type="button"
                className="nav-seccion-boton"
                onClick={() => alternarSeccion(seccion.id)}
                aria-expanded={abierta}
              >
                <span>{seccion.titulo}</span>
                <span className="nav-seccion-flecha">
                  {abierta
                    ? <KeyboardArrowUpIcon fontSize="small" />
                    : <KeyboardArrowDownIcon fontSize="small" />}
                </span>
              </button>

              {/* Los ítems de adentro. Se desmontan al cerrar, no se esconden
                  con CSS: así no quedan links invisibles pero navegables con
                  el tabulador. */}
              {abierta && (
                <div className="nav-sublista">
                  {seccion.modulos.map((m) => (
                    <NavLink
                      key={m.id}
                      to={m.ruta}
                      className="nav-subitem"
                      onClick={onNavegar}
                    >
                      {m.titulo}
                    </NavLink>
                  ))}
                </div>
              )}

            </div>
          );
        })}

      </nav>
    </aside>
  );
}

export default Sidebar;
