/* ============================================================================
   pages/Relevamiento.jsx  —  RELEVAMIENTOS  (URL: /#/relevamientos)
   ----------------------------------------------------------------------------
   Dos cosas en una pantalla:

     1. LOS PENDIENTES DE CONTROL (etapa 2 del circuito)
        Coordinación revisa TODO relevamiento antes de que produzca efectos.
        Sobre un Generador Menor puede confirmar la exención o corregir la
        clasificación; sobre un Gran Generador completa datos y habilita la
        notificación. Los botones salen de AccionesLocal, así que son los
        mismos que en el tablero y en la ficha.

     2. EL LISTADO COMPLETO de lo relevado, para consulta y exportación.

   >>> CORRECCIÓN RESPECTO DE DOCUMENTACIÓN ANTERIOR <<<
   Los locales exentos NO se derivan a ninguna brigada de inspección externa.
   El control lo hace el propio equipo de coordinación del área. Las versiones
   anteriores del pliego afirmaban lo contrario.

   >>> DOS COLUMNAS NO LAS VE TODO EL MUNDO <<<
   "Coordenada del dispositivo" y "Carga" (sin conexión / en línea) son
   MÉTRICAS DE CÓMO SE TRABAJÓ, no datos del local: la primera es la posición
   del celular al guardar (sirve para evaluar cobertura territorial, NO es la
   ubicación del local, ver dominio/geo.js) y la segunda dice si el
   relevamiento se cargó offline y se sincronizó después.

   A quien releva o consulta el listado no le aportan nada y le ensanchan la
   grilla, así que solo las ven los roles que supervisan el trabajo de campo:
   ROLES_METRICAS_CAMPO, abajo. Se agrega o se saca un rol de ese array y la
   columna aparece o desaparece; no hay nada más que tocar.

   >>> CADA ROL VE LO SUYO (2026-10-02) <<<
   El relevador entra desde "Mis relevamientos": arranca viendo solo sus
   cargas (un botón muestra las de todos). Los pendientes de control los ve
   quien tiene algún acto de control en la tabla del dominio, y cada uno solo
   los que puede resolver; Dirección los ve todos, para seguir la situación.
   ============================================================================ */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import PageHeader from '../components/ui/PageHeader';
import Grilla from '../components/ui/Grilla';
import Badge, { BadgeEstado } from '../components/ui/Badge';
import { Vacio } from '../components/ui/Aviso';
import AccionesLocal from '../components/AccionesLocal';
import { EnlaceFicha } from '../components/RutaProtegida';
import { useRol } from '../auth/rolContexto';
import { useDatos } from '../datos/datosContexto';
import { puedeEditar } from '../config/modulos';
import { ACCIONES } from '../dominio/reglas';
import { esTrabajoDe } from '../datos/vistas';
import { colorClasificacion, etiquetaClasificacion } from '../config/catalogos';
import { fmtFechaHora } from '../dominio/fechas';

/* Quiénes ven las métricas del trabajo de campo (coordenada del dispositivo y
   modo de carga). Coordinación controla cómo se releva; Dirección mide la
   cobertura territorial. Al resto le sobran. */
const ROLES_METRICAS_CAMPO = ['coordinacion', 'direccion', 'administrador'];

const ESTADOS_DE_CONTROL = ['REVISION_DATOS', 'EXENTO_REVISION'];

/* ¿Este rol tiene algo que hacer en el control? Sale de la tabla de actos: si
   mañana el administrativo confirma exenciones, aparece solo. */
function tieneActosDeControl(rol) {
  return ACCIONES.some(
    (a) => (rol === 'administrador' || a.roles.includes(rol)) && a.estados.some((e) => ESTADOS_DE_CONTROL.includes(e)),
  );
}

function Relevamiento() {
  const { rol, usuario } = useRol();
  const { relevamientos, localesConEstado, localPorId, permisos, usuarios } = useDatos();

  const veMetricasCampo = ROLES_METRICAS_CAMPO.includes(rol);

  // Quién soy en la tabla de usuarios (igual que en Entregas).
  const yo = usuario.id ? usuarios.find((u) => u.id === usuario.id) : usuarios.find((u) => u.nombre === usuario.nombre);
  const esMio = (r) => (yo ? r.idUsuario === yo.id : r.usuario === usuario.nombre);
  // El relevador arranca con lo suyo; el resto, con todo. El botón lo cambia.
  const [verTodosElegido, setVerTodos] = useState(null);
  const verTodos = verTodosElegido ?? rol !== 'relevador';

  const veControl = rol === 'direccion' || tieneActosDeControl(rol);
  const pendientes = veControl
    ? localesConEstado.filter((l) => ESTADOS_DE_CONTROL.includes(l.estado) && esTrabajoDe(l, rol))
    : [];

  const columnas = useMemo(
    () => [
      { field: 'id', headerName: 'N°', width: 70 },
      {
        field: 'nombreLocal',
        headerName: 'Local',
        flex: 1,
        minWidth: 180,
        valueGetter: (_v, row) => row.nombreLocal ?? localPorId(row.localId)?.nombreLocal ?? '',
        renderCell: ({ row }) => (
          <EnlaceFicha id={row.localId}>
            {row.nombreLocal ?? localPorId(row.localId)?.nombreLocal ?? `Local ${row.localId}`}
          </EnlaceFicha>
        ),
      },
      { field: 'direccionRelevada', headerName: 'Dirección relevada', flex: 1, minWidth: 190 },
      {
        field: 'rubro',
        headerName: 'Rubro',
        width: 150,
        valueGetter: (_v, row) => row.rubro ?? localPorId(row.localId)?.rubro ?? '',
      },
      {
        field: 'clasificacion',
        headerName: 'Clasificación',
        width: 165,
        renderCell: ({ value }) => <Badge color={colorClasificacion(value)}>{etiquetaClasificacion(value)}</Badge>,
      },
      { field: 'usuario', headerName: 'Relevado por', width: 160 },
      {
        field: 'fechaHora',
        headerName: 'Fecha y hora',
        width: 155,
        renderCell: ({ value }) => fmtFechaHora(value),
      },
      // Solo para los roles que supervisan campo (ver arriba).
      ...(veMetricasCampo
        ? [
            {
              field: 'coordenada',
              headerName: 'Coordenada del dispositivo',
              width: 210,
              valueGetter: (_v, row) => (row.latitud === null ? 'sin GPS' : `${row.latitud}, ${row.longitud}`),
              renderCell: ({ row }) =>
                row.latitud === null ? (
                  <span className="texto-gris" title="El dispositivo no tenía permiso de geolocalización">
                    sin GPS
                  </span>
                ) : (
                  <span title="Métrica de cobertura de campo. NO es la ubicación del local.">
                    {row.latitud}, {row.longitud}
                  </span>
                ),
            },
          ]
        : []),
      {
        field: 'control',
        headerName: 'Control',
        width: 175,
        valueGetter: (_v, row) => (row.revisadoEn ? 'controlado' : 'pendiente'),
        renderCell: ({ row }) =>
          row.revisadoEn ? (
            <span title={`Controlado el ${fmtFechaHora(row.revisadoEn)}`}>
              <Badge color="verde">Controlado</Badge>
            </span>
          ) : (
            <Badge color="amarillo">Pendiente</Badge>
          ),
      },
      ...(veMetricasCampo
        ? [
            {
              field: 'offline',
              headerName: 'Carga',
              width: 120,
              renderCell: ({ value }) =>
                value ? (
                  <span title="Se cargó sin conexión y se sincronizó después">
                    <Badge color="azul">Sin conexión</Badge>
                  </span>
                ) : (
                  <span className="texto-gris">en línea</span>
                ),
            },
          ]
        : []),
      {
        field: 'estadoLocal',
        headerName: 'Estado actual del local',
        width: 220,
        valueGetter: (_v, row) => localPorId(row.localId)?.estado ?? '',
        renderCell: ({ row }) => <BadgeEstado codigo={localPorId(row.localId)?.estado} sinColor />,
      },
    ],
    [localPorId, veMetricasCampo],
  );

  /* LA BÚSQUEDA ES LA DE LA GRILLA. Esta pantalla tenía su propio buscador
     encima de la tabla, que hacía lo mismo que el buscador rápido del Data
     Grid. Con los dos puestos, el resultado salía de combinarlos y no había
     forma de entender por qué faltaba una fila. */
  const filas = verTodos ? relevamientos : relevamientos.filter(esMio);

  const botonNuevo = puedeEditar(rol, 'relevar', permisos) && (
    <Link to="/campo/relevar" className="btn-icono btn-icono-verde" title="Nuevo relevamiento">
      <AddIcon fontSize="small" />
    </Link>
  );

  /* Las columnas necesitan la lista de relevamientos para mostrar quién
     clasificó cada local, así que se arman acá y no como constante del módulo. */
  const columnasPendientes = useMemo(
    () => [
      {
        field: 'nombreLocal',
        headerName: 'Local',
        flex: 1.2,
        minWidth: 200,
        renderCell: ({ row }) => {
          const rel = relevamientos.find((r) => r.localId === row.id);
          return (
            <span className="celda-apilada">
              <EnlaceFicha id={row.id}>{row.nombreLocal}</EnlaceFicha>
              <small className="celda-sub">{rel ? rel.usuario : 'sin relevamiento'}</small>
            </span>
          );
        },
      },
      { field: 'direccion', headerName: 'Dirección', flex: 1.2, minWidth: 180 },
      {
        field: 'clasifico',
        headerName: 'Clasificó',
        width: 180,
        valueGetter: (_v, row) => {
          const rel = relevamientos.find((r) => r.localId === row.id);
          return rel ? etiquetaClasificacion(rel.clasificacion) : '—';
        },
        renderCell: ({ row }) => {
          const rel = relevamientos.find((r) => r.localId === row.id);
          return rel ? (
            <Badge color={colorClasificacion(rel.clasificacion)}>{etiquetaClasificacion(rel.clasificacion)}</Badge>
          ) : (
            '—'
          );
        },
      },
      {
        field: 'estado',
        headerName: 'Estado',
        width: 210,
        renderCell: ({ row }) => <BadgeEstado codigo={row.estado} sinColor />,
      },
      {
        field: 'acciones',
        headerName: 'Acciones',
        width: 260,
        sortable: false,
        filterable: false,
        renderCell: ({ row }) => <AccionesLocal local={row} compacto />,
      },
    ],
    [relevamientos],
  );

  return (
    <>
      <PageHeader
        etiqueta="RELEVAMIENTOS"
        titulo="RELEVAMIENTO Y CONTROL"
        subtitulo={
          veControl
            ? `${relevamientos.length} relevamiento(s) cargados · ${pendientes.length} pendiente(s) de control`
            : `${filas.length} relevamiento(s) ${verTodos ? 'cargados' : 'tuyos'}`
        }
        botonVolver
        acciones={
          rol === 'relevador' && (
            <button type="button" className="btn-secundario" onClick={() => setVerTodos(!verTodos)}>
              {verTodos ? 'Ver solo los míos' : 'Ver los de todos'}
            </button>
          )
        }
      />

      {/* ================= PENDIENTES DE CONTROL =================
          Solo para quien controla: al relevador no le sirve una lista donde
          no puede hacer nada. */}
      {veControl && (
        <>
          <div className="accesos-header">
            <span>Pendientes de control de coordinación</span>
          </div>

          {pendientes.length === 0 ? (
            <Vacio titulo="Todo controlado">No hay relevamientos esperando el control administrativo.</Vacio>
          ) : (
            <Grilla
              filas={pendientes}
              columnas={columnasPendientes}
              nombreArchivo="relevamientos-pendientes"
              vacio="No hay relevamientos esperando control."
              alto="auto"
              botones={botonNuevo}
            />
          )}
        </>
      )}

      {/* ================= LISTADO COMPLETO ================= */}
      <Grilla
        filas={filas}
        columnas={columnas}
        nombreArchivo="relevamientos"
        vacio={verTodos ? 'Todavía no hay relevamientos cargados.' : 'Todavía no cargaste relevamientos.'}
        ordenInicial={[{ field: 'fechaHora', sort: 'desc' }]}
        botones={botonNuevo}
      />
    </>
  );
}

export default Relevamiento;
