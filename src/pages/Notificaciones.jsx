/* ============================================================================
   pages/Notificaciones.jsx  —  EMISIÓN DE CÉDULAS  (URL: /#/notificaciones)
   ----------------------------------------------------------------------------
   Sección 6.4 del pliego. Tres bloques:

     1. COLA DE EMISIÓN     locales habilitados sin cédula emitida
     2. CÉDULAS EMITIDAS    con su estado de impresión y de entrega
     3. HOJA DE RUTA        el recorrido del día. SOLO EN PAPEL: en pantalla
                            esas cédulas ya están en el bloque 2, así que la
                            tabla se dibuja oculta y aparece al imprimir.

   >>> DECISIÓN ABIERTA: CUÁNDO SE DISPARA LA EMISIÓN (sección 9.6) <<<
   Hoy el sistema viejo emite en automático todas las mañanas. Es ágil, pero al
   no mediar revisión humana cualquier dato errado se materializa igual en un
   documento emitido. Las dos alternativas en evaluación son:

     a) EMISIÓN MANUAL: coordinación revisa la cola y dispara la generación.
        Agrega un control previo, a costa de depender de que alguien lo haga.
     b) EMISIÓN AUTOMÁTICA CON VERIFICACIÓN POSTERIOR: se conserva el proceso
        diario y se puede consultar la cédula desde la ficha antes de imprimir.

   Esta pantalla está armada para la opción (a), que es la que pide el control
   previo, y el parámetro `emisionAutomatica` de Configuración muestra cómo
   quedaría con la (b). Cambiar de una a otra no requiere rehacer nada.

   REQUISITOS VÁLIDOS PARA LAS DOS OPCIONES, y los tres están acá:
     - la cédula se puede abrir y consultar desde la ficha del local;
     - cada notificación registra si ya fue impresa, con quién y cuándo;
     - la emisión NO altera ningún plazo: el cómputo arranca en la entrega.
   ============================================================================ */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import Grilla from '../components/ui/Grilla';
import Badge, { BadgeEstado } from '../components/ui/Badge';
import Aviso, { Vacio } from '../components/ui/Aviso';
import Confirmar from '../components/ui/Confirmar';
import AccionesLocal from '../components/AccionesLocal';
import VistaCedula from '../components/VistaCedula';
import { useDatos } from '../datos/datosContexto';
import { resultadoEntrega } from '../dominio/actuaciones';
import { faltantesRegistrales } from '../dominio/reglas';
import { fmtFecha, fmtFechaHora, hoyISO } from '../dominio/fechas';
import { ordenarPorProximidad } from '../dominio/geo';

/* Columnas de la COLA DE EMISIÓN (la primera tabla). Las de las cédulas ya
   emitidas se arman adentro del componente porque dependen de los datos.

   La columna de acciones es la que importa: desde acá se emite la cédula sin
   entrar a la ficha del local. */
const COLUMNAS_COLA = [
  {
    field: 'nombreLocal',
    headerName: 'Local',
    flex: 1.2,
    minWidth: 200,
    renderCell: ({ row }) => (
      <span className="celda-apilada">
        <Link to={`/locales/${row.id}`} className="link-local">
          {row.nombreLocal}
        </Link>
        <small className="celda-sub">{row.razonSocial || 'sin razón social'}</small>
      </span>
    ),
  },
  { field: 'direccion', headerName: 'Dirección', flex: 1.2, minWidth: 180 },
  {
    field: 'instancia',
    headerName: 'Instancia',
    width: 150,
    // Sale del estado, así que se calcula: sin valueGetter no se podría
    // ordenar ni filtrar por esta columna.
    valueGetter: (_v, row) => (row.estado.startsWith('NOTIF2') ? '2° notificación' : '1° notificación'),
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
];

function Notificaciones() {
  const { localesConEstado, cedulas, localPorId, generarCedula } = useDatos();

  const [soloSinImprimir, setSoloSinImprimir] = useState(false);
  const [viendo, setViendo] = useState(null);
  const [lote, setLote] = useState(false);

  const cola = localesConEstado.filter((l) => ['NOTIF1_PENDIENTE', 'NOTIF2_PENDIENTE'].includes(l.estado));
  const listos = cola.filter((l) => faltantesRegistrales(l).length === 0);
  const trabados = cola.filter((l) => faltantesRegistrales(l).length > 0);

  const emitidas = cedulas();

  /* La hoja de ruta: lo que está emitido, sin entregar y ordenado por
     proximidad. Es lo que se imprime y se le da al notificador. */
  const hojaDeRuta = useMemo(() => {
    const pendientes = emitidas
      .filter((c) => !c.resultado)
      .map((c) => ({ ...c, latitud: c.local?.latitud ?? null, longitud: c.local?.longitud ?? null }));
    return ordenarPorProximidad(pendientes);
  }, [emitidas]);

  const columnas = useMemo(
    () => [
      { field: 'numeroCedula', headerName: 'N° cédula', width: 130 },
      {
        field: 'local',
        headerName: 'Local',
        flex: 1,
        minWidth: 190,
        valueGetter: (_v, row) => row.local?.nombreLocal ?? '',
        renderCell: ({ row }) =>
          row.local ? (
            <Link to={`/locales/${row.local.id}`} className="link-local">
              {row.local.nombreLocal}
            </Link>
          ) : (
            '—'
          ),
      },
      {
        field: 'direccion',
        headerName: 'Dirección',
        flex: 1,
        minWidth: 170,
        valueGetter: (_v, row) => row.local?.direccion ?? '',
      },
      {
        field: 'instancia',
        headerName: 'Instancia',
        width: 100,
        valueFormatter: (value) => (value === 1 ? '1°' : '2°'),
      },
      { field: 'fecha', headerName: 'Emitida', width: 115, valueFormatter: (value) => fmtFecha(value) },
      {
        field: 'impresaEn',
        headerName: 'Impresión',
        width: 150,
        renderCell: ({ row }) =>
          row.impresaEn ? (
            <span title={`${row.impresaPor} · ${fmtFechaHora(row.impresaEn)}`}>
              <Badge color="verde">Impresa</Badge>
            </span>
          ) : (
            <Badge color="rojo">Sin imprimir</Badge>
          ),
      },
      {
        field: 'notificador',
        headerName: 'Notificador',
        width: 160,
        valueGetter: (_v, row) => row.notificador?.nombre ?? '',
        renderCell: ({ row }) =>
          row.notificador ? row.notificador.nombre : <Badge color="amarillo">Sin asignar</Badge>,
      },
      {
        field: 'resultado',
        headerName: 'Entrega',
        width: 205,
        renderCell: ({ row }) => {
          if (!row.resultado) return <Badge color="azul">Pendiente · el plazo no corre</Badge>;
          const r = resultadoEntrega(row.resultado);
          return <Badge color={r?.color ?? 'gris'}>{r?.etiqueta ?? row.resultado}</Badge>;
        },
      },
      {
        field: 'fechaVencimiento',
        headerName: 'Vence',
        width: 115,
        valueFormatter: (value) => (value ? fmtFecha(value) : '—'),
      },
      {
        field: 'ver',
        headerName: 'Cédula',
        width: 100,
        sortable: false,
        renderCell: ({ row }) => (
          <button type="button" className="btn-tabla" onClick={() => setViendo(row)}>
            Ver
          </button>
        ),
      },
    ],
    [],
  );

  /* LA BÚSQUEDA ES LA DE LA GRILLA. Esta pantalla tenía su propio buscador
     encima de la tabla, que hacía lo mismo que el buscador rápido del Data
     Grid. Con los dos puestos, el resultado salía de combinarlos y no había
     forma de entender por qué faltaba una fila. */
  /* El filtro de "solo sin imprimir" SÍ se queda: no es una búsqueda, es una
     vista distinta de la misma lista y no existe como columna. */
  const filas = useMemo(
    () => (soloSinImprimir ? emitidas.filter((c) => !c.impresaEn) : emitidas),
    [emitidas, soloSinImprimir],
  );

  return (
    <>
      <PageHeader
        etiqueta="NOTIFICACIONES"
        titulo="EMISIÓN DE CÉDULAS Y HOJA DE RUTA"
        subtitulo={`${cola.length} en cola de emisión · ${hojaDeRuta.length} emitidas sin entregar`}
        botonVolver
      />

      {/* ================= 1. COLA DE EMISIÓN ================= */}
      <div className="accesos-header">
      </div>

      {trabados.length > 0 && (
        <Aviso tipo="bloqueo" titulo={`${trabados.length} local(es) no se pueden emitir: faltan datos registrales`}>
          {trabados.map((l) => `${l.nombreLocal} (falta ${faltantesRegistrales(l).join(', ')})`).join(' · ')}. La cédula tiene que
          individualizar correctamente al sujeto obligado.
        </Aviso>
      )}

      {cola.length === 0 ? (
        <Vacio titulo="No hay nada para emitir">Cuando coordinación habilite un local, va a aparecer acá.</Vacio>
      ) : (
        <>
          {listos.length > 1 && (
            <div className="barra-lote">
              <button type="button" className="btn-primario" onClick={() => setLote(true)}>
                Generar las {listos.length} cédulas de la cola
              </button>
            </div>
          )}

          <Grilla
            filas={cola}
            columnas={COLUMNAS_COLA}
            nombreArchivo="cola-de-emision"
            vacio="No hay locales esperando cédula."
            alto="auto"
          />
        </>
      )}

      {/* ================= 2. CÉDULAS EMITIDAS ================= */}
      <div className="accesos-header">
    
      </div>

      <Grilla
        filas={filas}
        columnas={columnas}
        nombreArchivo="cedulas"
        vacio="Todavía no se emitió ninguna cédula."
        ordenInicial={[{ field: 'fecha', sort: 'desc' }]}
        botones={
          <button
            type="button"
            className={`btn-icono ${soloSinImprimir ? 'btn-icono-verde' : 'btn-icono-azul'}`}
            title={soloSinImprimir ? 'Ver todas' : 'Ver solo las que faltan imprimir'}
            onClick={() => setSoloSinImprimir((v) => !v)}
          >
            {soloSinImprimir ? '★' : '☆'}
          </button>
        }
      />

      {/* ================= 3. HOJA DE RUTA (solo en papel) ================= */}
      {/* En pantalla NO hay tercera tabla: las cédulas sin entregar ya están en
          la grilla de arriba, con "Pendiente · el plazo no corre" en la columna
          Entrega. Lo que sí existe es el documento que se le da al notificador:
          ordenado por proximidad y con Resultado y Firma vacíos para completar
          durante el recorrido. Va con .solo-papel, que lo oculta en pantalla y
          lo muestra al imprimir. Acá queda solo el botón. */}
      <div className="accesos-header">
        <span>Hoja de ruta del {fmtFecha(hoyISO())}</span>
      </div>

      {hojaDeRuta.length === 0 ? (
        <Vacio titulo="Nada para entregar">Todas las cédulas emitidas ya tienen resultado de entrega.</Vacio>
      ) : (
        <>
          <div className="barra-lote">
            <button type="button" className="btn-secundario" onClick={() => window.print()}>
              Imprimir hoja de ruta ({hojaDeRuta.length} cédulas)
            </button>
          </div>

          <table className="tabla-datos solo-papel">
            <thead>
              <tr>
                <th>#</th>
                <th>Cédula</th>
                <th>Local</th>
                <th>Dirección</th>
                <th>Notificador</th>
                <th>Resultado</th>
                <th>Firma</th>
              </tr>
            </thead>
            <tbody>
              {hojaDeRuta.map((c, i) => (
                <tr key={c.id}>
                  <td>{i + 1}</td>
                  <td>{c.numeroCedula}</td>
                  <td>{c.local?.nombreLocal}</td>
                  <td>
                    {c.local?.direccion}
                    {c.latitud === null && <small className="celda-sub">sin ubicación: ubicar a mano</small>}
                  </td>
                  <td>{c.notificador?.nombre ?? 'sin asignar'}</td>
                  {/* Estas dos van vacías a propósito: se completan en papel
                      durante el recorrido y después se cargan al sistema. */}
                  <td className="celda-papel" />
                  <td className="celda-papel" />
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* ---------- Emisión por lote ---------- */}
      <Confirmar
        abierto={lote}
        titulo="Generar las cédulas de la cola"
        textoConfirmar={`Generar ${listos.length} cédulas`}
        onCancelar={() => setLote(false)}
        onConfirmar={() => {
          // Una por una: cada emisión consume su número de la secuencia y deja
          // su propia entrada en la auditoría.
          listos.forEach((l) => generarCedula(l.id));
          setLote(false);
        }}
      >
        <p>
          Se van a emitir <strong>{listos.length} cédulas</strong> con números correlativos.
        </p>
        <p className="texto-chico">
          Ninguna hace correr plazos todavía: hay que asignar notificador y registrar la entrega. Revisá cada documento antes de
          imprimirlo.
        </p>
      </Confirmar>

      <VistaCedula
        abierto={Boolean(viendo)}
        cedula={viendo}
        local={viendo ? localPorId(viendo.localId) : null}
        onCerrar={() => setViendo(null)}
      />
    </>
  );
}

export default Notificaciones;
