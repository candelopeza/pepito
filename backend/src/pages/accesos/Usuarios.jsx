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
   columnas / filtros / densidad / exportar, y por fila el lápiz de editar y
   la llave que abre los permisos del tipo de usuario de esa persona.

   >>> LA IDENTIDAD TIENE QUE SER INSTITUCIONAL (sección 7.3) <<<
   El correo tiene que ser @smt.gob.ar (salvo el titular, que entra con su
   Ciudadano Digital). La autenticación la resuelve CiDiTuc (capítulo 8): la
   aplicación no administra contraseñas propias.

   >>> LO QUE GUARDA LA BASE DEL ÁREA <<<
   La tabla `usuario` tiene el LEGAJO de la persona (id_persona, el mismo que
   va a usar CiDiTuc), su tipo de usuario y si está activa. No tiene nombre ni
   correo: hasta que esté CiDiTuc, la persona se identifica por el legajo. El
   campo de correo sigue acá y aparece solo si el backend lo devuelve, para el
   día que la base lo tenga.

   >>> POR QUÉ SE DA DE BAJA Y NO SE BORRA <<<
   Porque el usuario firmó actuaciones (tramite.id_usuario apunta a él). La
   baja (activo: false) lo saca de los desplegables de asignación y le cierra
   la entrada, pero conserva la trazabilidad de lo que hizo. La llave de la
   columna Habilita hace eso con un toque, sin abrir el formulario, y con otro
   toque lo reactiva. No hay ícono de eliminar: el backend tampoco borra
   (es la misma baja lógica), y un tacho que deja la fila donde estaba parece
   un error.
   ============================================================================ */

import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GridActionsCellItem } from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import Aviso from '../../components/ui/Aviso';
import Badge from '../../components/ui/Badge';
import Grilla from '../../components/ui/Grilla';
import Modal from '../../components/ui/Modal';
import Campo, { CampoSelect } from '../../components/ui/Campo';
import Interruptor from '../../components/ui/hab/des';
import { useRol } from '../../auth/rolContexto';
import { LISTA_ROLES, ROLES } from '../../auth/roles';
import { useDatos } from '../../datos/datosContexto';
import { ROL_ADMINISTRADOR, puedeEditar, puedeVerRuta, rolHabilitado } from '../../config/modulos';

const USUARIO_VACIO = { nombre: '', email: '', rol: '', activo: true };

function Usuarios() {
  const { rol, usuario } = useRol();
  const navegar = useNavigate();
  const { usuarios: todos, permisos, guardarEnCatalogo } = useDatos();

  /* A LOS ADMINISTRADORES LOS VE SOLO OTRO ADMINISTRADOR (03/11/2026). Desde
     que el administrativo entra acá, quien no es administrador no los ve en
     la lista, así no los da de baja ni los edita. El backend igual rechaza
     tocarlos o dar ese rol (rutas/configuracion.js, controlarUsuario). */
  const usuarios = useMemo(
    () => (rol === ROL_ADMINISTRADOR ? todos : todos.filter((u) => u.rol !== ROL_ADMINISTRADOR)),
    [todos, rol],
  );

  const soloLectura = !puedeEditar(rol, 'accesos', permisos);
  // La llave de cada fila abre los permisos de ese tipo de usuario, que es
  // una pestaña del administrador y del administrativo (este, para consulta;
  // pages/Accesos.jsx): a los demás no se les ofrece, para que no toquen un
  // ícono que no hace nada.
  const veTipos =
    [ROL_ADMINISTRADOR, 'administrativo'].includes(rol) && puedeVerRuta(rol, '/accesos/tipos-usuario', permisos);

  const [buscar, setBuscar] = useState('');
  // El usuario que se está creando o editando en el modal. null = cerrado.
  const [editando, setEditando] = useState(null);
  const [errores, setErrores] = useState({});

  // ¿La base guarda correo? La del área no: entonces la persona es su legajo.
  const hayCorreo = usuarios.some((u) => u.email);
  const esElPropio = useCallback(
    (u) => Boolean((usuario.id && u.id === usuario.id) || (u.email && u.email === usuario.email)),
    [usuario.id, usuario.email],
  );

  /* ---------- Las filas: activos primero, después por nombre ---------- */
  const filas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return usuarios
      .map((u) => ({ ...u, rolEtiqueta: ROLES[u.rol]?.etiqueta ?? u.rol }))
      .filter((u) => !q || [u.nombre, u.email, u.rolEtiqueta].some((t) => String(t ?? '').toLowerCase().includes(q)))
      .sort((a, b) => Number(b.activo) - Number(a.activo) || String(a.nombre).localeCompare(String(b.nombre)));
  }, [usuarios, buscar]);

  /* ---------- Alta / edición ---------- */
  async function guardar() {
    const e = {};
    const nombre = String(editando.nombre ?? '').trim();
    const email = String(editando.email ?? '').trim();
    if (!nombre) e.nombre = hayCorreo ? 'El nombre es obligatorio.' : 'El legajo es obligatorio.';
    if (hayCorreo) {
      if (!email) e.email = 'El correo es obligatorio.';
      else if (editando.rol !== 'titular' && !email.toLowerCase().endsWith('@smt.gob.ar')) {
        e.email = 'Tiene que ser un correo institucional @smt.gob.ar.';
      }
    }
    if (!editando.rol) e.rol = 'Elegí el tipo de usuario.';
    setErrores(e);
    if (Object.keys(e).length) return;

    // Se cierra solo si se guardó: si el servidor lo rechaza (legajo repetido,
    // por ejemplo), el formulario queda abierto con lo escrito.
    if (await guardarEnCatalogo('usuarios', { ...editando, nombre, email })) setEditando(null);
  }

  /* ---------- Las columnas ---------- */
  const columnas = useMemo(
    () => [
      { field: 'id', headerName: 'ID', width: 70 },
      { field: 'nombre', headerName: hayCorreo ? 'Nombre' : 'Legajo', flex: 1, minWidth: 200 },
      ...(hayCorreo ? [{ field: 'email', headerName: 'Correo', flex: 1, minWidth: 220 }] : []),
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
          return (
            <Interruptor
              activo={row.activo}
              deshabilitado={soloLectura || esElPropio(row)}
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
        width: 110,
        getActions: ({ row }) => {
          const esSistema = row.rol === 'sistema';
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
    [permisos, soloLectura, veTipos, esElPropio, hayCorreo, guardarEnCatalogo, navegar],
  );

  const sinCorreoInstitucional = usuarios.filter(
    (u) => u.activo && u.email && !u.email.endsWith('@smt.gob.ar') && u.rol !== 'titular',
  );

  return (
    <>
      <div className="accesos-header">
        <span>
          Usuarios: {usuarios.filter((u) => u.activo).length} activo(s) de {usuarios.length}
        </span>
      </div>

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
              etiqueta={hayCorreo ? 'Nombre y apellido' : 'Legajo'}
              valor={editando.nombre}
              onChange={(v) => setEditando({ ...editando, nombre: v })}
              error={errores.nombre}
              teclado={hayCorreo ? undefined : 'numeric'}
            />
            {hayCorreo && (
              <Campo
                id="usr-email"
                etiqueta="Correo institucional"
                tipo="email"
                valor={editando.email}
                onChange={(v) => setEditando({ ...editando, email: v })}
                error={errores.email}
                ayuda="Tiene que ser @smt.gob.ar."
              />
            )}
            <CampoSelect
              id="usr-rol"
              etiqueta="Tipo de usuario"
              valor={editando.rol}
              onChange={(v) => setEditando({ ...editando, rol: v })}
              /* El rol administrador solo lo da otro administrador (el backend lo
                 rechaza igual): a la Dirección no se le ofrece, así no lo elige
                 para enterarse recién al guardar. Si el usuario editado ya es
                 administrador, la opción queda para que se vea su rol. */
              opciones={LISTA_ROLES.filter(
                (r) => r.id !== 'administrador' || rol === 'administrador' || editando.rol === 'administrador',
              ).map((r) => ({
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
                  disabled={esElPropio(editando)}
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

    </>
  );
}

export default Usuarios;
