/* ============================================================================
   pages/Tramite.jsx  —  GESTIÓN DE TRÁMITES  (URL: /#/tramites)
   ----------------------------------------------------------------------------
   RUTA EN: App.jsx -> <Route path="tramites" ... />
   ESTILOS: App.css -> "BARRA DE ACCIONES DE TABLA", "GRILLA (MUI DATA GRID)",
            "FORMULARIO EN LINEA" y sección 9 (badges de estado)

   ANTES esta pantalla era un menú de 4 tarjetas (una por tipo de trámite).
   AHORA es una pantalla de datos: una sola grilla con TODOS los trámites y el
   tipo/paso convertido en la columna "Estado", que se puede filtrar. Se ve
   todo en un solo lugar en vez de entrar y salir de 4 pantallas distintas.

   BLOQUES DE ESTA PANTALLA:
     1. Encabezado (PageHeader, con botón Volver)
     2. Barra de acciones: 2 buscadores + imprimir / descargar / nuevo
     3. Formulario de alta (aparece solo al tocar "Nuevo trámite")
     4. Grilla (MUI Data Grid)

   OJO: el orden de ESTADOS refleja el circuito administrativo real
   (1ra notificación -> 2da notificación -> revisión -> finalizado). No lo
   mezcles sin confirmar con el área, la secuencia significa algo.

   >>> DATOS DE PRUEBA <<<
   Los trámites están escritos a mano abajo. NO hay backend, así que
   LOS CAMBIOS SE PIERDEN AL RECARGAR (F5). Es lo esperado por ahora.

   >>> QUÉ BOTONES ANDAN Y CUÁLES NO <<<
   "Ver" y "Editar" de la columna Acciones NO hacen nada todavía: falta
   definir la pantalla/modal de detalle. "Eliminar" sí funciona (en memoria).

   SI HAY PROBLEMA ACÁ:
     - "Un estado sale con badge gris": ese texto no está en COLOR_ESTADO. La
       comparación es exacta, con tilde y todo.
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
import VisibilityIcon from '@mui/icons-material/Visibility';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import PageHeader from '../components/ui/PageHeader';

// Los estados son los que antes eran tarjetas (primera notificación, segunda
// notificación, revisión de documentación). Ahora viven como una columna
// filtrable de la tabla, así se ven todos los trámites en un solo lugar.
const ESTADOS = [
  'Primera Notificación',
  'Segunda Notificación',
  'Revisión de Documentación',
  'Finalizado',
];

const COLOR_ESTADO = {
  'Primera Notificación': 'azul',
  'Segunda Notificación': 'naranja',
  'Revisión de Documentación': 'amarillo',
  Finalizado: 'verde',
};

const TRAMITES_INICIALES = [
  { id: 1, local: 'Supermercado Norte', usuario: 'candelaria', fecha: new Date(2026, 7, 3), estado: 'Primera Notificación' },
  { id: 2, local: 'Industria Sur', usuario: 'mariano', fecha: new Date(2026, 7, 11), estado: 'Segunda Notificación' },
  { id: 3, local: 'Farmacia Centro', usuario: 'candelaria', fecha: new Date(2026, 7, 18), estado: 'Revisión de Documentación' },
  { id: 4, local: 'Hotel Plaza', usuario: 'jorge', fecha: new Date(2026, 7, 22), estado: 'Finalizado' },
  { id: 5, local: 'Shopping Aconquija', usuario: 'mariano', fecha: new Date(2026, 7, 26), estado: 'Primera Notificación' },
  { id: 6, local: 'Clínica Belgrano', usuario: 'lucia', fecha: new Date(2026, 8, 1), estado: 'Revisión de Documentación' },
];

const FORM_VACIO = { local: '', usuario: '', fecha: '', estado: ESTADOS[0] };

function Tramite() {
  // Manija de la grilla: sirve para pedirle cosas desde afuera (exportar a CSV,
  // imprimir). Se llena con la prop `apiRef` del <DataGrid> de más abajo.
  const apiRef = useGridApiRef();

  const [tramites, setTramites] = useState(TRAMITES_INICIALES);
  const [buscarLocal, setBuscarLocal] = useState('');
  const [buscarUsuario, setBuscarUsuario] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nuevo, setNuevo] = useState(FORM_VACIO);

  const columnas = useMemo(
    () => [
      { field: 'id', headerName: 'ID', width: 80 },
      { field: 'local', headerName: 'Local', flex: 1, minWidth: 200 },
      { field: 'usuario', headerName: 'Usuario', flex: 1, minWidth: 150 },
      {
        field: 'fecha',
        headerName: 'Fecha',
        type: 'date',
        width: 130,
        valueFormatter: (value) => (value ? value.toLocaleDateString('es-AR') : ''),
      },
      {
        field: 'estado',
        headerName: 'Estado',
        type: 'singleSelect',
        valueOptions: ESTADOS,
        width: 210,
        renderCell: ({ value }) => (
          <span className={`badge badge-${COLOR_ESTADO[value] ?? 'gris'}`}>{value}</span>
        ),
      },
      {
        field: 'acciones',
        headerName: 'Acciones',
        type: 'actions',
        width: 130,
        getActions: ({ id }) => [
          <GridActionsCellItem
            key="ver"
            icon={<VisibilityIcon fontSize="small" />}
            label="Ver"
            title="Ver"
          />,
          <GridActionsCellItem
            key="editar"
            icon={<EditIcon fontSize="small" />}
            label="Editar"
            title="Editar"
          />,
          <GridActionsCellItem
            key="eliminar"
            icon={<DeleteIcon fontSize="small" />}
            label="Eliminar"
            title="Eliminar"
            onClick={() => setTramites((prev) => prev.filter((t) => t.id !== id))}
          />,
        ],
      },
    ],
    [],
  );

  // Los dos buscadores de arriba filtran las filas antes de entregarlas a la
  // grilla; los filtros propios de cada columna siguen funcionando encima.
  const filas = useMemo(() => {
    const porLocal = buscarLocal.trim().toLowerCase();
    const porUsuario = buscarUsuario.trim().toLowerCase();

    return tramites.filter((t) => {
      const coincideLocal =
        !porLocal ||
        t.local.toLowerCase().includes(porLocal) ||
        String(t.id).includes(porLocal);
      const coincideUsuario = !porUsuario || t.usuario.toLowerCase().includes(porUsuario);
      return coincideLocal && coincideUsuario;
    });
  }, [tramites, buscarLocal, buscarUsuario]);

  const imprimir = () => apiRef.current?.exportDataAsPrint();
  const descargar = () => apiRef.current?.exportDataAsCsv({ fileName: 'tramites' });

  const cambiarCampo = (campo) => (e) =>
    setNuevo((prev) => ({ ...prev, [campo]: e.target.value }));

  const guardarNuevo = (e) => {
    e.preventDefault();
    setTramites((prev) => [
      ...prev,
      {
        id: prev.reduce((max, t) => Math.max(max, t.id), 0) + 1,
        local: nuevo.local,
        usuario: nuevo.usuario,
        fecha: nuevo.fecha ? new Date(`${nuevo.fecha}T00:00:00`) : new Date(),
        estado: nuevo.estado,
      },
    ]);
    setNuevo(FORM_VACIO);
    setMostrarForm(false);
  };

  const cancelarNuevo = () => {
    setNuevo(FORM_VACIO);
    setMostrarForm(false);
  };

  return (
    <>
      {/* ---------- BLOQUE 1: encabezado ---------- */}
      <PageHeader etiqueta="TRÁMITES" titulo="GESTIÓN DE TRÁMITES" botonVolver />

      {/* ---------- BLOQUE 2: barra de acciones ----------
          Izquierda los buscadores, derecha exportar y alta. */}
      <div className="tabla-acciones">
        <div className="tabla-buscadores">
          <input
            className="buscador"
            type="search"
            placeholder="Buscar por local o ID..."
            value={buscarLocal}
            onChange={(e) => setBuscarLocal(e.target.value)}
          />
          <input
            className="buscador"
            type="search"
            placeholder="Buscar por usuario..."
            value={buscarUsuario}
            onChange={(e) => setBuscarUsuario(e.target.value)}
          />
        </div>

        <div className="tabla-botones">
          <button
            type="button"
            className="btn-icono btn-icono-azul"
            title="Nuevo trámite"
            onClick={() => setMostrarForm(true)}
          >
            <AddIcon fontSize="small" />
          </button>
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

      {/* ---------- BLOQUE 3: alta ----------
          Formulario en línea, no modal: es corto y se usa seguido. */}
      {mostrarForm && (
        <form className="formulario formulario-nuevo" onSubmit={guardarNuevo}>
          <p className="formulario-titulo">NUEVO TRÁMITE</p>

          <div className="form-grupo">
            <label htmlFor="nuevo-local">Local</label>
            <input id="nuevo-local" value={nuevo.local} onChange={cambiarCampo('local')} required />
          </div>

          <div className="form-grupo">
            <label htmlFor="nuevo-usuario">Usuario</label>
            <input id="nuevo-usuario" value={nuevo.usuario} onChange={cambiarCampo('usuario')} required />
          </div>

          <div className="form-grupo">
            <label htmlFor="nuevo-fecha">Fecha</label>
            {/* Si se deja vacía, guardarNuevo() pone la de hoy. */}
            <input id="nuevo-fecha" type="date" value={nuevo.fecha} onChange={cambiarCampo('fecha')} />
          </div>

          <div className="form-grupo">
            <label htmlFor="nuevo-estado">Estado</label>
            <select id="nuevo-estado" value={nuevo.estado} onChange={cambiarCampo('estado')}>
              {ESTADOS.map((estado) => (
                <option key={estado} value={estado}>{estado}</option>
              ))}
            </select>
          </div>

          <div className="form-acciones">
            <button type="submit" className="btn-primario">Guardar</button>
            <button type="button" className="btn-tabla" onClick={cancelarNuevo}>Cancelar</button>
          </div>
        </form>
      )}

      {/* ---------- BLOQUE 4: grilla ---------- */}
      <div className="grilla-contenedor">
        <DataGrid
          apiRef={apiRef}
          rows={filas}
          columns={columnas}
          showToolbar
          slots={{ toolbar: GridToolbar }}
          slotProps={{
            toolbar: { showQuickFilter: false, csvOptions: { fileName: 'tramites' } },
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
    </>
  );
}

export default Tramite;
