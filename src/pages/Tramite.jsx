/* ============================================================================
   pages/Tramite.jsx  —  GESTIÓN DE TRÁMITES  (URL: /#/tramites)
   ----------------------------------------------------------------------------
   RUTA EN: App.jsx -> <Route path="tramites" ... />
   ESTILOS: App.css -> secciones 13 (BARRA DE ACCIONES), 13.b (FORMULARIO EN
            LÍNEA), 14 (GRILLA) y 9 (badges de estado)

   ANTES esta pantalla era un menú de 4 tarjetas (una por tipo de trámite).
   AHORA es una pantalla de datos: una sola grilla con TODOS los trámites, con
   el tipo y el estado convertidos en columnas filtrables. Se ve todo en un
   solo lugar en vez de entrar y salir de 4 pantallas distintas.

   BLOQUES DE ESTA PANTALLA:
     1. Encabezado (PageHeader, con botón Volver)
     2. Barra de acciones: 2 buscadores + nuevo / imprimir / descargar
     3. Formulario de alta (aparece solo al tocar "Nuevo trámite")
     4. Grilla (MUI Data Grid)

   TIPO Y ESTADO NO SON LO MISMO, aunque se parezcan:
     - TIPO   = qué trámite es (primera notificación, relevamiento...). Es el
                circuito administrativo, y el ORDEN de TIPOS significa algo:
                no lo mezcles sin confirmar con el área.
     - ESTADO = en qué situación está ese trámite (asignada, entregada,
                plazo vencido...). Es lo que cambia con el tiempo.

   >>> DATOS DE PRUEBA <<<
   Los trámites están escritos a mano abajo. NO hay backend, así que
   LOS CAMBIOS SE PIERDEN AL RECARGAR (F5). Es lo esperado por ahora.

   >>> QUÉ BOTONES ANDAN Y CUÁLES NO <<<
   "Ver" y "Editar" de la columna Acciones NO hacen nada todavía: falta
   definir la pantalla/modal de detalle. "Eliminar" sí funciona (en memoria).

   SI HAY PROBLEMA ACÁ:
     - "Un estado sale con badge gris": ese texto no está en COLOR_ESTADO. La
       comparación es exacta, con tilde y mayúsculas incluidas.
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
import DeleteIcon from '@mui/icons-material/Delete';

import PageHeader from '../components/ui/PageHeader';


// Los tipos de trámite. El ORDEN es el del circuito administrativo.
const TIPOS = [
  'Primera notificacion',
  'Segunda notificacion',
  'Relevamiento',
  'Expediente',
];


// Los estados en los que puede estar un trámite.
// OJO: cada texto de acá tiene que estar IGUAL (tildes y mayúsculas incluidas)
// como clave de COLOR_ESTADO; si no, el badge sale gris.
const ESTADOS = [
  'Pendiente de Revisión',
  'Gran Generador',
  'Generador Menor',
  'Generada',
  'Asignada',
  'Entregada',
  'No Entregada',
  'Plazo Vencido',
  'Pendiente de Generación',
];


// El color tiene que existir como clase .badge-<color> en App.css sección 9.
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
    estado: 'Asignada',
  },
  {
    id: 3,
    local: 'Farmacia Centro',
    tipo: 'Relevamiento',
    usuario: 'candelaria',
    fechaInicio: new Date(2026, 7, 18),
    fechaVencimiento: new Date(2026, 7, 23),
    estado: 'Pendiente de Revisión',
  },
  {
    id: 4,
    local: 'Hotel Plaza',
    tipo: 'Expediente',
    usuario: 'jorge',
    fechaInicio: new Date(2026, 7, 22),
    fechaVencimiento: new Date(2026, 7, 27),
    estado: 'Gran Generador',
  },
  {
    id: 5,
    local: 'Shopping Aconquija',
    tipo: 'Primera notificacion',
    usuario: 'mariano',
    fechaInicio: new Date(2026, 7, 26),
    fechaVencimiento: new Date(2026, 7, 31),
    estado: 'Generada',
  },
  {
    id: 6,
    local: 'Clínica Belgrano',
    tipo: 'Segunda notificacion',
    usuario: 'lucia',
    fechaInicio: new Date(2026, 8, 1),
    fechaVencimiento: new Date(2026, 8, 6),
    estado: 'No Entregada',
  },
];


// Cómo arranca (y cómo vuelve a quedar) el formulario de alta.
const FORM_VACIO = {
  local: '',
  tipo: TIPOS[0],
  usuario: '',
  fechaInicio: '',
  fechaVencimiento: '',
  estado: ESTADOS[0],
};


// Días de plazo que se le dan a un trámite cuando el alta no trae fecha de
// vencimiento. Es el mismo plazo que usan los datos de prueba.
const DIAS_DE_PLAZO = 5;


function Tramite() {

  // apiRef permite utilizar funciones propias del DataGrid,
  // como imprimir y exportar.
  const apiRef = useGridApiRef();


  // Guarda los trámites que se muestran actualmente.
  const [tramites, setTramites] = useState(TRAMITES_INICIALES);

  // Lo que hay escrito en cada buscador.
  const [buscarLocal, setBuscarLocal] = useState('');
  const [buscarUsuario, setBuscarUsuario] = useState('');

  // El formulario de alta arranca escondido.
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nuevo, setNuevo] = useState(FORM_VACIO);


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
        type: 'singleSelect',
        valueOptions: TIPOS,
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

          // Borra solo en memoria: al recargar la página vuelve a aparecer.
          <GridActionsCellItem
            key="eliminar"
            icon={<DeleteIcon fontSize="small" />}
            label="Eliminar"
            title="Eliminar"
            onClick={() =>
              setTramites((prev) => prev.filter((t) => t.id !== id))
            }
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

      const coincideUsuario =
        !porUsuario || t.usuario.toLowerCase().includes(porUsuario);

      return coincideLocal && coincideUsuario;
    });
  }, [tramites, buscarLocal, buscarUsuario]);


  // Imprime los datos de la grilla.
  const imprimir = () =>
    apiRef.current?.exportDataAsPrint();


  // Descarga los datos de la grilla en formato CSV.
  const descargar = () =>
    apiRef.current?.exportDataAsCsv({
      fileName: 'tramites',
    });


  const cambiarCampo = (campo) => (e) =>
    setNuevo((prev) => ({ ...prev, [campo]: e.target.value }));


  const guardarNuevo = (e) => {
    e.preventDefault();

    // El <input type="date"> devuelve texto ('2026-08-03'). El T00:00:00 es
    // para que se tome como fecha local: sin eso el navegador la lee como UTC
    // y en Argentina la muestra un día antes.
    const inicio = nuevo.fechaInicio
      ? new Date(`${nuevo.fechaInicio}T00:00:00`)
      : new Date();

    let vencimiento;
    if (nuevo.fechaVencimiento) {
      vencimiento = new Date(`${nuevo.fechaVencimiento}T00:00:00`);
    } else {
      // Sin fecha de vencimiento se usa el plazo por defecto.
      vencimiento = new Date(inicio);
      vencimiento.setDate(vencimiento.getDate() + DIAS_DE_PLAZO);
    }

    setTramites((prev) => [
      ...prev,
      {
        id: prev.reduce((max, t) => Math.max(max, t.id), 0) + 1,
        local: nuevo.local,
        tipo: nuevo.tipo,
        usuario: nuevo.usuario,
        fechaInicio: inicio,
        fechaVencimiento: vencimiento,
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
      <PageHeader
        etiqueta="TRÁMITES"
        titulo="GESTIÓN DE TRÁMITES"
        botonVolver
      />


      {/* ---------- BLOQUE 2: barra de acciones ----------
          Izquierda los buscadores, derecha el alta y las exportaciones. */}
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
            title="Descargar"
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
            <input
              id="nuevo-local"
              value={nuevo.local}
              onChange={cambiarCampo('local')}
              required
            />
          </div>

          <div className="form-grupo">
            <label htmlFor="nuevo-tipo">Tipo</label>
            <select
              id="nuevo-tipo"
              value={nuevo.tipo}
              onChange={cambiarCampo('tipo')}
            >
              {TIPOS.map((tipo) => (
                <option key={tipo} value={tipo}>{tipo}</option>
              ))}
            </select>
          </div>

          <div className="form-grupo">
            <label htmlFor="nuevo-usuario">Usuario</label>
            <input
              id="nuevo-usuario"
              value={nuevo.usuario}
              onChange={cambiarCampo('usuario')}
              required
            />
          </div>

          <div className="form-grupo">
            <label htmlFor="nuevo-fecha-inicio">Fecha de inicio</label>
            {/* Si se deja vacía, guardarNuevo() pone la de hoy. */}
            <input
              id="nuevo-fecha-inicio"
              type="date"
              value={nuevo.fechaInicio}
              onChange={cambiarCampo('fechaInicio')}
            />
          </div>

          <div className="form-grupo">
            <label htmlFor="nuevo-fecha-vencimiento">Fecha de vencimiento</label>
            {/* Si se deja vacía, se le suman DIAS_DE_PLAZO a la de inicio. */}
            <input
              id="nuevo-fecha-vencimiento"
              type="date"
              value={nuevo.fechaVencimiento}
              onChange={cambiarCampo('fechaVencimiento')}
            />
          </div>

          <div className="form-grupo">
            <label htmlFor="nuevo-estado">Estado</label>
            <select
              id="nuevo-estado"
              value={nuevo.estado}
              onChange={cambiarCampo('estado')}
            >
              {ESTADOS.map((estado) => (
                <option key={estado} value={estado}>{estado}</option>
              ))}
            </select>
          </div>

          <div className="form-acciones">
            <button type="submit" className="btn-primario">Guardar</button>
            <button
              type="button"
              className="btn-secundario"
              onClick={cancelarNuevo}
            >
              Cancelar
            </button>
          </div>

        </form>
      )}


      {/* ---------- BLOQUE 4: grilla ---------- */}
      <div className="grilla-contenedor">

        <DataGrid

          apiRef={apiRef}

          // Las filas ya vienen filtradas por los dos buscadores de arriba.
          rows={filas}

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
