/* ============================================================================
   pages/Local.jsx  —  PADRÓN DE ESTABLECIMIENTOS  (URL: /#/locales)
   ----------------------------------------------------------------------------
   RUTA EN: App.jsx -> <Route path="locales" ... />
   ESTILOS: App.css -> secciones 9 (TABLAS) y 12 (MODAL)

   BLOQUES DE ESTA PANTALLA:
     1. Encabezado (PageHeader, con botón Volver)
     2. Separador "LISTADO"
     3. Tabla de locales
     4. Modal de ver / editar (solo cuando hay un local seleccionado)

   CÓMO FUNCIONAN LOS BOTONES DE LA COLUMNA ACCIONES:
       "Ver"     -> abre el modal con los campos BLOQUEADOS. Lo ven todos.
       "Editar"  -> abre el MISMO modal con los campos habilitados.
                    SOLO aparece si el rol tiene permiso de edición.
   Los dos usan el mismo componente (components/FormLocal.jsx); lo único que
   cambia es la prop `soloLectura`.

   >>> QUIÉN PUEDE EDITAR NO SE DEFINE ACÁ <<<
   Sale de `rolesEdicion` del módulo 'locales' en src/config/modulos.js.
   Hoy: solo administrador. Para sumar otro rol se agrega ahí, no acá.

   >>> DATOS DE PRUEBA <<<
   Los 3 locales están escritos a mano abajo. NO hay backend, así que
   LOS CAMBIOS SE PIERDEN AL RECARGAR (F5). Es lo esperado por ahora.
   Cuando se conecte la API hay que tocar dos puntos, los dos marcados abajo:
   la carga inicial (useState) y guardarLocal().

   SI HAY PROBLEMA ACÁ:
     - "No veo el botón Editar": el rol activo no está en `rolesEdicion` del
        módulo 'locales' (config/modulos.js). Probá con Administrador.
     - "Guardo y la tabla no se actualiza": mirá guardarLocal(). Tiene que
        crear un array NUEVO; si se modifica el existente, React no se entera.
     - "Guardo, recargo y volvió atrás": correcto, no hay backend todavía.
     - "Un estado sale con badge gris": ese texto no está en ESTADOS_LOCAL
        (config/catalogos.js). La comparación es exacta, con tilde y todo.
     - "Se rompe la tabla al agregar una columna": hay que tocar DOS lugares,
        el <th> del thead Y el <td> del tbody. Si no, se descuadra.

   PENDIENTE: no hay buscador, ni filtros, ni paginado, ni botón "Nuevo local"
   (esto último ya es casi gratis: el mismo FormLocal con un local vacío).
   ============================================================================ */

import { useState } from 'react';
import PageHeader from '../components/ui/PageHeader';
import Modal from '../components/ui/Modal';
import FormLocal from '../components/FormLocal';
import { useRol } from '../auth/rolContexto';
import { puedeEditar } from '../config/modulos';
import { colorEstado } from '../config/catalogos';

function Local() {

  // ===== A. PERMISOS =====
  // Si es false, el botón "Editar" directamente no se dibuja.
  const { rol } = useRol();
  const puedeEditarLocales = puedeEditar(rol, 'locales');

  // ===== B. DATOS (fijos, de prueba) =====
  // >>> PUNTO 1 DE 2 PARA CONECTAR EL BACKEND <<<
  // Acá va el fetch dentro de un useEffect, más los estados de "cargando" y
  // "error". Hoy el array arranca fijo.
  const [locales, setLocales] = useState([
    { id: 1, nombre: 'Supermercado Norte', cuit: '30-12345678-9', direccion: 'Av. Alem 123', rubro: 'Comercial', estado: 'Activo' },
    { id: 2, nombre: 'Industria Sur', cuit: '30-98765432-1', direccion: 'Ruta 9 Km 5', rubro: 'Industrial', estado: 'En trámite' },
    { id: 3, nombre: 'Farmacia Centro', cuit: '30-55555555-5', direccion: 'San Martín 456', rubro: 'Servicios', estado: 'Activo' },
  ]);

  // ===== C. QUÉ LOCAL ESTÁ ABIERTO EN EL MODAL =====
  // null = modal cerrado.
  // { local, soloLectura } = modal abierto con ese local.
  // Van juntos en un solo estado a propósito: si fueran dos estados separados
  // se pueden desincronizar (modal abierto sin local, o al revés).
  const [seleccion, setSeleccion] = useState(null);

  function abrirVer(local) {
    setSeleccion({ local, soloLectura: true });
  }

  function abrirEditar(local) {
    setSeleccion({ local, soloLectura: false });
  }

  function cerrarModal() {
    setSeleccion(null);
  }

  // ===== D. GUARDAR LOS CAMBIOS =====
  // >>> PUNTO 2 DE 2 PARA CONECTAR EL BACKEND <<<
  // Acá va el PUT/PATCH a la API. Hoy solo actualiza la lista en memoria.
  //
  // OJO con el .map(): crea un array NUEVO en vez de modificar el que ya
  // existe. React compara por identidad; si se modificara el array original,
  // la tabla no se volvería a dibujar y parecería que el guardado no funcionó.
  function guardarLocal(localModificado) {
    setLocales((previos) =>
      previos.map((l) => (l.id === localModificado.id ? localModificado : l))
    );
    cerrarModal();
  }

  // ===== E. LO QUE SE DIBUJA =====
  return (
    <>
      {/* ---------- BLOQUE 1: encabezado ---------- */}
      <PageHeader etiqueta="LOCALES" titulo="PADRÓN DE ESTABLECIMIENTOS" botonVolver />

      {/* ---------- BLOQUE 2: separador ---------- */}
      <div className="accesos-header">
        <span>LISTADO</span>
      </div>

      {/* ---------- BLOQUE 3: tabla ---------- */}
      <div className="tabla-contenedor">
        <table className="tabla-datos">

          {/* --- Títulos de columna. Tienen que estar en el MISMO orden
                  que los <td> del tbody. --- */}
          <thead>
            <tr>
              <th>ID</th>
              <th>Nombre</th>
              <th>CUIT</th>
              <th>Dirección</th>
              <th>Rubro</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>

          {/* --- Una fila por local --- */}
          <tbody>
            {locales.map((l) => (
              <tr key={l.id}>
                <td>{l.id}</td>
                <td>{l.nombre}</td>
                <td>{l.cuit}</td>
                <td>{l.direccion}</td>
                <td>{l.rubro}</td>

                {/* El color del badge sale de config/catalogos.js.
                    Antes estaba escrito acá con un if, y solo contemplaba
                    dos estados posibles. */}
                <td>
                  <span className={`badge badge-${colorEstado(l.estado)}`}>
                    {l.estado}
                  </span>
                </td>

                {/* --- Columna Acciones --- */}
                <td>
                  <div className="celda-acciones">
                    <button
                      type="button"
                      className="btn-tabla"
                      onClick={() => abrirVer(l)}
                    >
                      Ver
                    </button>

                    {/* "Editar" solo si el rol tiene permiso. No se muestra
                        deshabilitado: se oculta, igual que las tarjetas y el
                        menú, para mantener el mismo criterio en todo el
                        sistema. */}
                    {puedeEditarLocales && (
                      <button
                        type="button"
                        className="btn-tabla btn-tabla-editar"
                        onClick={() => abrirEditar(l)}
                      >
                        Editar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>

        </table>
      </div>

      {/* ---------- BLOQUE 4: modal de ver / editar ----------
          El `seleccion &&` de afuera es importante: hace que el formulario se
          desmonte del todo al cerrar, así el próximo local arranca limpio en
          vez de mostrar lo que se escribió en el anterior. */}
      {seleccion && (
        <Modal
          abierto
          titulo={seleccion.soloLectura ? 'Datos del local' : 'Editar local'}
          onCerrar={cerrarModal}
        >
          <FormLocal
            local={seleccion.local}
            soloLectura={seleccion.soloLectura}
            onGuardar={guardarLocal}
            onCancelar={cerrarModal}
          />
        </Modal>
      )}
    </>
  );
}

export default Local;
