/* ============================================================================
   pages/config/Usuarios.jsx  —  USUARIOS Y ROLES  (URL: /#/config/usuarios)
   ----------------------------------------------------------------------------
   >>> REQUERIMIENTO EXPLÍCITO DEL ÁREA (sección 7.1) <<<
   "La composición del equipo cambia con frecuencia: tanto la coordinación como
   los agentes de campo rotan. El esquema actual, donde dar de alta a un agente
   implica modificar una lista dentro del código, es INVIABLE."

   Por eso esta pantalla existe: la Dirección da de alta, asigna rol y da de
   baja sin intervención técnica.

   >>> LA IDENTIDAD TIENE QUE SER INSTITUCIONAL (sección 7.3) <<<
   El sistema viejo identifica a los agentes por su cuenta personal de correo
   gratuito. Un agente que deja el organismo CONSERVA EL CONTROL de la cuenta
   con la que firmó actuaciones administrativas. Acá el correo tiene que ser
   @smt.gob.ar, y la autenticación la va a resolver CiDiTuc (capítulo 8): la
   aplicación no administra contraseñas propias.

   >>> POR QUÉ SE DA DE BAJA Y NO SE BORRA <<<
   Porque el usuario firmó actuaciones. Si se borra, el historial queda
   atribuido a un id inexistente. La baja (activo: false) lo saca de los
   desplegables de asignación pero conserva la trazabilidad de lo que hizo.

   OJO: el alta acá NO implica alta en CiDiTuc ni al revés. Hay que contemplar
   el caso de un agente con identidad válida pero sin rol asignado: entra al
   sistema y no ve ningún módulo (el Inicio se lo avisa).
   ============================================================================ */

import PageHeader from '../../components/ui/PageHeader';
import Aviso from '../../components/ui/Aviso';
import Badge from '../../components/ui/Badge';
import CrudCatalogo from '../../components/CrudCatalogo';
import { useDatos } from '../../datos/datosContexto';
import { LISTA_ROLES } from '../../auth/roles';

const CAMPOS = [
  { id: 'nombre', etiqueta: 'Nombre y apellido', requerido: true },
  {
    id: 'email',
    etiqueta: 'Correo institucional',
    requerido: true,
    ayuda: 'Tiene que ser @smt.gob.ar. Nunca una cuenta personal: las actuaciones se firman con esta identidad.',
  },
  {
    id: 'rol',
    etiqueta: 'Rol',
    tipo: 'select',
    opciones: LISTA_ROLES.map((r) => ({ id: r.id, etiqueta: r.etiqueta })),
    requerido: true,
    render: (u) => {
      const rol = LISTA_ROLES.find((r) => r.id === u.rol);
      return rol ? rol.etiqueta : <Badge color="gris">{u.rol}</Badge>;
    },
  },
  {
    id: 'activo',
    etiqueta: 'Usuario activo',
    tipo: 'checkbox',
    pordefecto: true,
    ayuda: 'Al darlo de baja deja de aparecer en las asignaciones, pero su historial de actuaciones se conserva.',
    render: (u) => (u.activo ? <Badge color="verde">Activo</Badge> : <Badge color="gris">De baja</Badge>),
  },
];

function Usuarios() {
  const { usuarios, actuaciones, relevamientos } = useDatos();

  /* Cuántas actuaciones firmó. Es el dato que explica por qué no se puede
     borrar un usuario: eso quedaría sin autor. */
  const firmadas = (u) =>
    actuaciones.filter((a) => a.usuario === u.nombre || a.notificadorId === u.id).length +
    relevamientos.filter((r) => r.usuario === u.nombre).length;

  const sinCorreoInstitucional = usuarios.filter((u) => u.activo && !u.email.endsWith('@smt.gob.ar') && u.rol !== 'titular');

  return (
    <>
      <PageHeader
        etiqueta="CONFIGURACIÓN"
        titulo="USUARIOS Y ROLES"
        subtitulo={`${usuarios.filter((u) => u.activo).length} activo(s) de ${usuarios.length}`}
        botonVolver
      />

      <Aviso tipo="info" titulo="La autenticación la resuelve CiDiTuc, la autorización este sistema">
        CiDiTuc dice quién es la persona; el rol que se asigna acá dice qué puede hacer. El alta en este sistema no implica alta en
        CiDiTuc ni al revés: un agente con identidad válida y sin rol asignado entra y no ve ningún módulo.
      </Aviso>

      {sinCorreoInstitucional.length > 0 && (
        <Aviso tipo="alerta" titulo={`${sinCorreoInstitucional.length} usuario(s) activos con correo no institucional`}>
          {sinCorreoInstitucional.map((u) => `${u.nombre} (${u.email})`).join(' · ')}. Un agente que deja el organismo conserva el
          control de esa cuenta, y con ella la identidad con la que firmó actos administrativos.
        </Aviso>
      )}

      <CrudCatalogo
        clave="usuarios"
        titulo="usuario"
        campos={CAMPOS}
        columnas={['nombre', 'email', 'rol', 'activo']}
        enUso={firmadas}
        orden={(a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre)}
      />

      {/* ---------- Qué puede hacer cada rol ----------
          Sin esto, asignar un rol es adivinar. */}
      <div className="accesos-header">
        <span>Qué hace cada rol</span>
      </div>
      <table className="tabla-datos">
        <thead>
          <tr>
            <th>Rol</th>
            <th>Alcance</th>
          </tr>
        </thead>
        <tbody>
          {LISTA_ROLES.map((r) => (
            <tr key={r.id}>
              <td>
                <strong>{r.etiqueta}</strong>
              </td>
              <td>{r.descripcion}</td>
            </tr>
          ))}
          <tr>
            <td>
              <strong>Sistema</strong>
            </td>
            <td>
              Actor no humano de los procesos automáticos (recálculo de estados, geocodificación, vencimientos). No es un rol de
              login: sus escrituras quedan auditadas como tales.
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

export default Usuarios;
