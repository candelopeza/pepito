/* ============================================================================
   pages/Local.jsx  —  PADRÓN DE ESTABLECIMIENTOS  (URL: /#/locales)
   ----------------------------------------------------------------------------
   El listado completo: búsqueda por cualquier campo, filtros combinables,
   orden por columna y exportación del resultado (sección 6.1).

   >>> LA COLUMNA "ESTADO" NO SALE DE LA BASE <<<
   Se calcula con las reglas del dominio a partir del historial de actuaciones
   de cada local (ver datos/vistas.js → conEstado). No hay un campo `estado`
   que alguien pueda dejar desactualizado.

   FILTROS COMBINABLES (sección 6.1): tres desplegables arriba de la grilla
   —estado, rubro y situación— que se suman entre sí. La grilla gratuita deja
   un solo filtro por columna a la vez, así que la combinación se hace acá,
   ANTES de la grilla; el buscador rápido y el filtro de columna funcionan
   encima. El contador de arriba dice cuántos quedan y "Limpiar" los saca.

   QUIÉN PUEDE EDITAR: sale de `rolesEdicion` del módulo 'locales' en
   config/modulos.js. Hoy: administrativo y coordinación. El mismo permiso
   gobierna el botón "+" y el lápiz de cada fila.

   PARA VER TODO DE UN LOCAL está la ficha: /#/locales/:id. El nombre de cada
   fila es un link. El modal de acá es para editar los datos del padrón, no
   para ver el historial.
   ============================================================================ */

import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { GridActionsCellItem } from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DeleteIcon from '@mui/icons-material/Delete';
import LockIcon from '@mui/icons-material/Lock';
import PageHeader from '../components/ui/PageHeader';
import Modal from '../components/ui/Modal';
import Confirmar from '../components/ui/Confirmar';
import Grilla from '../components/ui/Grilla';
import { BadgeEstado } from '../components/ui/Badge';
import FormLocal from '../components/FormLocal';
import { CampoSelect } from '../components/ui/Campo';
import { faltantesRegistrales } from '../dominio/reglas';
import { useRol } from '../auth/rolContexto';
import { useDatos } from '../datos/datosContexto';
import { puedeEditar } from '../config/modulos';
import { LISTA_ESTADOS, etiquetaEstado } from '../dominio/estados';
import { fmtFecha } from '../dominio/fechas';

/* Las situaciones que el estado no dice solo. Cada una es una pregunta sobre
   el local; para sumar otra, se agrega una fila acá. */
const SITUACIONES = [
  { id: 'faltan-datos', etiqueta: 'Faltan datos registrales', cumple: (l) => faltantesRegistrales(l).length > 0 },
  { id: 'sin-ubicacion', etiqueta: 'Sin ubicación', cumple: (l) => Boolean(l.sinGeo) },
  { id: 'bloqueado', etiqueta: 'Con bloqueo manual', cumple: (l) => Boolean(l.bloqueado) },
  { id: 'documentacion', etiqueta: 'Con documentación vigente', cumple: (l) => l.estadoGrupo === 'documental' },
  {
    id: 'en-circuito',
    etiqueta: 'En circuito de intimación',
    cumple: (l) => ['cola_emision', 'en_tramite', 'entrega', 'bloqueo'].includes(l.estadoGrupo),
  },
];

const LOCAL_VACIO = {
  nombreLocal: '',
  razonSocial: '',
  cuit: '',
  rubro: '',
  direccion: '',
  domicilioFiscal: '',
  email: '',
  telefono: '',
  titularCuil: '',
  observaciones: '',
};

/* Quiénes dan de baja un local. Es lo mismo que exige el servidor
   (DELETE /locales/:id en backend/rutas/locales.js): mostrarle la papelera al
   administrativo terminaba en un "no tenés permiso". */
const ROLES_BAJA_LOCAL = ['coordinacion', 'administrador'];

function Local() {
  const { rol } = useRol();
  const navegar = useNavigate();
  const { localesConEstado, guardarLocal, eliminarLocal, permisos } = useDatos();
  const puedeEditarLocales = puedeEditar(rol, 'locales', permisos);
  const puedeDarDeBaja = puedeEditarLocales && ROLES_BAJA_LOCAL.includes(rol);

  /* ---------- Lo que puede venir pedido desde el Inicio ----------
     Dos parámetros opcionales, y los dos son SOLO ESTADO INICIAL: si la URL
     viene limpia (el caso normal, entrando por el menú) esta pantalla se
     comporta exactamente como antes.

       ?nuevo=1            abre el modal de alta ya al entrar
       ?estado=CODIGO      arranca con el desplegable de estado filtrado

     Existen porque el Inicio necesita ARRANCAR algo, no solo navegar: la
     tarjeta "Nuevo local" tiene que abrir el formulario, y la tarjeta
     "Locales con datos incompletos" tiene que llegar a la lista ya filtrada.
     El alta es un modal de esta pantalla y no tiene URL propia, así que la
     alternativa era duplicar el formulario en el Inicio. */
  const [params, setParams] = useSearchParams();
  const estadoPedido = params.get('estado') ?? '';

  /* Solo lectura: lo fija la URL al entrar y se limpia desde el aviso de abajo.
     Un código inventado en la URL dejaría la grilla vacía sin explicación, así
     que se valida contra la lista de estados. */
  const [filtroEstado, setFiltroEstado] = useState(() =>
    LISTA_ESTADOS.some((e) => e.codigo === estadoPedido) ? estadoPedido : '',
  );
  const [seleccion, setSeleccion] = useState(
    // El permiso se respeta igual que en el botón "+": sin `rolesEdicion` el
    // parámetro no abre nada.
    () => (params.get('nuevo') === '1' && puedeEditarLocales ? { local: { ...LOCAL_VACIO }, esNuevo: true } : null),
  );
  const [aEliminar, setAEliminar] = useState(null);
  const [filtroRubro, setFiltroRubro] = useState('');
  // ?situacion=bloqueado llega desde la bandeja de bloqueados del Inicio.
  const [filtroSituacion, setFiltroSituacion] = useState(() =>
    SITUACIONES.some((x) => x.id === params.get('situacion')) ? params.get('situacion') : '',
  );

  const cerrarModal = () => {
    setSeleccion(null);
    /* Se limpia `nuevo` de la URL al cerrar: si quedara puesto, recargar la
       página o compartir el link volvería a abrir el formulario de alta. El
       filtro `estado` se deja, que es lo que la persona está mirando. */
    if (params.has('nuevo')) {
      const resto = new URLSearchParams(params);
      resto.delete('nuevo');
      setParams(resto, { replace: true });
    }
  };

  const columnas = useMemo(
    () => [
      { field: 'id', headerName: 'N°', width: 70 },
      {
        field: 'nombreLocal',
        headerName: 'Local',
        flex: 1,
        minWidth: 200,
        renderCell: ({ row }) => (
          <Link to={`/locales/${row.id}`} className="link-local">
            {row.nombreLocal}
          </Link>
        ),
      },
      { field: 'razonSocial', headerName: 'Razón social', flex: 1, minWidth: 180 },
      { field: 'cuit', headerName: 'CUIT', width: 140 },
      { field: 'rubro', headerName: 'Rubro', width: 150 },
      { field: 'direccion', headerName: 'Dirección', flex: 1, minWidth: 180 },
      {
        field: 'estado',
        headerName: 'Estado',
        width: 230,
        renderCell: ({ row }) => (
          <span className="celda-estado">
            <BadgeEstado codigo={row.estado} sinColor />
            {/* El candado marca los locales excluidos del recálculo. Sin esto,
                un local bloqueado parece uno normal que no avanza. */}
            {/* El candado marca los locales excluidos del recálculo. Va como
                icono y no como emoji: los emoji los dibuja cada sistema
                operativo a su manera y desentonan con el resto de la interfaz,
                que usa los iconos de Material. */}
            {row.bloqueado && (
              <LockIcon fontSize="inherit" titleAccess={row.bloqueadoMotivo} sx={{ ml: 0.5, color: '#78909c' }} />
            )}
          </span>
        ),
      },
      {
        field: 'vencimiento',
        headerName: 'Vence',
        width: 130,
        // valueGetter para que el orden sea por fecha real y no por el texto:
        // ordenar '01/12' contra '15/03' como cadenas da cualquier cosa.
        valueGetter: (_v, row) => row.plazo?.vencimiento ?? '',
        renderCell: ({ row }) =>
          row.plazo ? (
            <span className={row.plazo.vencido ? 'texto-vencido' : ''}>{fmtFecha(row.plazo.vencimiento)}</span>
          ) : (
            <span className="texto-gris">—</span>
          ),
      },
      {
        field: 'cantidadActuaciones',
        headerName: 'Actuaciones',
        width: 110,
        type: 'number',
      },
      {
        field: 'acciones',
        headerName: 'Acciones',
        type: 'actions',
        width: 130,
        getActions: ({ row }) => {
          const acciones = [
            <GridActionsCellItem
              key="ficha"
              icon={<OpenInNewIcon fontSize="small" />}
              label="Abrir ficha"
              title="Abrir la ficha completa"
              onClick={() => navegar(`/locales/${row.id}`)}
            />,
          ];
          if (puedeEditarLocales) {
            acciones.push(
              <GridActionsCellItem
                key="editar"
                icon={<EditIcon fontSize="small" />}
                label="Editar"
                title="Editar datos del padrón"
                onClick={() => setSeleccion({ local: row, esNuevo: false })}
              />,
            );
          }
          if (puedeDarDeBaja) {
            acciones.push(
              <GridActionsCellItem
                key="eliminar"
                icon={<DeleteIcon fontSize="small" />}
                label="Eliminar"
                title="Eliminar del padrón"
                onClick={() => setAEliminar(row)}
              />,
            );
          }
          return acciones;
        },
      },
    ],
    [puedeEditarLocales, puedeDarDeBaja, navegar],
  );

  /* LA BÚSQUEDA Y LOS FILTROS SON LOS DE LA GRILLA.
     Antes esta pantalla tenía dos buscadores y dos desplegables propios encima
     de la tabla, que hacían lo mismo que el buscador rápido y los filtros por
     columna del Data Grid. Dos filtros sobre los mismos datos confunden: si uno
     buscaba arriba y filtraba en la columna, el resultado salía de la
     combinación y no había forma de ver por qué faltaba una fila.

     Lo único que queda acá es el filtro que llega POR URL: el tablero manda a
     /locales?estado=COMPLETAR_DATOS y esa lista tiene que aparecer ya filtrada. */
  const situacion = SITUACIONES.find((x) => x.id === filtroSituacion);
  const filas = useMemo(
    () =>
      localesConEstado.filter(
        (l) =>
          (!filtroEstado || l.estado === filtroEstado) &&
          (!filtroRubro || l.rubro === filtroRubro) &&
          (!situacion || situacion.cumple(l)),
      ),
    [localesConEstado, filtroEstado, filtroRubro, situacion],
  );

  // Las opciones salen del padrón: solo los estados y rubros que existen, con
  // cuántos locales hay en cada uno.
  const opcionesEstado = useMemo(() => {
    const cuenta = {};
    localesConEstado.forEach((l) => (cuenta[l.estado] = (cuenta[l.estado] ?? 0) + 1));
    return LISTA_ESTADOS.filter((e) => cuenta[e.codigo]).map((e) => ({
      id: e.codigo,
      etiqueta: `${e.etiqueta} (${cuenta[e.codigo]})`,
    }));
  }, [localesConEstado]);
  const opcionesRubro = useMemo(
    () => [...new Set(localesConEstado.map((l) => l.rubro).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [localesConEstado],
  );
  const hayFiltros = Boolean(filtroEstado || filtroRubro || filtroSituacion);

  function limpiarFiltros() {
    setFiltroEstado('');
    setFiltroRubro('');
    setFiltroSituacion('');
    if (params.has('estado') || params.has('situacion')) {
      const resto = new URLSearchParams(params);
      resto.delete('estado');
      resto.delete('situacion');
      setParams(resto, { replace: true });
    }
  }

  return (
    <>
      <PageHeader
        etiqueta="LOCALES"
        titulo="PADRÓN DE ESTABLECIMIENTOS"
        subtitulo={`${filas.length} de ${localesConEstado.length} locales`}
        botonVolver
      />

      <div className="filtros-fila filtros-padron">
        <CampoSelect
          id="filtro-estado"
          etiqueta="Estado"
          valor={filtroEstado}
          onChange={setFiltroEstado}
          opciones={opcionesEstado}
          vacio="Todos"
        />
        <CampoSelect
          id="filtro-rubro"
          etiqueta="Rubro"
          valor={filtroRubro}
          onChange={setFiltroRubro}
          opciones={opcionesRubro}
          vacio="Todos"
        />
        <CampoSelect
          id="filtro-situacion"
          etiqueta="Situación"
          valor={filtroSituacion}
          onChange={setFiltroSituacion}
          opciones={SITUACIONES.map((x) => ({ id: x.id, etiqueta: x.etiqueta }))}
          vacio="Todas"
        />
        {hayFiltros && (
          <button type="button" className="btn-secundario filtros-limpiar" onClick={limpiarFiltros}>
            Limpiar filtros
          </button>
        )}
      </div>

      {/* El aviso queda para cuando se llega filtrado desde el tablero. */}
      {filtroEstado && filtroEstado === estadoPedido && (
        <div className="filtro-activo">
          <span>
            Mostrando solo los locales en estado <strong>{etiquetaEstado(filtroEstado)}</strong>.
          </span>
          <button
            type="button"
            className="btn-secundario"
            onClick={() => {
              setFiltroEstado('');
              const resto = new URLSearchParams(params);
              resto.delete('estado');
              setParams(resto, { replace: true });
            }}
          >
            Ver todo el padrón
          </button>
        </div>
      )}

      <Grilla
        filas={filas}
        columnas={columnas}
        nombreArchivo="padron-locales"
        vacio="Ningún local coincide con la búsqueda."
        botones={
          puedeEditarLocales && (
            <button
              type="button"
              className="btn-icono btn-icono-azul"
              title="Nuevo local"
              onClick={() => setSeleccion({ local: { ...LOCAL_VACIO }, esNuevo: true })}
            >
              <AddIcon fontSize="small" />
            </button>
          )
        }
      />

      {/* ---------- Modal de alta / edición ----------
          El `seleccion &&` de afuera hace que el formulario se desmonte del
          todo al cerrar, así el próximo local arranca limpio. */}
      {seleccion && (
        <Modal
          abierto
          etiqueta="PADRÓN"
          titulo={seleccion.esNuevo ? 'Nuevo local' : `Editar ${seleccion.local.nombreLocal}`}
          ancho="ancho"
          onCerrar={cerrarModal}
        >
          <FormLocal
            key={seleccion.esNuevo ? 'nuevo' : seleccion.local.id}
            local={seleccion.local}
            esNuevo={seleccion.esNuevo}
            onGuardar={async (l) => {
              // Se cierra solo si se guardó: si el servidor lo rechaza (un CUIT
              // mal escrito, por ejemplo), queda abierto con lo escrito.
              if (await guardarLocal(l)) cerrarModal();
            }}
            onCancelar={cerrarModal}
          />
        </Modal>
      )}

      <Confirmar
        abierto={Boolean(aEliminar)}
        titulo="Eliminar del padrón"
        textoConfirmar="Eliminar"
        peligro
        onCancelar={() => setAEliminar(null)}
        onConfirmar={async () => {
          // Se cierra solo si se dio de baja: si falla, el cartel dice por qué.
          if (await eliminarLocal(aEliminar.id)) setAEliminar(null);
        }}
      >
        <p>
          Se elimina <strong>{aEliminar?.nombreLocal}</strong> junto con sus {aEliminar?.cantidadActuaciones} actuación(es) y sus
          relevamientos.
        </p>
        <p className="texto-chico">
          Si es un duplicado, NO lo elimines: usá Herramientas → Duplicados, que unifica el historial en el otro registro en vez de
          perderlo.
        </p>
      </Confirmar>
    </>
  );
}

export default Local;
