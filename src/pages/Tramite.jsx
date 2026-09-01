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
import DeleteIcon from '@mui/icons-material/Delete';
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

  return (
    <>
      <PageHeader etiqueta="TRÁMITES" titulo="GESTIÓN DE TRÁMITES" botonVolver />

      <div className="tabla-acciones">
        <div className="tabla-buscadores">
          <input
            className="buscador"
            placeholder="Buscar por ID o Local"
            value={buscarLocal}
            onChange={(e) => setBuscarLocal(e.target.value)}
          />
          <input
            className="buscador"
            placeholder="Buscar por Usuario"
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

      {mostrarForm && (
        <form className="formulario formulario-nuevo" onSubmit={guardarNuevo}>
          <h3 className="formulario-titulo">NUEVO TRÁMITE</h3>

          <div className="form-grupo">
            <label htmlFor="local">Local</label>
            <input
              id="local"
              required
              value={nuevo.local}
              onChange={(e) => setNuevo({ ...nuevo, local: e.target.value })}
            />
          </div>

          <div className="form-grupo">
            <label htmlFor="usuario">Usuario</label>
            <input
              id="usuario"
              required
              value={nuevo.usuario}
              onChange={(e) => setNuevo({ ...nuevo, usuario: e.target.value })}
            />
          </div>

          <div className="form-grupo">
            <label htmlFor="fecha">Fecha</label>
            <input
              id="fecha"
              type="date"
              value={nuevo.fecha}
              onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })}
            />
          </div>

          <div className="form-grupo">
            <label htmlFor="estado">Estado</label>
            <select
              id="estado"
              value={nuevo.estado}
              onChange={(e) => setNuevo({ ...nuevo, estado: e.target.value })}
            >
              {ESTADOS.map((es) => (
                <option key={es} value={es}>
                  {es}
                </option>
              ))}
            </select>
          </div>

          <div className="form-acciones">
            <button type="submit" className="btn-primario">Guardar</button>
            <button
              type="button"
              className="btn-tabla"
              onClick={() => {
                setNuevo(FORM_VACIO);
                setMostrarForm(false);
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

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
