import { useMemo } from 'react';
/* ============================================================================
   pages/Prorrogas.jsx  —  PRÓRROGAS  (URL: /#/prorrogas)
   ----------------------------------------------------------------------------
   Etapa 5 del circuito. Agotadas las dos notificaciones, y ANTES de que se
   genere el expediente, el titular puede pedir una prórroga.

   TRES REGLAS QUE SE VEN EN ESTA PANTALLA

   1. NO SE PUEDE OTORGAR EN CUALQUIER MOMENTO. Solo con las dos notificaciones
      agotadas y antes de que exista expediente. Por eso el bloque "se les puede
      otorgar" no lista todo el padrón: lista los locales cuyo estado lo habilita
      (la regla está en dominio/reglas.js, no acá).

   2. LOS DÍAS SE CARGAN A MANO Y NO TIENEN VALOR POR DEFECTO. Es el único plazo
      del sistema que no es fijo: los de notificación son 5 y 3 días hábiles y
      los define la Dirección.

   3. MIENTRAS ESTÁ VIGENTE, EL LOCAL NO APARECE EN LA BANDEJA DE EXPEDIENTES.
      Al vencer sin presentación, pasa a generación de expediente al día
      siguiente del vencimiento.

   PENDIENTE con el área legal (Anexo B.2): si hay un tope de días y una
   cantidad máxima de prórrogas por local. Está resuelto con dos parámetros de
   Configuración, hoy en 30 días y 1 prórroga.

   LOS PEDIDOS DEL PORTAL (2026-10-02): si el titular pidió la prórroga desde
   su portal, el local aparece primero en "pueden recibir una prórroga", con
   lo que pidió. Al otorgarla, el formulario arranca con esos días y motivo.
   ============================================================================ */

import { Link } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import Grilla from '../components/ui/Grilla';
import Badge, { BadgeEstado } from '../components/ui/Badge';
import Aviso, { Vacio } from '../components/ui/Aviso';
import AccionesLocal from '../components/AccionesLocal';
import { useDatos } from '../datos/datosContexto';
import { useRol } from '../auth/rolContexto';
import { puedeVerRuta } from '../config/modulos';
import { diasEntre, fmtFecha, fmtFechaHora, hoyISO } from '../dominio/fechas';
import { estaVigente } from '../dominio/vigencias';

function Prorrogas() {
  const { actuaciones, localesConEstado, localPorId, permisos } = useDatos();
  const { rol } = useRol();

  const otorgadas = actuaciones
    .filter((a) => a.tipo === 'PRORROGA')
    .map((a) => ({ ...a, local: localPorId(a.localId), vigente: estaVigente(a.fechaVencimiento) }))
    .reverse();

  const vigentes = otorgadas.filter((p) => p.vigente);

  // Los que la regla habilita. No se calcula acá: se pregunta por el estado.
  // Primero los que lo pidieron por el portal: son los que esperan respuesta.
  const habilitados = localesConEstado
    .filter((l) => ['NOTIF2_ENTREGADA', 'NOTIF2_SIN_FIRMA', 'NOTIF2_FIJADA', 'GENERAR_EXPEDIENTE'].includes(l.estado))
    .sort((a, b) => Number(Boolean(b.solicitudProrroga)) - Number(Boolean(a.solicitudProrroga)));
  const pedidos = habilitados.filter((l) => l.solicitudProrroga);

  /* Las prórrogas ya otorgadas. Cada fila es una PRÓRROGA y trae su local
     adentro (row.local), que es lo que arma la pantalla antes de dibujar. */
  const columnasOtorgadas = useMemo(
    () => [
      {
        field: 'local',
        headerName: 'Local',
        flex: 1,
        minWidth: 180,
        valueGetter: (_v, row) => row.local?.nombreLocal ?? `Local ${row.localId}`,
        renderCell: ({ row }) => (
          <Link to={`/locales/${row.localId}`} className="link-local">
            {row.local?.nombreLocal ?? `Local ${row.localId}`}
          </Link>
        ),
      },
      { field: 'fecha', headerName: 'Otorgada', width: 120, renderCell: ({ row }) => fmtFecha(row.fecha) },
      { field: 'diasOtorgados', headerName: 'Días', width: 80 },
      {
        field: 'fechaVencimiento',
        headerName: 'Vence',
        width: 120,
        renderCell: ({ row }) => fmtFecha(row.fechaVencimiento),
      },
      {
        field: 'situacion',
        headerName: 'Situación',
        width: 270,
        valueGetter: (_v, row) =>
          row.vigente ? 'Vigente' : row.local?.estadoGrupo === 'documental' ? 'Presentó' : 'Venció sin presentación',
        renderCell: ({ row }) =>
          row.vigente ? (
            /* Cuando esto llegue a 0, el local cae solo en la bandeja de
               expedientes: no hay que hacer nada para que pase. */
            <Badge color="amarillo">Vigente · restan {diasEntre(hoyISO(), row.fechaVencimiento)} día(s)</Badge>
          ) : row.local?.estadoGrupo === 'documental' ? (
            /* Terminó con documentación vigente: presentó durante la prórroga
               y salió del circuito. */
            <Badge color="verde">Presentó durante la prórroga</Badge>
          ) : (
            <Badge color="naranja">Venció sin presentación</Badge>
          ),
      },
      {
        field: 'estadoLocal',
        headerName: 'Estado actual del local',
        width: 210,
        valueGetter: (_v, row) => row.local?.estado ?? '',
        /* La consecuencia, a la vista: el que venció sin presentar ya figura
           para generar expediente. */
        renderCell: ({ row }) => <BadgeEstado codigo={row.local?.estado} sinColor />,
      },
      { field: 'motivo', headerName: 'Motivo', flex: 1, minWidth: 200 },
      { field: 'usuario', headerName: 'Otorgó', width: 150 },
    ],
    [],
  );

  /* Los locales en condiciones de recibir una prórroga. */
  const columnasHabilitados = useMemo(
    () => [
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
      { field: 'direccion', headerName: 'Dirección', flex: 1.2, minWidth: 180 },
      {
        field: 'estado',
        headerName: 'Estado',
        width: 210,
        renderCell: ({ row }) => <BadgeEstado codigo={row.estado} sinColor />,
      },
      {
        field: 'pedido',
        headerName: 'Pedido del titular',
        flex: 1,
        minWidth: 200,
        valueGetter: (_v, row) => row.solicitudProrroga?.motivo ?? '',
        renderCell: ({ row }) =>
          row.solicitudProrroga ? (
            <span className="celda-apilada">
              {row.solicitudProrroga.dias ? `${row.solicitudProrroga.dias} día(s)` : 'Sin días indicados'}
              <small className="celda-sub" title={row.solicitudProrroga.motivo}>
                {fmtFechaHora(row.solicitudProrroga.momento)} · {row.solicitudProrroga.motivo}
              </small>
            </span>
          ) : (
            <span className="texto-gris">—</span>
          ),
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
    [],
  );

  return (
    <>
      <PageHeader
        etiqueta="PRÓRROGAS"
        titulo="PRÓRROGAS OTORGADAS"
        subtitulo={`${vigentes.length} vigente(s) de ${otorgadas.length} otorgada(s) en total`}
        botonVolver
      />

      {/* Sin cuerpo: el título ya dice la regla, y el botón lleva a la bandeja
          del tablero donde el local va a aparecer cuando venza. */}
      <Aviso
        tipo="alerta"
        titulo="Si vence sin presentación, el local pasa solo a generación de expediente"
        accion={puedeVerRuta(rol, '/expedientes', permisos) && <Link to="/expedientes">Expedientes para generar</Link>}
      />

      {pedidos.length > 0 && (
        <Aviso tipo="info" titulo={`${pedidos.length} pedido(s) de prórroga del portal esperando respuesta`} />
      )}

      {/* ================= OTORGADAS ================= */}
      {/* Vigentes y vencidas en UNA tabla, de la más reciente a la más vieja.
          Antes eran dos tablas con casi las mismas columnas, y la situación de
          la prórroga era el título de cada una. Ahora es una columna: la fila
          dice sola si sigue suspendiendo el circuito o cómo terminó, y la
          pantalla tiene una tabla menos que recorrer. */}
      <div className="accesos-header">
        <span>Prórrogas otorgadas ({otorgadas.length})</span>
      </div>

      {otorgadas.length === 0 ? (
        <Vacio titulo="Todavía no se otorgó ninguna prórroga">No hay locales con el circuito sancionatorio suspendido.</Vacio>
      ) : (
        <Grilla
          filas={otorgadas}
          columnas={columnasOtorgadas}
          nombreArchivo="prorrogas-otorgadas"
          vacio="Todavía no se otorgó ninguna prórroga."
          alto="auto"
        />
      )}

      {/* ================= A QUIÉNES SE LES PUEDE OTORGAR ================= */}
      <div className="accesos-header">
        <span>Locales que pueden recibir una prórroga</span>
      </div>

      {habilitados.length === 0 ? (
        <Vacio titulo="Ningún local está en condiciones">
          La prórroga solo se puede otorgar con las dos notificaciones agotadas y antes de que exista expediente.
        </Vacio>
      ) : (
        <Grilla
          filas={habilitados}
          columnas={columnasHabilitados}
          nombreArchivo="locales-para-prorroga"
          vacio="No hay locales en condiciones de recibir una prórroga."
          alto="auto"
        />
      )}
    </>
  );
}

export default Prorrogas;
