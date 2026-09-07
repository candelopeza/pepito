/* ============================================================================
   pages/Local.jsx  —  PADRÓN DE ESTABLECIMIENTOS  (URL: /#/locales)
   ----------------------------------------------------------------------------
   El listado completo: búsqueda por cualquier campo, filtros combinables,
   orden por columna y exportación del resultado (sección 6.1).

   >>> LA COLUMNA "ESTADO" NO SALE DE LA BASE <<<
   Se calcula con las reglas del dominio a partir del historial de actuaciones
   de cada local (ver datos/vistas.js → conEstado). No hay un campo `estado`
   que alguien pueda dejar desactualizado.

   FILTROS: los dos buscadores y los dos desplegables filtran ANTES de la
   grilla; los filtros propios de cada columna del Data Grid funcionan ENCIMA
   de eso. Si buscás algo y "no aparece", revisá los dos niveles.

   QUIÉN PUEDE EDITAR: sale de `rolesEdicion` del módulo 'locales' en
   config/modulos.js. Hoy: administrativo y coordinación. El mismo permiso
   gobierna el botón "+" y el lápiz de cada fila.

   PARA VER TODO DE UN LOCAL está la ficha: /#/locales/:id. El nombre de cada
   fila es un link. El modal de acá es para editar los datos del padrón, no
   para ver el historial.
   ============================================================================ */

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GridActionsCellItem } from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DeleteIcon from '@mui/icons-material/Delete';
import PageHeader from '../components/ui/PageHeader';
import Modal from '../components/ui/Modal';
import Confirmar from '../components/ui/Confirmar';
import Grilla from '../components/ui/Grilla';
import { BadgeEstado } from '../components/ui/Badge';
import { CampoSelect } from '../components/ui/Campo';
import FormLocal from '../components/FormLocal';
import { useRol } from '../auth/rolContexto';
import { useDatos } from '../datos/datosContexto';
import { puedeEditar } from '../config/modulos';
import { LISTA_ESTADOS } from '../dominio/estados';
import { fmtFecha } from '../dominio/fechas';

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

function Local() {
  const { rol } = useRol();
  const navegar = useNavigate();
  const { localesConEstado, rubros, guardarLocal, eliminarLocal } = useDatos();
  const puedeEditarLocales = puedeEditar(rol, 'locales');

  const [buscar, setBuscar] = useState('');
  const [buscarCuit, setBuscarCuit] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroRubro, setFiltroRubro] = useState('');
  const [seleccion, setSeleccion] = useState(null);
  const [aEliminar, setAEliminar] = useState(null);

  const cerrarModal = () => setSeleccion(null);

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
            <BadgeEstado codigo={row.estado} />
            {/* El candado marca los locales excluidos del recálculo. Sin esto,
                un local bloqueado parece uno normal que no avanza. */}
            {row.bloqueado && <span title={row.bloqueadoMotivo}> 🔒</span>}
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
    [puedeEditarLocales, navegar],
  );

  const filas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const qc = buscarCuit.replace(/\D/g, '');

    return localesConEstado.filter((l) => {
      // El buscador general mira nombre, razón social, dirección e id legacy:
      // el pliego pide "búsqueda por cualquier campo" y en la práctica se
      // busca por lo que uno recuerda, que nunca es el campo que corresponde.
      const enTexto =
        !q ||
        [l.nombreLocal, l.razonSocial, l.direccion, l.idLegacy, String(l.id)]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));

      const enCuit = !qc || String(l.cuit).replace(/\D/g, '').includes(qc);
      const enEstado = !filtroEstado || l.estado === filtroEstado;
      const enRubro = !filtroRubro || l.rubro === filtroRubro;

      return enTexto && enCuit && enEstado && enRubro;
    });
  }, [localesConEstado, buscar, buscarCuit, filtroEstado, filtroRubro]);

  return (
    <>
      <PageHeader
        etiqueta="LOCALES"
        titulo="PADRÓN DE ESTABLECIMIENTOS"
        subtitulo={`${filas.length} de ${localesConEstado.length} locales`}
        botonVolver
      />

      {/* ---------- Filtros por estado y rubro ----------
          Van fuera de la grilla porque son los dos que se usan siempre. */}
      <div className="filtros-fila">
        <CampoSelect
          id="filtro-estado"
          etiqueta="Filtrar por estado"
          valor={filtroEstado}
          onChange={setFiltroEstado}
          opciones={LISTA_ESTADOS.map((e) => ({ id: e.codigo, etiqueta: e.etiqueta }))}
          vacio="Todos los estados"
        />
        <CampoSelect
          id="filtro-rubro"
          etiqueta="Filtrar por rubro"
          valor={filtroRubro}
          onChange={setFiltroRubro}
          opciones={rubros.map((r) => ({ id: r.nombre, etiqueta: r.nombre }))}
          vacio="Todos los rubros"
        />
      </div>

      <Grilla
        filas={filas}
        columnas={columnas}
        nombreArchivo="padron-locales"
        vacio="Ningún local coincide con la búsqueda."
        buscadores={[
          { placeholder: 'Buscar por nombre, razón social o dirección...', valor: buscar, onChange: setBuscar },
          { placeholder: 'Buscar por CUIT...', valor: buscarCuit, onChange: setBuscarCuit },
        ]}
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
            onGuardar={(l) => {
              guardarLocal(l);
              cerrarModal();
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
        onConfirmar={() => {
          eliminarLocal(aEliminar.id);
          setAEliminar(null);
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
