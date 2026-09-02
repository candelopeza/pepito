/* ============================================================================
   pages/Local.jsx  —  PADRÓN DE ESTABLECIMIENTOS  (URL: /#/locales)
   ----------------------------------------------------------------------------
   RUTA EN: App.jsx -> <Route path="locales" ... />
   ESTILOS: App.css -> "BARRA DE ACCIONES DE TABLA", "GRILLA (MUI DATA GRID)",
            sección 9 (badges de estado) y sección 12 (MODAL)

   ANTES esta pantalla era una tabla HTML fija: sin buscador, sin filtros, sin
   paginado y sin alta. AHORA usa la MISMA grilla que Trámites (MUI Data Grid),
   así las dos pantallas de datos se ven y se manejan igual.

   BLOQUES DE ESTA PANTALLA:
     1. Encabezado (PageHeader, con botón Volver)
     2. Barra de acciones: 2 buscadores + nuevo / imprimir / descargar
     3. Grilla (MUI Data Grid)
     4. Modal de ver / editar / nuevo (solo cuando hay un local seleccionado)

   CÓMO FUNCIONAN LOS BOTONES DE LA COLUMNA ACCIONES:
       "Ver"     -> abre el modal con los campos BLOQUEADOS. Lo ven todos.
       "Editar"  -> abre el MISMO modal con los campos habilitados.
                    SOLO aparece si el rol tiene permiso de edición.
   Los dos usan el mismo componente (components/FormLocal.jsx); lo único que
   cambia es la prop `soloLectura`. El botón "+" de arriba usa ESE MISMO
   formulario con un local vacío.

   >>> QUIÉN PUEDE EDITAR NO SE DEFINE ACÁ <<<
   Sale de `rolesEdicion` del módulo 'locales' en src/config/modulos.js.
   Hoy: solo administrador. Para sumar otro rol se agrega ahí, no acá.
   El mismo permiso gobierna "Editar" y el alta: si no podés editar, tampoco
   te aparece el "+".

   >>> DATOS DE PRUEBA <<<
   Los 3 locales están escritos a mano abajo. NO hay backend, así que
   LOS CAMBIOS SE PIERDEN AL RECARGAR (F5). Es lo esperado por ahora.
   Cuando se conecte la API hay que tocar dos puntos, los dos marcados abajo:
   la carga inicial (useState) y guardarLocal().

   SI HAY PROBLEMA ACÁ:
     - "No veo el botón Editar ni el +": el rol activo no está en
       `rolesEdicion` del módulo 'locales' (config/modulos.js). Probá con
       Administrador.
     - "Guardo y la tabla no se actualiza": mirá guardarLocal(). Tiene que
       crear un array NUEVO; si se modifica el existente, React no se entera.
     - "Guardo, recargo y volvió atrás": correcto, no hay backend todavía.
     - "Un estado sale con badge gris": ese texto no está en ESTADOS_LOCAL
       (config/catalogos.js). La comparación es exacta, con tilde y todo.
     - "Imprimir / Descargar no hacen nada": los dos van por `apiRef`, que se
       conecta con la prop `apiRef` del <DataGrid>. Si se saca esa prop, mueren.
     - "Busco y no filtra": los buscadores filtran en `filas` (useMemo), no en
       la grilla. Los filtros propios de cada columna funcionan ENCIMA de eso.
   ============================================================================ */

import { useMemo, useState } from 'react';
import {
  DataGrid,
  GridToolbar,
  GridActionsCellItem,
  useGridApiRef,
} from '@mui/x-data-grid';
import { esES } from '@mui/x-data-grid/locales';
import AddIcon from '@mui/icons-material/Add';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EditIcon from '@mui/icons-material/Edit';
import PageHeader from '../components/ui/PageHeader';
import Modal from '../components/ui/Modal';
import FormLocal from '../components/FormLocal';
import { useRol } from '../auth/rolContexto';
import { puedeEditar } from '../config/modulos';
import { RUBROS, ESTADOS_LOCAL, colorEstado } from '../config/catalogos';

// Los valores que puede tomar la columna Estado. Salen del catálogo para que
// el desplegable del filtro y el del formulario no se desalineen.
const ESTADOS = ESTADOS_LOCAL.map((e) => e.id);

function Local() {

  // ===== A. PERMISOS =====
  // Si es false, ni el botón "Editar" ni el "+" se dibujan.
  const { rol } = useRol();
  const puedeEditarLocales = puedeEditar(rol, 'locales');

  // Manija de la grilla: sirve para pedirle cosas desde afuera (exportar a CSV,
  // imprimir). Se llena con la prop `apiRef` del <DataGrid> de más abajo.
  const apiRef = useGridApiRef();

  // ===== B. DATOS (fijos, de prueba) =====
  // >>> PUNTO 1 DE 2 PARA CONECTAR EL BACKEND <<<
  // Acá va el fetch dentro de un useEffect, más los estados de "cargando" y
  // "error". Hoy el array arranca fijo.
  const [locales, setLocales] = useState([
    { id: 1, nombre: 'Supermercado Norte', cuit: '30-12345678-9', direccion: 'Av. Alem 123', rubro: 'Comercial', estado: 'Activo' },
    { id: 2, nombre: 'Industria Sur', cuit: '30-98765432-1', direccion: 'Ruta 9 Km 5', rubro: 'Industrial', estado: 'En trámite' },
    { id: 3, nombre: 'Farmacia Centro', cuit: '30-55555555-5', direccion: 'San Martín 456', rubro: 'Servicios', estado: 'Activo' },
  ]);

  const [buscarNombre, setBuscarNombre] = useState('');
  const [buscarCuit, setBuscarCuit] = useState('');

  // ===== C. QUÉ LOCAL ESTÁ ABIERTO EN EL MODAL =====
  // null = modal cerrado.
  // { local, soloLectura, esNuevo } = modal abierto con ese local.
  // Van juntos en un solo estado a propósito: si fueran estados separados se
  // pueden desincronizar (modal abierto sin local, o al revés).
  const [seleccion, setSeleccion] = useState(null);

  function cerrarModal() {
    setSeleccion(null);
  }

  // El alta reusa el MISMO formulario del modal, con un local en blanco y el
  // próximo id ya calculado (FormLocal muestra el id pero no lo deja editar).
  function abrirNuevo() {
    const siguienteId = locales.reduce((max, l) => Math.max(max, l.id), 0) + 1;
    setSeleccion({
      local: {
        id: siguienteId,
        nombre: '',
        cuit: '',
        direccion: '',
        rubro: RUBROS[0],
        estado: ESTADOS[0],
      },
      soloLectura: false,
      esNuevo: true,
    });
  }

  // ===== D. GUARDAR LOS CAMBIOS =====
  // >>> PUNTO 2 DE 2 PARA CONECTAR EL BACKEND <<<
  // Acá va el POST (alta) o el PUT/PATCH (edición). Hoy solo actualiza la
  // lista en memoria.
  //
  // OJO con el .map() / el spread: los dos crean un array NUEVO en vez de
  // modificar el que ya existe. React compara por identidad; si se modificara
  // el array original, la grilla no se volvería a dibujar y parecería que el
  // guardado no funcionó.
  function guardarLocal(localModificado) {
    setLocales((previos) =>
      previos.some((l) => l.id === localModificado.id)
        ? previos.map((l) => (l.id === localModificado.id ? localModificado : l))
        : [...previos, localModificado]
    );
    cerrarModal();
  }

  // ===== E. COLUMNAS DE LA GRILLA =====
  // Se rearma solo cuando cambia el permiso, porque de eso depende si la
  // columna Acciones lleva o no el botón "Editar".
  const columnas = useMemo(
    () => [
      { field: 'id', headerName: 'ID', width: 70 },
      { field: 'nombre', headerName: 'Nombre', flex: 1, minWidth: 180 },
      { field: 'cuit', headerName: 'CUIT', width: 150 },
      { field: 'direccion', headerName: 'Dirección', flex: 1, minWidth: 170 },
      {
        field: 'rubro',
        headerName: 'Rubro',
        type: 'singleSelect',
        valueOptions: RUBROS,
        width: 130,
      },
      {
        field: 'estado',
        headerName: 'Estado',
        type: 'singleSelect',
        valueOptions: ESTADOS,
        width: 140,
        // El color del badge sale de config/catalogos.js. Antes estaba escrito
        // acá con un if, y solo contemplaba dos estados posibles.
        renderCell: ({ value }) => (
          <span className={`badge badge-${colorEstado(value)}`}>{value}</span>
        ),
      },
      {
        field: 'acciones',
        headerName: 'Acciones',
        type: 'actions',
        width: 110,
        getActions: ({ row }) => {
          const acciones = [
            <GridActionsCellItem
              key="ver"
              icon={<VisibilityIcon fontSize="small" />}
              label="Ver"
              title="Ver"
              onClick={() => setSeleccion({ local: row, soloLectura: true })}
            />,
          ];

          // "Editar" solo si el rol tiene permiso. No se muestra deshabilitado:
          // se oculta, igual que las tarjetas y el menú, para mantener el mismo
          // criterio en todo el sistema.
          if (puedeEditarLocales) {
            acciones.push(
              <GridActionsCellItem
                key="editar"
                icon={<EditIcon fontSize="small" />}
                label="Editar"
                title="Editar"
                onClick={() => setSeleccion({ local: row, soloLectura: false })}
              />
            );
          }

          return acciones;
        },
      },
    ],
    [puedeEditarLocales],
  );

  // ===== F. FILTRADO =====
  // Los dos buscadores de arriba filtran las filas antes de entregarlas a la
  // grilla; los filtros propios de cada columna siguen funcionando encima.
  const filas = useMemo(() => {
    const porNombre = buscarNombre.trim().toLowerCase();
    const porCuit = buscarCuit.trim().toLowerCase();

    return locales.filter((l) => {
      const coincideNombre =
        !porNombre ||
        l.nombre.toLowerCase().includes(porNombre) ||
        String(l.id).includes(porNombre);
      const coincideCuit = !porCuit || l.cuit.toLowerCase().includes(porCuit);
      return coincideNombre && coincideCuit;
    });
  }, [locales, buscarNombre, buscarCuit]);

  const imprimir = () => apiRef.current?.exportDataAsPrint();
  const descargar = () => apiRef.current?.exportDataAsCsv({ fileName: 'locales' });

  // ===== G. LO QUE SE DIBUJA =====
  return (
    <>
      {/* ---------- BLOQUE 1: encabezado ---------- */}
      <PageHeader etiqueta="LOCALES" titulo="PADRÓN DE ESTABLECIMIENTOS" botonVolver />

      {/* ---------- BLOQUE 2: barra de acciones ----------
          Izquierda los buscadores, derecha alta y exportar. */}
      <div className="tabla-acciones">
        <div className="tabla-buscadores">
          <input
            className="buscador"
            type="search"
            placeholder="Buscar por nombre o ID..."
            value={buscarNombre}
            onChange={(e) => setBuscarNombre(e.target.value)}
          />
          <input
            className="buscador"
            type="search"
            placeholder="Buscar por CUIT..."
            value={buscarCuit}
            onChange={(e) => setBuscarCuit(e.target.value)}
          />
        </div>

        <div className="tabla-botones">
          {puedeEditarLocales && (
            <button
              type="button"
              className="btn-icono btn-icono-azul"
              title="Nuevo local"
              onClick={abrirNuevo}
            >
              <AddIcon fontSize="small" />
            </button>
          )}
          <button
            type="button"
            className="btn-icono btn-icono-verde"
            title="Imprimir"
            onClick={imprimir}
          >
            <PrintIcon fontSize="small" />
          </button>
          <button
            type="button"
            className="btn-icono btn-icono-azul"
            title="Descargar CSV"
            onClick={descargar}
          >
            <DownloadIcon fontSize="small" />
          </button>
        </div>
      </div>

      {/* ---------- BLOQUE 3: grilla ---------- */}
      <div className="grilla-contenedor">
        <DataGrid
          apiRef={apiRef}
          rows={filas}
          columns={columnas}
          showToolbar
          slots={{ toolbar: GridToolbar }}
          slotProps={{
            toolbar: { showQuickFilter: false, csvOptions: { fileName: 'locales' } },
          }}
          localeText={esES.components.MuiDataGrid.defaultProps.localeText}
          initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
          pageSizeOptions={[5, 10, 25, 50]}
          disableRowSelectionOnClick
          sx={{
            border: 'none',
            fontFamily: 'inherit',
            '& .MuiDataGrid-columnHeader': {
              backgroundColor: '#1976d2',
              color: '#fff',
            },
            '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 700 },
            '& .MuiDataGrid-columnHeader .MuiSvgIcon-root': { color: '#fff' },
            '& .MuiDataGrid-columnSeparator': { color: 'rgba(255,255,255,0.4)' },
            '& .MuiDataGrid-row:hover': { backgroundColor: '#f8fafc' },
            '& .MuiDataGrid-cell': { fontSize: 14, color: '#444' },
          }}
        />
      </div>

      {/* ---------- BLOQUE 4: modal de ver / editar / nuevo ----------
          El `seleccion &&` de afuera es importante: hace que el formulario se
          desmonte del todo al cerrar, así el próximo local arranca limpio en
          vez de mostrar lo que se escribió en el anterior. */}
      {seleccion && (
        <Modal
          abierto
          titulo={
            seleccion.esNuevo
              ? 'Nuevo local'
              : seleccion.soloLectura
                ? 'Datos del local'
                : 'Editar local'
          }
          onCerrar={cerrarModal}
        >
          {/* El `key` obliga a React a rearmar el formulario DESDE CERO cada
              vez que se abre con otro local (o para uno nuevo). Hoy el modal ya
              se desmonta al cerrarse y alcanzaría sin esto, pero si mañana
              alguien lo deja montado y lo esconde con CSS, sin el key el
              formulario aparecería con los datos del local anterior. */}
          <FormLocal
            key={seleccion.esNuevo ? 'nuevo' : seleccion.local.id}
            local={seleccion.local}
            soloLectura={seleccion.soloLectura}
            esNuevo={seleccion.esNuevo}
            onGuardar={guardarLocal}
            onCancelar={cerrarModal}
          />
        </Modal>
      )}
    </>
  );
}

export default Local;
