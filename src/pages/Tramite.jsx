/* ============================================================================
   pages/Tramite.jsx  —  GESTIÓN DE TRÁMITES  (URL: /#/tramites)
   ----------------------------------------------------------------------------
   RUTA EN: App.jsx -> <Route path="tramites" ... />
   ESTILOS: App.css -> secciones 13 (BARRA DE ACCIONES) y 14 (GRILLA)

   ANTES ESTA PANTALLA ERA UN MENÚ DE 4 TARJETAS. YA NO.
   Las tarjetas (1ra notificación, 2da notificación, revisión, todos los
   trámites) se reemplazaron por UNA tabla con todos los trámites. Los 3
   primeros tipos son ahora la columna "Tipo", y "Todos los trámites" es la
   tabla sin filtrar. Los valores salen de TIPOS_TRAMITE en config/catalogos.js,
   que mantiene el orden del circuito administrativo.

   BLOQUES DE ESTA PANTALLA:
     1. Encabezado (PageHeader, con botón Volver)
     2. Barra de acciones: 2 buscadores + Nuevo / Imprimir / Descargar
     3. Tabla (MUI Data Grid)
     4. Modal de nuevo trámite (solo cuando se tocó el botón +)

   >>> ESTA TABLA NO ES LA MISMA QUE LA DE LOCALES <<<
   Locales usa un <table> escrito a mano (.tabla-datos). Acá se usa el
   Data Grid de MUI (@mui/x-data-grid), porque trae solos los filtros por
   columna, ocultar columnas, densidad, orden y paginado. Si agregás una
   columna acá NO hay que tocar dos lugares como en Locales: se agrega un
   objeto al array `columnas` y listo.

   DÓNDE ESTÁ CADA COSA DE LA BARRA DE HERRAMIENTAS:
   COLUMNAS / FILTROS / DENSIDAD / EXPORTAR las dibuja el propio Data Grid
   (showToolbar + slots.toolbar). El menú de cada columna (Filtro, Ocultar,
   Administrar columnas) también. Están en español por `localeText`.

   OJO: LOS DOS BUSCADORES NO SON DEL DATA GRID.
   Filtran el array ANTES de entregárselo a la grilla (ver bloque C). Por eso
   se combinan con los filtros de columna en vez de pelearse con ellos. Si
   alguna vez el contador de filas "no cierra", es por esto: la grilla solo
   cuenta lo que le llegó.

   >>> DATOS DE PRUEBA <<<
   Los trámites están escritos a mano abajo. NO hay backend, así que
   LOS CAMBIOS SE PIERDEN AL RECARGAR (F5). Para conectar la API hay dos
   puntos, los dos marcados abajo: la carga inicial (TRAMITES_INICIALES) y
   guardarNuevo().

   SI HAY PROBLEMA ACÁ:
     - "Una columna sale vacía": el `field` no coincide con el nombre de la
        propiedad en los datos. Se escriben igual, respetando mayúsculas.
     - "Un estado sale con badge gris": ese texto no está en ESTADOS_TRAMITE
        (config/catalogos.js). La comparación es exacta, con tilde y todo.
     - "El filtro de Fecha no ofrece 'antes de / después de'": la columna
        perdió el type: 'date', o los datos dejaron de ser objetos Date. La
        fecha se guarda como Date, NO como texto; el formato dd/mm/aaaa lo
        pone el valueFormatter solo para mostrar.
     - "Imprimir o Descargar no hacen nada": van por apiRef, y apiRef recién
        existe cuando la grilla se montó.

   PENDIENTE: esta pantalla NO controla permisos. Cualquier rol que entre
   puede agregar y eliminar. Locales sí los controla (puedeEditar). Para
   hacerlo igual acá falta declarar `rolesEdicion` en el módulo 'tramites' de
   config/modulos.js: hoy no lo tiene, así que si se enchufa puedeEditar tal
   cual, los botones desaparecen para TODOS los roles.
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
import Modal from '../components/ui/Modal';
import {
  TIPOS_TRAMITE,
  ESTADOS_TRAMITE,
  colorEstadoTramite,
} from '../config/catalogos';

// Textos en español de la grilla (Filtro, Ocultar, Densidad, etc.).
// Se resuelve una sola vez acá afuera, no en cada render.
const TEXTOS_ES = esES.components.MuiDataGrid.defaultProps.localeText;

// Solo los ids: es lo que necesitan el desplegable del formulario y el
// filtro de la columna Estado. Los colores los resuelve colorEstadoTramite.
const IDS_ESTADO = ESTADOS_TRAMITE.map((e) => e.id);

// ===== DATOS DE PRUEBA =====
// >>> PUNTO 1 DE 2 PARA CONECTAR EL BACKEND <<<
// Acá va el fetch dentro de un useEffect, más los estados de "cargando" y
// "error". Hoy el array arranca fijo.
//
// OJO con `fecha`: son objetos Date de verdad, no texto. De eso depende que
// el filtro de la columna Fecha ofrezca "antes de / después de" y que el
// orden salga cronológico y no alfabético.
const TRAMITES_INICIALES = [
  { id: 1, local: 'Supermercado Norteeee', tipo: 'Primera Notificación', usuario: 'candelaria', fecha: new Date(2026, 7, 3), estado: 'Pendiente' },
  { id: 2, local: 'Industria Sur', tipo: 'Segunda Notificación', usuario: 'mariano', fecha: new Date(2026, 7, 11), estado: 'En curso' },
  { id: 3, local: 'Farmacia Centro', tipo: 'Revisión de Documentación', usuario: 'candelaria', fecha: new Date(2026, 7, 18), estado: 'En curso' },
  { id: 4, local: 'Hotel Plaza', tipo: 'Primera Notificación', usuario: 'jorge', fecha: new Date(2026, 7, 22), estado: 'Finalizado' },
  { id: 5, local: 'Shopping Aconquija', tipo: 'Segunda Notificación', usuario: 'mariano', fecha: new Date(2026, 7, 26), estado: 'Vencido' },
  { id: 6, local: 'Clínica Belgrano', tipo: 'Revisión de Documentación', usuario: 'lucia', fecha: new Date(2026, 8, 1), estado: 'Pendiente' },
];

// El formulario arranca siempre así. Se declara afuera para reusarlo tanto al
// abrir como al cancelar, sin repetir el objeto en dos lugares.
const FORM_VACIO = {
  local: '',
  tipo: TIPOS_TRAMITE[0],
  usuario: '',
  fecha: '',
  estado: IDS_ESTADO[0],
};

function Tramite() {

  // ===== A. ESTADO DE LA PANTALLA =====
  // apiRef es el control remoto de la grilla: lo usan Imprimir y Descargar.
  const apiRef = useGridApiRef();
  const [tramites, setTramites] = useState(TRAMITES_INICIALES);
  const [buscarLocal, setBuscarLocal] = useState('');
  const [buscarUsuario, setBuscarUsuario] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nuevo, setNuevo] = useState(FORM_VACIO);

  // ===== B. LAS COLUMNAS =====
  // Va en useMemo porque si el array se creara de nuevo en cada render, la
  // grilla se re-armaría entera y perdería el ancho que el usuario arrastró,
  // la columna que ocultó y el filtro que puso.
  //
  // `field` TIENE que llamarse igual que la propiedad de los datos.
  // `type` no es decorativo: define qué filtros ofrece la columna
  // ('date' -> antes/después, 'singleSelect' -> desplegable de opciones).
  const columnas = useMemo(
    () => [
      { field: 'id', headerName: 'ID', width: 80 },
      { field: 'local', headerName: 'Local', flex: 1, minWidth: 200 },
      {
        field: 'tipo',
        headerName: 'Tipo',
        type: 'singleSelect',
        valueOptions: TIPOS_TRAMITE,
        flex: 1,
        minWidth: 200,
      },
      { field: 'usuario', headerName: 'Usuario', flex: 1, minWidth: 150 },
      {
        field: 'fecha',
        headerName: 'Fecha',
        type: 'date',
        width: 130,
        // El dato sigue siendo un Date; esto solo cambia cómo se ve.
        valueFormatter: (value) => (value ? value.toLocaleDateString('es-AR') : ''),
      },
      {
        field: 'estado',
        headerName: 'Estado',
        type: 'singleSelect',
        valueOptions: IDS_ESTADO,
        width: 150,
        // El color del badge sale de config/catalogos.js, igual que en
        // Locales, así los dos listados usan la misma paleta.
        renderCell: ({ value }) => (
          <span className={`badge badge-${colorEstadoTramite(value)}`}>{value}</span>
        ),
      },
      {
        // type: 'actions' hace que la columna no sea filtrable ni ordenable
        // (no tendría sentido) y que los iconos queden centrados.
        field: 'acciones',
        headerName: 'Acciones',
        type: 'actions',
        width: 130,
        getActions: ({ id }) => [
          // PENDIENTE: Ver y Editar todavía no abren nada. Cuando exista la
          // pantalla de detalle, acá va el onClick.
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
            // El filter() devuelve un array NUEVO. Si se modificara el que ya
            // existe, React no se enteraría y la fila seguiría en pantalla.
            onClick={() => setTramites((prev) => prev.filter((t) => t.id !== id))}
          />,
        ],
      },
    ],
    [],
  );

  // ===== C. LOS DOS BUSCADORES DE ARRIBA =====
  // Filtran el array antes de entregarlo a la grilla; los filtros propios de
  // cada columna siguen funcionando encima de este resultado.
  // Se compara todo en minúscula para que "NORTE" y "norte" den lo mismo.
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

  // ===== D. IMPRIMIR Y DESCARGAR =====
  // Los dos exportan LO QUE SE ESTÁ VIENDO: si hay filtros puestos o columnas
  // ocultas, se respeta. Es a propósito.
  // El `?.` es porque apiRef.current recién existe con la grilla ya montada.
  const imprimir = () => apiRef.current?.exportDataAsPrint();
  const descargar = () => apiRef.current?.exportDataAsCsv({ fileName: 'tramites' });

  // ===== E. GUARDAR UN TRÁMITE NUEVO =====
  // >>> PUNTO 2 DE 2 PARA CONECTAR EL BACKEND <<<
  // Acá va el POST a la API. Hoy solo agrega a la lista en memoria.
  //
  // El id se calcula como "el mayor que haya + 1" y no como length + 1: si se
  // borró una fila del medio, length daría un id repetido y la grilla
  // mostraría dos filas pisadas.
  function guardarNuevo(e) {
    e.preventDefault();

    setTramites((prev) => [
      ...prev,
      {
        id: prev.reduce((max, t) => Math.max(max, t.id), 0) + 1,
        local: nuevo.local,
        tipo: nuevo.tipo,
        usuario: nuevo.usuario,
        // El <input type="date"> devuelve texto 'aaaa-mm-dd'. El T00:00:00 va
        // a propósito: sin eso el navegador lo lee como UTC y en Argentina la
        // fecha se ve un día antes.
        fecha: nuevo.fecha ? new Date(`${nuevo.fecha}T00:00:00`) : new Date(),
        estado: nuevo.estado,
      },
    ]);

    cerrarForm();
  }

  function cerrarForm() {
    setNuevo(FORM_VACIO);
    setMostrarForm(false);
  }

  // ===== F. LO QUE SE DIBUJA =====
  return (
    <>
      {/* ---------- BLOQUE 1: encabezado ---------- */}
      <PageHeader etiqueta="TRÁMITES" titulo="GESTIÓN DE TRÁMITES" botonVolver />

      {/* ---------- BLOQUE 2: barra de acciones ----------
          Buscadores a la izquierda, los 3 botones a la derecha: eso lo hace
          el justify-content de .tabla-acciones (App.css sección 13).
          El `title` de cada botón es el globito del mouse. Son botones de
          solo icono; sin él no se entiende cuál es cuál. */}
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

      {/* ---------- BLOQUE 3: tabla ----------
          Sobre las props del DataGrid, en orden:
          - showToolbar prende la barra y slots dice CUÁL barra: hacen falta
            las dos, con slots solo la barra no se ve.
          - showQuickFilter en false porque el buscador ya está en el bloque 2;
            si no, quedarían dos búsquedas distintas en la misma pantalla.
          - initialState son valores de ARRANQUE que el usuario después puede
            cambiar. Si el paginado se pasara como `paginationModel`, quedaría
            clavado en 10 y no se podría mover.
          - disableRowSelectionOnClick: sin esto, tocar cualquier celda
            selecciona la fila entera y molesta al querer usar los iconos de
            Acciones.
          - los colores van por `sx` y no por App.css porque las clases del
            Data Grid las genera MUI y cambian entre versiones; esta es la
            forma que MUI recomienda. El azul es el mismo #1976d2 de la navbar
            (App.css sección 2). */}
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
          localeText={TEXTOS_ES}
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
            // Los iconos de la cabecera (orden, menú) en blanco: sobre el
            // azul, el gris que traen por defecto no se ve.
            '& .MuiDataGrid-columnHeader .MuiSvgIcon-root': { color: '#fff' },
            '& .MuiDataGrid-columnSeparator': { color: 'rgba(255,255,255,0.4)' },
            '& .MuiDataGrid-row:hover': { backgroundColor: '#f8fafc' },
            '& .MuiDataGrid-cell': { fontSize: 14, color: '#444' },
          }}
        />
      </div>

      {/* ---------- BLOQUE 4: modal de nuevo trámite ----------
          Mismo Modal que usa Locales. El `mostrarForm &&` de afuera hace que
          el formulario se desmonte al cerrar, así la próxima vez arranca
          limpio en vez de mostrar lo que se había escrito antes. */}
      {mostrarForm && (
        <Modal abierto titulo="Nuevo trámite" onCerrar={cerrarForm}>
          <form className="formulario formulario-modal" onSubmit={guardarNuevo}>

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
              <label htmlFor="tipo">Tipo</label>
              <select
                id="tipo"
                value={nuevo.tipo}
                onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value })}
              >
                {TIPOS_TRAMITE.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
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
                {IDS_ESTADO.map((es) => (
                  <option key={es} value={es}>{es}</option>
                ))}
              </select>
            </div>

            {/* Guardar va primero en el HTML para que la tecla Enter lo
                dispare, y Cancelar usa .btn-secundario, igual que FormLocal. */}
            <div className="form-acciones">
              <button type="submit" className="btn-primario">Guardar</button>
              <button type="button" className="btn-secundario" onClick={cerrarForm}>
                Cancelar
              </button>
            </div>

          </form>
        </Modal>
      )}
    </>
  );
}

export default Tramite;
