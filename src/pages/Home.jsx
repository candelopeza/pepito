/* ============================================================================
   pages/Home.jsx  —  PANTALLA DE INICIO  (URL: /#/)
   ----------------------------------------------------------------------------
   RUTA EN: App.jsx -> <Route index element={<Home />} />
   La ven TODOS los roles, pero cada uno ve DISTINTAS TARJETAS.

   ESTA PANTALLA TIENE 4 BLOQUES (numerados abajo en el return):
     1. Encabezado          -> componente PageHeader
     2. Barra rol + fecha   -> el rol sale del contexto, la fecha se calcula acá
     3. Separador "MÓDULOS PRINCIPALES"
     4. Grilla de tarjetas  -> FILTRADA POR ROL

   >>> LAS TARJETAS YA NO ESTÁN ESCRITAS ACÁ <<<
   Antes había un array `modulos` en este archivo. Se mudó a
   src/config/modulos.js, que ahora alimenta a la vez las tarjetas de esta
   pantalla y los ítems del menú lateral. Así no se pueden desalinear.

   DÓNDE SE AGREGA UN MÓDULO NUEVO (ya no se toca este archivo):
     1. sumarlo a src/config/modulos.js con enInicio: true
     2. sumarle su <Route> en App.jsx

   SI HAY PROBLEMA ACÁ:
     - "A un rol le falta / le sobra una tarjeta": NO se toca este archivo.
        Es el array `roles` de ese módulo en src/config/modulos.js.
     - "Agregué un módulo y no sale la tarjeta": ¿le pusiste enInicio: true?
        Los de configuración lo tienen en false a propósito.
     - "La tarjeta aparece pero da pantalla vacía": falta el <Route>.
     - "La fecha sale en inglés o rara": es el toLocaleDateString('es-ES')
        de abajo. Depende del navegador del usuario.
     - DATOS: esta pantalla no consulta ningún backend. Todo es fijo.
   ============================================================================ */

import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import { useRol } from '../auth/rolContexto';
import { modulosDeInicio } from '../config/modulos';

function Home() {

  // ===== A. QUIÉN ESTÁ USANDO EL SISTEMA =====
  // `datosRol` trae la etiqueta linda para mostrar ("Administrador", etc.).
  const { rol, datosRol } = useRol();

  // ===== B. QUÉ TARJETAS LE CORRESPONDEN =====
  // Filtrado en un solo lugar: src/config/modulos.js.
  const modulos = modulosDeInicio(rol);

  // ===== C. FECHA DE HOY =====
  // Se calcula en cada render, con la fecha de la máquina del usuario.
  const hoy = new Date();
  const fechaFormateada = hoy.toLocaleDateString('es-ES', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  // ===== D. LO QUE SE DIBUJA =====
  return (
    <>
      {/* ---------- BLOQUE 1: encabezado ----------
          Sin botonVolver: ya estamos en el inicio. */}
      <PageHeader etiqueta="INICIO" titulo="SISTEMA DE GRANDES GENERADORES" />

      {/* ---------- BLOQUE 2: rol + fecha ----------
          El rol ya NO está escrito fijo: muestra el que esté activo.
          Mientras no haya login, se cambia con el selector de la navbar. */}
      <div className="info-bar">
        <div className="admin-badge">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#1976d2">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
          <span>{datosRol.etiqueta}</span>
        </div>
        <span className="fecha">{fechaFormateada}</span>
      </div>

      {/* ---------- BLOQUE 3: separador ---------- */}
      <div className="accesos-header">
        <span>MÓDULOS PRINCIPALES</span>
      </div>

      {/* ---------- BLOQUE 4: grilla de tarjetas ----------
          Una tarjeta por módulo permitido. Todas llevan `to`, o sea que todas
          navegan (a diferencia de las de Trámites o Documentación). */}
      {modulos.length > 0 ? (
        <div className="grid-accesos">
          {modulos.map((m) => (
            <Card key={m.id} titulo={m.titulo} descripcion={m.descripcion} to={m.ruta} />
          ))}
        </div>
      ) : (
        /* Red de seguridad: hoy no pasa, porque los 4 roles tienen al menos
           un módulo. Pero si alguien crea un rol sin permisos, mejor un aviso
           claro que una pantalla vacía que parece un error del sistema. */
        <p className="aviso-sin-modulos">
          Tu usuario no tiene módulos asignados. Comunicate con el administrador
          del sistema.
        </p>
      )}
    </>
  );
}

export default Home;
