/* ============================================================================
   pages/Tramite.jsx  —  GESTIÓN DE TRÁMITES  (URL: /#/tramites)
   ----------------------------------------------------------------------------
   RUTA EN: App.jsx -> <Route path="tramites" ... />
   ESTILOS: App.css -> sección 7 (TARJETAS)

   ESTA PANTALLA ES UN MENÚ, NO UNA PANTALLA DE DATOS.
   Muestra los 4 tipos de trámite como tarjetas. No lista trámites reales.

   >>> IMPORTANTE: NINGUNA TARJETA FUNCIONA TODAVÍA <<<
   Las 4 <Card> están sin prop `to`: el clic no hace nada. Es lo esperado,
   las pantallas de destino no existen.

   CÓMO SE ACTIVA UNA TARJETA (3 pasos):
     1. crear la página nueva en pages/
     2. agregarle un <Route> en App.jsx
     3. pasarle to="/esa-ruta" a la <Card> de acá

   OJO: el orden de las tarjetas refleja el circuito administrativo real
   (1ra notificación -> 2da notificación -> revisión). No las mezcles sin
   confirmar con el área, la secuencia significa algo.

   Misma forma que Relevamiento.jsx y Documentacion.jsx.
   ============================================================================ */

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
      {/* ---------- BLOQUE 1: encabezado ---------- */}
      <PageHeader etiqueta="TRÁMITES" titulo="GESTIÓN DE TRÁMITES" botonVolver />

      {/* ---------- BLOQUE 2: separador ---------- */}
      <div className="accesos-header">
        <span>TIPOS DE TRÁMITE</span>
      </div>

      {/* ---------- BLOQUE 3: opciones ----------
          Las 3 primeras son pasos del circuito; la última es el listado
          general. Todas sin `to` todavía. */}
      <div className="grid-accesos">
        <Card titulo="Primera Notificación" />
        <Card titulo="Segunda Notificación" />
        <Card titulo="Revisión de Documentación" />
        <Card titulo="Todos los Trámites" />
      </div>
    </>
  );
}

export default Tramite;

