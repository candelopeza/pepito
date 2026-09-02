import { useMemo, useState } from 'react';
import {
  DataGrid,
  GridToolbar,
  GridActionsCellItem,
  useGridApiRef,
} from '@mui/x-data-grid';
import { esES } from '@mui/x-data-grid/locales';

import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EditIcon from '@mui/icons-material/Edit';

import PageHeader from '../components/ui/PageHeader';


// Estados utilizados actualmente como datos de prueba.
const ESTADOS = [
  'Pendiente de revision',
  'Gran generador',
  'Generador menor',
  'Generada',
  'Asignada',
  'Entregada',
  'No entregada',
  'Plazo vencido',
  'Pendiente de generacion',
];


const COLOR_ESTADO = {
  'Pendiente de Revisión': 'amarillo',
  'Gran Generador': 'verde',
  'Generador Menor': 'azul',
  'Generada': 'azul',
  'Asignada': 'naranja',
  'Entregada': 'verde',
  'No Entregada': 'naranja',
  'Plazo Vencido': 'naranja',
  'Pendiente de Generación': 'amarillo',
};


// Datos de prueba que se muestran en la tabla.
const TRAMITES_INICIALES = [
  {
    id: 1,
    local: 'Supermercado Norte',
    tipo: 'Primera notificacion', 
    usuario: 'candelaria',
    fechaInicio: new Date(2026, 7, 3),
    fechaVencimiento: new Date(2026, 7, 8),
    estado: 'Entregada',
  },
  {
    id: 2,
    local: 'Industria Sur',
    tipo: 'Segunda notificacion',
    usuario: 'mariano',
    fechaInicio: new Date(2026, 7, 11),
    fechaVencimiento: new Date(2026, 7, 16),
    estado: 'Segunda Notificación',
  },
  {
    id: 3,
    local: 'Farmacia Centro',
    tipo: 'Relevamiento', 
    usuario: 'candelaria',
    fechaInicio: new Date(2026, 7, 18),
    fechaVencimiento: new Date(2026, 7, 23),
    estado: 'Revisión de Documentación',
  },
  {
    id: 4,
    local: 'Hotel Plaza',
    tipo: 'Expediente',
    usuario: 'jorge',
    fechaInicio: new Date(2026, 7, 22),
    fechaVencimiento: new Date(2026, 7, 27),
    estado: 'Finalizado',
  },
  {
    id: 5,
    local: 'Shopping Aconquija',
    tipo: 'Primera notificacion',
    usuario: 'mariano',
    fechaInicio: new Date(2026, 7, 26),
    fechaVencimiento: new Date(2026, 7, 31),
    estado: 'Primera Notificación',
  },
  {
    id: 6,
    local: 'Clínica Belgrano',
    tipo: 'Segunda notificacion',
    usuario: 'lucia',
    fechaInicio: new Date(2026, 8, 1),
    fechaVencimiento: new Date(2026, 8, 6),
    estado: 'Revisión de Documentación',
  },
];


function Tramite() {

  // apiRef permite utilizar funciones propias del DataGrid,
  // como imprimir y exportar.
  const apiRef = useGridApiRef();


  // Guarda los trámites que se muestran actualmente.
  const [tramites] = useState(TRAMITES_INICIALES);


  // Definición de las columnas de la tabla.
  const columnas = useMemo(
    () => [

      {
        field: 'id',
        headerName: 'ID',
        width: 80,
      },

      {
        field: 'local',
        headerName: 'Local',
        flex: 1,
        minWidth: 200,
      },

      {
       field: 'tipo',
       headerName: 'Tipo',
      flex: 1,
      minWidth: 190,
       },

      {
        field: 'usuario',
        headerName: 'Usuario',
        flex: 1,
        minWidth: 150,
      },

      {
        field: 'fechaInicio',
        headerName: 'Fecha Inicio',
        type: 'date',
        width: 150,

        valueFormatter: (value) =>
          value ? value.toLocaleDateString('es-AR') : '',
      },

      {
        field: 'fechaVencimiento',
        headerName: 'Fecha Vencimiento',
        type: 'date',
        width: 175,

        valueFormatter: (value) =>
          value ? value.toLocaleDateString('es-AR') : '',
      },

      {
        field: 'estado',
        headerName: 'Estado',
        type: 'singleSelect',
        valueOptions: ESTADOS,
        width: 210,

        renderCell: ({ value }) => (
          <span
            className={`badge badge-${COLOR_ESTADO[value] ?? 'gris'}`}
          >
            {value}
          </span>
        ),
      },

      {
        field: 'acciones',
        headerName: 'Acciones',
        type: 'actions',
        width: 110,

        getActions: () => [

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

        ],
      },

    ],
    [],
  );


  // Imprime los datos de la grilla.
  const imprimir = () =>
    apiRef.current?.exportDataAsPrint();


  // Descarga los datos de la grilla en formato CSV.
  const descargar = () =>
    apiRef.current?.exportDataAsCsv({
      fileName: 'tramites',
    });


  return (
    <>

      <PageHeader
        etiqueta="TRÁMITES"
        titulo="GESTIÓN DE TRÁMITES"
        botonVolver
      />


      {/* Botones generales de la tabla */}
      <div className="tabla-acciones">

        <div className="tabla-botones">

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


      {/* Tabla de trámites */}
      <div className="grilla-contenedor">

        <DataGrid

          apiRef={apiRef}

          // Ahora usamos directamente todos los trámites.
          // Ya no existe el filtrado de los buscadores superiores.
          rows={tramites}

          columns={columnas}

          showToolbar

          slots={{
            toolbar: GridToolbar,
          }}

          slotProps={{
            toolbar: {
              showQuickFilter: false,
              csvOptions: {
                fileName: 'tramites',
              },
            },
          }}

          localeText={
            esES.components.MuiDataGrid.defaultProps.localeText
          }

          initialState={{
            pagination: {
              paginationModel: {
                pageSize: 10,
              },
            },
          }}

          pageSizeOptions={[5, 10, 25, 50]}

          disableRowSelectionOnClick

          sx={{

            border: 'none',

            fontFamily: 'inherit',

            '& .MuiDataGrid-columnHeader': {
              backgroundColor: '#1976d2',
              color: '#fff',
            },

            '& .MuiDataGrid-columnHeaderTitle': {
              fontWeight: 700,
            },

            '& .MuiDataGrid-columnHeader .MuiSvgIcon-root': {
              color: '#fff',
            },

            '& .MuiDataGrid-columnSeparator': {
              color: 'rgba(255,255,255,0.4)',
            },

            '& .MuiDataGrid-row:hover': {
              backgroundColor: '#f8fafc',
            },

            '& .MuiDataGrid-cell': {
              fontSize: 14,
              color: '#444',
            },

          }}

        />

      </div>

    </>
  );
}


export default Tramite;