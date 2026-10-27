/* ============================================================================
   pages/Tablero.jsx  —  TABLERO DE CONTROL  (URL: /#/tablero)
   ----------------------------------------------------------------------------
   Sección 6.1 del pliego. Es la pantalla de trabajo diario: cada bandeja
   agrupa los locales que requieren UNA acción determinada, y la acción se
   ejecuta sin salir de la vista.

   LA IDEA DE FONDO: el trabajo se organiza por bandeja, no buscando en el
   padrón. Alguien que entra a la mañana tiene que ver "hay 4 cédulas para
   emitir" y emitirlas ahí mismo.

   >>> LAS BANDEJAS NO ESTÁN DEFINIDAS ACÁ <<<
   Salen de DEFINICION_BANDEJAS en datos/vistas.js, donde cada bandeja declara
   qué estados agrupa y qué roles la ven. Los botones de cada fila salen de
   AccionesLocal, que a su vez los saca de la tabla ACCIONES del dominio.
   Resultado: no existe forma de que el tablero ofrezca una acción que la ficha
   del local no ofrezca, ni al revés.

   >>> EL ORDEN DE LAS BANDEJAS LO ELIGE EL USUARIO <<<
   POR PRIORIDAD (por defecto): primero lo que frena el circuito, después lo
   que hay que emitir, al final lo informativo. El número de cada bandeja está
   en su `prioridad` (datos/vistas.js): si el área quiere otro orden se cambian
   esos números, no esta pantalla.
   POR CANTIDAD: primero la bandeja con más locales esperando, para atacar el
   montón grande. Las vacías caen solas al final.
   La elección queda guardada en el navegador: nadie tiene que volver a
   elegirla cada mañana.

   ADEMÁS DE LAS BANDEJAS HAY TRES AVISOS QUE NO SON BANDEJAS. Van arriba,
   con solo el título y (si corresponde) un botón para ir a resolverlo:
     - presentaciones del portal esperando validación: mientras no se
       aprueben no suspenden ningún plazo. El botón lleva a Validaciones.
     - documentación por vencer: cuando caduque, el local reingresa solo al
       circuito. Es la oportunidad de avisarle al titular antes de intimarlo.
     - cédulas emitidas sin entregar: una cédula generada no hace correr el
       plazo hasta la entrega efectiva. El botón lleva a la cola de emisión.
   ============================================================================ */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import Badge, { BadgeEstado } from '../components/ui/Badge';
import Aviso, { Vacio } from '../components/ui/Aviso';
import AccionesLocal from '../components/AccionesLocal';
import Grilla, { anchoDeColumnas } from '../components/ui/Grilla';
import { useRol } from '../auth/rolContexto';
import { useDatos } from '../datos/datosContexto';
import { ORDENES_BANDEJA } from '../datos/vistas';
import { fmtFecha } from '../dominio/fechas';

/* La preferencia de orden vive en el navegador, igual que el resto de la
   maqueta (ver CLAVE_ALMACEN en datos/DatosProvider.jsx). Si el navegador
   bloquea el almacenamiento, se cae al orden por prioridad y no pasa nada. */
const CLAVE_ORDEN = 'gg-tablero-orden';

/* Las tablas van sin colores (pedido del área, 2026-10-01): la leyenda de
   colores ya no describe nada de la pantalla. Queda apagada, no borrada. */
const MOSTRAR_LEYENDA_COLORES = false;

function ordenGuardado() {
  try {
    const guardado = localStorage.getItem(CLAVE_ORDEN);
    return ORDENES_BANDEJA.some((o) => o.id === guardado) ? guardado : 'prioridad';
  } catch {
    return 'prioridad';
  }
}

/* Las columnas de la tabla de una bandeja. Van fuera del componente porque son
   las mismas para todas: definirlas adentro crearía un array nuevo en cada
   render y la grilla se redibujaría sin motivo.

   La última es ACCIONES, que es la razón de ser del tablero: la idea del pliego
   es resolver desde acá sin entrar a la ficha. Por eso es la más ancha. */
const COLUMNAS_BANDEJA = [
  {
    field: 'nombreLocal',
    headerName: 'Local',
    flex: 1.2,
    minWidth: 200,
    renderCell: ({ row }) => (
      <span className="celda-apilada">
        {/* Todo local es clickeable hacia su ficha: es donde está el historial
            completo y el contexto de la decisión. */}
        <Link to={`/locales/${row.id}`} className="link-local">
          {row.nombreLocal}
        </Link>
        <small className="celda-sub">{row.razonSocial || 'sin razón social'}</small>
      </span>
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
    field: 'plazo',
    headerName: 'Plazo',
    width: 150,
    // El orden tiene que ser por la fecha real, no por el texto que se muestra.
    valueGetter: (_v, row) => row.plazo?.vencimiento ?? '',
    renderCell: ({ row }) =>
      row.plazo ? (
        <span className={`celda-apilada ${row.plazo.vencido ? 'texto-vencido' : ''}`}>
          {fmtFecha(row.plazo.vencimiento)}
          <small className="celda-sub">{row.plazo.vencido ? 'vencido' : `en ${row.diasRestantes} día(s)`}</small>
        </span>
      ) : (
        <span className="texto-gris">sin plazo en curso</span>
      ),
  },
  {
    field: 'acciones',
    headerName: 'Acciones',
    width: 260,
    sortable: false,
    filterable: false,
    // conPadron: también "Editar datos" y "Dar de baja", sin salir del tablero.
    renderCell: ({ row }) => <AccionesLocal local={row} compacto conPadron />,
  },
];

/* La tarjeta de la bandeja mide lo mismo que la tabla que contiene. Sin esto,
   el encabezado de color ocupaba todo el ancho de la página y la tabla entraba
   apenas en la mitad: quedaba un bloque azul vacío a la derecha. */
const ANCHO_BANDEJA = anchoDeColumnas(COLUMNAS_BANDEJA);

function Bandeja({ bandeja }) {
  // Todas arrancan cerradas: el tablero se lee por los contadores de cada
  // bandeja y se abre solo la que se va a trabajar. Antes se abrían todas las
  // que tenían algo y la página era una tabla detrás de otra.
  const [abierta, setAbierta] = useState(false);

  return (
    <section className="bandeja" style={{ maxWidth: ANCHO_BANDEJA }}>
      <button type="button" className="bandeja-cabecera" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta}>
        <span className={`bandeja-contador bandeja-contador-${bandeja.color}`}>{bandeja.locales.length}</span>
        <span className="bandeja-titulo">
          <strong>{bandeja.titulo}</strong>
          <small>{bandeja.descripcion}</small>
        </span>
        <span className="bandeja-flecha">{abierta ? '▲' : '▼'}</span>
      </button>

      {abierta && (
        <div className="bandeja-cuerpo">
          {bandeja.locales.length === 0 ? (
            <p className="bandeja-vacia">Nada pendiente en esta bandeja.</p>
          ) : (
            <Grilla
              filas={bandeja.locales}
              columnas={COLUMNAS_BANDEJA}
              nombreArchivo={`bandeja-${bandeja.id}`}
              tituloImpresion={bandeja.titulo}
              vacio="Nada pendiente en esta bandeja."
              alto="auto"
            />
          )}
        </div>
      )}
    </section>
  );
}

function Tablero() {
  const { rol, usuario } = useRol();
  const { bandejasPara, documentosPorVencer, presentacionesPendientes, localesConEstado, usuarios } = useDatos();
  const yo = usuario.id ? usuarios.find((u) => u.id === usuario.id) : usuarios.find((u) => u.nombre === usuario.nombre);
  // Dirección mira, no actúa: para ella el tablero es la situación del área.
  const soloLectura = rol === 'direccion';

  const [orden, setOrden] = useState(ordenGuardado);

  // Igual que el Inicio: cada bandeja trae solo lo que este usuario puede
  // resolver, así los dos cuentan lo mismo y no hay filas sin botones.
  const bandejas = bandejasPara(rol, orden, { soloTrabajo: true, idUsuario: yo?.id ?? null });
  const docsVencen = documentosPorVencer(30);
  const pendientesValidar = presentacionesPendientes();
  const sinImprimir = localesConEstado.filter((l) => l.estado.endsWith('_GENERADA'));

  const total = bandejas.reduce((n, b) => n + b.locales.length, 0);

  function cambiarOrden(nuevo) {
    setOrden(nuevo);
    try {
      localStorage.setItem(CLAVE_ORDEN, nuevo);
    } catch {
      /* Sin almacenamiento el orden vale solo para esta visita. */
    }
  }

  return (
    <>
      <PageHeader
        etiqueta="TABLERO"
        titulo="BANDEJAS DE TRABAJO"
        subtitulo={
          soloLectura
            ? `Situación del área: ${total} caso(s) en las bandejas.`
            : total === 0
              ? 'No hay nada pendiente en tus bandejas.'
              : `${total} local(es) esperando una acción tuya.`
        }
        botonVolver
      />
      {MOSTRAR_LEYENDA_COLORES && (
        <div className="leyenda">
          <span>
            <Badge color="naranja">Naranja</Badge> hay que hacer algo
          </span>
          <span>
            <Badge color="azul">Azul</Badge> acto iniciado, el plazo no corre
          </span>
          <span>
            <Badge color="verde">Verde</Badge> cumple o quedó fuera del circuito
          </span>
          <span>
            <Badge color="amarillo">Amarillo</Badge> en espera (revisión o prórroga)
          </span>
          <span>
            <Badge color="rojo">Rojo</Badge> detenido o sancionatorio
          </span>
        </div>
      )}

      {/* ---------- Avisos que no son bandejas ---------- */}
      {pendientesValidar.length > 0 && (
        <Aviso
          tipo="alerta"
          titulo={`${pendientesValidar.length} presentación(es) del portal esperando validación`}
          accion={<Link to="/validaciones">Ir a validar</Link>}
        />
      )}

      {docsVencen.length > 0 && (
        <Aviso tipo="info" titulo={`${docsVencen.length} documento(s) vencen en los próximos 30 días`} />
      )}

      {sinImprimir.length > 0 && (
        <Aviso
          tipo="info"
          titulo="Hay cédulas emitidas sin entregar"
          accion={<Link to="/notificaciones">Ver la cola</Link>}
        />
      )}

      {/* ---------- Las bandejas ---------- */}
      <div className="accesos-header accesos-header-accion">
        {/* El selector solo tiene sentido si hay más de una bandeja que ordenar. */}
        {bandejas.length > 1 && (
          <div className="selector-orden" role="radiogroup" aria-label="Ordenar las bandejas">
            {/* Dos botones tipo pastilla en vez de un desplegable: las opciones son
                solo dos y así se ve de un vistazo cuál está activa, sin abrir nada.
                Cada una lleva un ícono chico que dice de qué se trata el orden. */}
            <span className="selector-orden-rotulo"></span>
            {ORDENES_BANDEJA.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={orden === o.id}
                className={`selector-orden-opcion${orden === o.id ? ' activa' : ''}`}
                onClick={() => cambiarOrden(o.id)}
              >
                <span className="selector-orden-icono" aria-hidden="true">
                  {o.id === 'prioridad' ? '⚑' : '≡'}
                </span>
                {o.etiqueta}
              </button>
            ))}
          </div>
        )}
      </div>

      {bandejas.length === 0 ? (
        <Vacio titulo="Tu rol no tiene bandejas asignadas">
          El tablero organiza el trabajo administrativo. Si sos relevador o notificador, tu pantalla es la de campo.
        </Vacio>
      ) : (
        bandejas.map((b) => <Bandeja key={b.id} bandeja={b} />)
      )}
    </>
  );
}

export default Tablero;
