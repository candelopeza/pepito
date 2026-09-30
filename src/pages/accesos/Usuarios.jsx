/* ============================================================================
   pages/accesos/Usuarios.jsx  —  USUARIOS  (URL: /#/accesos/usuarios)
   ----------------------------------------------------------------------------
   >>> REQUERIMIENTO EXPLÍCITO DEL ÁREA (sección 7.1) <<<
   "La composición del equipo cambia con frecuencia: tanto la coordinación como
   los agentes de campo rotan. El esquema actual, donde dar de alta a un agente
   implica modificar una lista dentro del código, es INVIABLE."

   Por eso esta pantalla existe: el administrador (y la Dirección) da de alta,
   asigna rol y da de baja sin intervención técnica. Qué puede hacer cada rol
   se define al lado, en Accesos → Tipos de usuario.

   LA PANTALLA es la misma grilla que el padrón (ui/Grilla.jsx): buscador a la
   izquierda, botones a la derecha (agregar, imprimir, descargar), barra de
   columnas / filtros / densidad / exportar, y por fila los íconos de editar,
   eliminar y la llave que abre los permisos del tipo de usuario de esa persona.

   >>> LA IDENTIDAD TIENE QUE SER INSTITUCIONAL (sección 7.3) <<<
   El correo tiene que ser @smt.gob.ar (salvo el titular, que entra con su
   Ciudadano Digital). La autenticación la resuelve CiDiTuc (capítulo 8): la
   aplicación no administra contraseñas propias.

   >>> POR QUÉ SE DA DE BAJA Y NO SE BORRA <<<
   Porque el usuario firmó actuaciones. La baja (activo: false) lo saca de los
   desplegables de asignación pero conserva la trazabilidad de lo que hizo. La
   llave de la columna Activo hace eso con un toque, sin abrir el formulario.
   Eliminar existe, pero avisa cuántas actuaciones quedarían sin autor.
   ============================================================================ */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GridActionsCellItem } from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import PageHeader from '../../components/ui/PageHeader';
import Aviso from '../../components/ui/Aviso';
import Badge from '../../components/ui/Badge';
import Grilla from '../../components/ui/Grilla';
import Modal from '../../components/ui/Modal';
import Confirmar from '../../components/ui/Confirmar';
import Campo, { CampoSelect } from '../../components/ui/Campo';
import Interruptor from '../../components/ui/hab/des';
import { useRol } from '../../auth/rolContexto';
import { LISTA_ROLES, ROLES } from '../../auth/roles';
import { useDatos } from '../../datos/datosContexto';
import { puedeEditar, puedeVerRuta, rolHabilitado } from '../../config/modulos';

const USUARIO_VACIO = { nombre: '', email: '', rol: '', activo: true };

function Usuarios() {
  const { rol, usuario } = useRol();
  const navegar = useNavigate();
  const { usuarios, actuaciones, relevamientos, permisos, guardarEnCatalogo, eliminarDeCatalogo } = useDatos();

  const soloLectura = !puedeEditar(rol, 'accesos-usuarios', permisos);
  const veTipos = puedeVerRuta(rol, '/accesos/tipos-usuario', permisos);

  const [buscar, setBuscar] = useState('');
  // El usuario que se está creando o editando en el modal. null = cerrado.
  const [editando, setEditando] = useState(null);
  const [errores, setErrores] = useState({});
  const [aEliminar, setAEliminar] = useState(null);

  /* Cuántas actuaciones firmó. Es el dato que explica por qué conviene dar de
     baja y no borrar: eso quedaría sin autor. */
  const firmadas = (u) =>
    actuaciones.filter((a) => a.usuario === u.nombre || a.notificadorId === u.id).length +
    relevamientos.filter((r) => r.usuario === u.nombre).length;

  /* ---------- Las filas: activos primero, después por nombre ---------- */
  const filas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return usuarios
      .map((u) => ({ ...u, rolEtiqueta: ROLES[u.rol]?.etiqueta ?? u.rol }))
      .filter((u) => !q || [u.nombre, u.email, u.rolEtiqueta].some((t) => t.toLowerCase().includes(q)))
      .sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre));
  }, [usuarios, buscar]);

  /* ---------- Alta / edición ---------- */
  function guardar() {
    const e = {};
    if (!editando.nombre.trim()) e.nombre = 'El nombre es obligatorio.';
    if (!editando.email.trim()) e.email = 'El correo es obligatorio.';
    else if (editando.rol !== 'titular' && !editando.email.trim().toLowerCase().endsWith('@smt.gob.ar')) {
      e.email = 'Tiene que ser un correo institucional @smt.gob.ar.';
    }
    if (!editando.rol) e.rol = 'Elegí el tipo de usuario.';
    setErrores(e);
    if (Object.keys(e).length) return;

    guardarEnCatalogo('usuarios', { ...editando, nombre: editando.nombre.trim(), email: editando.email.trim() });
    setEditando(null);
  }

  /* ---------- Las columnas ---------- */
  const columnas = useMemo(
    () => [
      { field: 'id', headerName: 'ID', width: 70 },
      { field: 'nombre', headerName: 'Nombre', flex: 1, minWidth: 200 },
      { field: 'email', headerName: 'Correo', flex: 1, minWidth: 220 },
      {
        field: 'rolEtiqueta',
        headerName: 'Tipo de usuario',
        flex: 1,
        minWidth: 200,
        renderCell: ({ row }) => (
          <span className="celda-estado">
            {row.rolEtiqueta}
            {row.rol !== 'sistema' && !rolHabilitado(row.rol, permisos) && <Badge color="gris">deshabilitado</Badge>}
          </span>
        ),
      },
      {
        field: 'activo',
        headerName: 'Habilita',
        width: 160,
        type: 'boolean',
        renderCell: ({ row }) => {
          if (row.rol === 'sistema') return <Badge color="gris">Automático</Badge>;
          // Nadie se da de baja a sí mismo desde acá: quedaría adentro sin poder volver a entrar.
          const esElPropio = row.email === usuario.email;
          return (
            <Interruptor
              activo={row.activo}
              deshabilitado={soloLectura || esElPropio}
              etiqueta={row.activo ? 'Activo' : 'De baja'}
              onChange={(v) => guardarEnCatalogo('usuarios', { ...row, activo: v })}
            />
          );
        },
      },
      {
        field: 'acciones',
        headerName: 'Acciones',
        type: 'actions',
        width: 140,
        getActions: ({ row }) => {
          const esSistema = row.rol === 'sistema';
          const esElPropio = row.email === usuario.email;
          const lista = [];
          if (!soloLectura && !esSistema) {
            lista.push(
              <GridActionsCellItem
                key="editar"
                className="accion-grilla-editar"
                icon={<EditIcon fontSize="small" />}
                label="Editar"
                title="Editar"
                onClick={() => {
                  setErrores({});
                  setEditando({ id: row.id, nombre: row.nombre, email: row.email, rol: row.rol, activo: row.activo });
                }}
              />,
            );
          }
          if (!soloLectura && !esSistema && !esElPropio) {
            lista.push(
              <GridActionsCellItem
                key="eliminar"
                className="accion-grilla-borrar"
                icon={<DeleteIcon fontSize="small" />}
                label="Eliminar"
                title="Eliminar"
                onClick={() => setAEliminar(row)}
              />,
            );
          }
          if (veTipos && !esSistema) {
            lista.push(
              <GridActionsCellItem
                key="permisos"
                className="accion-grilla-llave"
                icon={<VpnKeyIcon fontSize="small" />}
                label="Permisos del tipo de usuario"
                title={`Permisos de ${row.rolEtiqueta}`}
                onClick={() => navegar(`/accesos/tipos-usuario?rol=${row.rol}`)}
              />,
            );
          }
          return lista;
        },
      },
    ],
    [permisos, soloLectura, veTipos, usuario.email, guardarEnCatalogo, navegar],
  );

  const sinCorreoInstitucional = usuarios.filter(
    (u) => u.activo && !u.email.endsWith('@smt.gob.ar') && u.rol !== 'titular',
  );
  const usos = aEliminar ? firmadas(aEliminar) : 0;

  return (
    <>
      <PageHeader
        etiqueta="ACCESOS"
        titulo="USUARIOS"
        subtitulo={`${usuarios.filter((u) => u.activo).length} activo(s) de ${usuarios.length}`}
        botonVolver
      />

      {sinCorreoInstitucional.length > 0 && (
        <Aviso tipo="alerta" titulo={`${sinCorreoInstitucional.length} usuario(s) activos con correo no institucional`}>
          {sinCorreoInstitucional.map((u) => `${u.nombre} (${u.email})`).join(' · ')}
        </Aviso>
      )}

      <Grilla
        filas={filas}
        columnas={columnas}
        nombreArchivo="usuarios"
        vacio="Ningún usuario coincide con la búsqueda."
        buscadores={[{ placeholder: 'Buscar', valor: buscar, onChange: setBuscar }]}
        botones={
          !soloLectura && (
            <button
              type="button"
              className="btn-icono btn-icono-azul"
              title="Nuevo usuario"
              onClick={() => {
                setErrores({});
                setEditando({ ...USUARIO_VACIO });
              }}
            >
              <AddIcon fontSize="small" />
            </button>
          )
        }
      />

      {/* ---------- Alta / edición ---------- */}
      {editando && (
        <Modal abierto etiqueta="ACCESOS" titulo={editando.id ? 'Editar usuario' : 'Nuevo usuario'} onCerrar={() => setEditando(null)}>
          <div className="formulario formulario-modal">
            <Campo
              id="usr-nombre"
              etiqueta="Nombre y apellido"
              valor={editando.nombre}
              onChange={(v) => setEditando({ ...editando, nombre: v })}
              error={errores.nombre}
            />
            <Campo
              id="usr-email"
              etiqueta="Correo institucional"
              tipo="email"
              valor={editando.email}
              onChange={(v) => setEditando({ ...editando, email: v })}
              error={errores.email}
              ayuda="Tiene que ser @smt.gob.ar."
            />
            <CampoSelect
              id="usr-rol"
              etiqueta="Tipo de usuario"
              valor={editando.rol}
              onChange={(v) => setEditando({ ...editando, rol: v })}
              opciones={LISTA_ROLES.map((r) => ({
                id: r.id,
                etiqueta: rolHabilitado(r.id, permisos) ? r.etiqueta : `${r.etiqueta} (deshabilitado)`,
              }))}
              error={errores.rol}
            />
            <div className="form-grupo form-grupo-check">
              <label htmlFor="usr-activo">
                <input
                  id="usr-activo"
                  type="checkbox"
                  checked={Boolean(editando.activo)}
                  disabled={editando.email === usuario.email}
                  onChange={(e) => setEditando({ ...editando, activo: e.target.checked })}
                />
                Usuario activo
              </label>
              <span className="form-ayuda">De baja deja de aparecer en las asignaciones. Su historial se conserva.</span>
            </div>

            <div className="form-acciones">
              <button type="button" className="btn-primario" onClick={guardar}>
                Guardar
              </button>
              <button type="button" className="btn-secundario" onClick={() => setEditando(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ---------- Baja definitiva ---------- */}
      <Confirmar
        abierto={Boolean(aEliminar)}
        titulo="Eliminar usuario"
        textoConfirmar="Eliminar"
        peligro
        onCancelar={() => setAEliminar(null)}
        onConfirmar={() => {
          eliminarDeCatalogo('usuarios', aEliminar.id);
          setAEliminar(null);
        }}
      >
        <p>
          Se elimina <strong>{aEliminar?.nombre}</strong> ({aEliminar?.email}).
        </p>
        {usos > 0 && (
          <Aviso tipo="alerta" titulo={`Firmó ${usos} actuación(es)`}>
            Quedarían sin autor identificable. Para conservar la trazabilidad conviene darlo de baja en vez de eliminarlo.
          </Aviso>
        )}
      </Confirmar>
    </>
  );
}

export default Usuarios;
