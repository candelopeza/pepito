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
   ============================================================================ */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import PageHeader from '../components/ui/PageHeader';
import Grilla from '../components/ui/Grilla';
import Badge, { BadgeEstado } from '../components/ui/Badge';
import { Vacio } from '../components/ui/Aviso';
import AccionesLocal from '../components/AccionesLocal';
import { useRol } from '../auth/rolContexto';
import { useDatos } from '../datos/datosContexto';
import { puedeEditar } from '../config/modulos';
import { colorClasificacion, etiquetaClasificacion } from '../config/catalogos';
import { fmtFechaHora } from '../dominio/fechas';

/* Quiénes ven las métricas del trabajo de campo (coordenada del dispositivo y
   modo de carga). Coordinación controla cómo se releva; Dirección mide la
   cobertura territorial. Al resto le sobran. */
const ROLES_METRICAS_CAMPO = ['coordinacion', 'direccion'];

function Relevamiento() {
  const { rol } = useRol();
  const { relevamientos, localesConEstado, localPorId } = useDatos();

  const veMetricasCampo = ROLES_METRICAS_CAMPO.includes(rol);

  const pendientes = localesConEstado.filter((l) => ['REVISION_DATOS', 'EXENTO_REVISION'].includes(l.estado));

  const columnas = useMemo(
    () => [
      { field: 'id', headerName: 'N°', width: 70 },
      {
        field: 'nombreLocal',
        headerName: 'Local',
        flex: 1,
        minWidth: 180,
        renderCell: ({ row }) => (
          <Link to={`/locales/${row.localId}`} className="link-local">
            {row.nombreLocal}
          </Link>
        ),
      },
      { field: 'direccionRelevada', headerName: 'Dirección relevada', flex: 1, minWidth: 190 },
      { field: 'rubro', headerName: 'Rubro', width: 150 },
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
        valueGetter: (_v, row) => (row.revisadoEn ? row.resultadoRevision : 'pendiente'),
        renderCell: ({ row }) =>
          row.revisadoEn ? (
            <span title={`${row.revisadoPor} · ${fmtFechaHora(row.revisadoEn)}`}>
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
        renderCell: ({ row }) => <BadgeEstado codigo={localPorId(row.localId)?.estado} />,
      },
    ],
    [localPorId, veMetricasCampo],
  );

  /* LA BÚSQUEDA ES LA DE LA GRILLA. Esta pantalla tenía su propio buscador
     encima de la tabla, que hacía lo mismo que el buscador rápido del Data
     Grid. Con los dos puestos, el resultado salía de combinarlos y no había
     forma de entender por qué faltaba una fila. */
  const filas = relevamientos;

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
              <Link to={`/locales/${row.id}`} className="link-local">
                {row.nombreLocal}
              </Link>
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
        renderCell: ({ row }) => <BadgeEstado codigo={row.estado} />,
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
        subtitulo={`${relevamientos.length} relevamiento(s) cargados · ${pendientes.length} pendiente(s) de control`}
        botonVolver
      />

      {/* ================= PENDIENTES DE CONTROL ================= */}
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
          botones={
            puedeEditar(rol, 'relevar') && (
              <Link to="/campo/relevar" className="btn-icono btn-icono-verde" title="Nuevo relevamiento">
                <AddIcon fontSize="small" />
              </Link>
            )
          }
        />
      )}

      {/* ================= LISTADO COMPLETO ================= */}
      <Grilla
        filas={filas}
        columnas={columnas}
        nombreArchivo="relevamientos"
        vacio="Todavía no hay relevamientos cargados."
        ordenInicial={[{ field: 'fechaHora', sort: 'desc' }]}
      />
    </>
  );
}

export default Relevamiento;
