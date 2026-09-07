/* ============================================================================
   pages/Home.jsx  —  PANTALLA DE INICIO  (URL: /#/)
   ----------------------------------------------------------------------------
   La ven TODOS los roles, pero cada uno ve distintas tarjetas.

   >>> LAS TARJETAS NO ESTÁN ESCRITAS ACÁ <<<
   Salen de src/config/modulos.js, que alimenta a la vez estas tarjetas y los
   ítems del menú lateral. Así no se pueden desalinear.

   Para agregar un módulo: sumarlo a config/modulos.js con enInicio: true y
   agregarle su <Route> en App.jsx. Este archivo no se toca.

   >>> LA PANTALLA ARRANCA LIMPIA, A PROPÓSITO <<<
   Una sola grilla de tarjetas, sin números ni resúmenes arriba. El inicio es
   el tablero de acceso al sistema; los pendientes con su contador están en el
   Tablero de control, que es la pantalla de trabajo diario. Hubo una versión
   con un resumen de bandejas acá y con las tarjetas partidas en secciones
   (Oficina / Campo / Portal): se volvió a esta porque el inicio tiene que ser
   una sola pasada de ojo, no otra pantalla para leer.

   Si mañana se quiere volver a agrupar por sección, el dato está: cada módulo
   de config/modulos.js ya trae su `grupo`.

   DATOS: esta pantalla no consulta nada. Solo la fecha de la máquina.
   ============================================================================ */

import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import { useRol } from '../auth/rolContexto';
import { modulosDeInicio } from '../config/modulos';

function Home() {
  const { rol, datosRol, usuario } = useRol();

  const modulos = modulosDeInicio(rol);

  const fechaFormateada = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <>
      <PageHeader etiqueta="INICIO" titulo="SISTEMA DE GRANDES GENERADORES" />

      {/* ---------- Quién sos y cuándo ---------- */}
      <div className="info-bar">
        <div className="admin-badge">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#1976d2">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
          <span>
            {usuario.nombre} · {datosRol.etiqueta}
          </span>
        </div>
        <span className="fecha">{fechaFormateada}</span>
      </div>

      {/* ---------- Separador ---------- */}
      <div className="accesos-header">
        <span>Módulos principales</span>
      </div>

      {/* ---------- La grilla, plana ---------- */}
      {modulos.length > 0 ? (
        <div className="grid-accesos">
          {modulos.map((m) => (
            <Card key={m.id} titulo={m.titulo} descripcion={m.descripcion} to={m.ruta} />
          ))}
        </div>
      ) : (
        /* Si alguien crea un rol sin permisos, mejor un aviso claro que una
           pantalla vacía que parece un error del sistema. */
        <p className="aviso-sin-modulos">
          Tu usuario no tiene módulos asignados. Comunicate con el administrador del sistema.
        </p>
      )}
    </>
  );
}

export default Home;
