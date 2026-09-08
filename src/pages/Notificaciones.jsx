/* ============================================================================
   pages/Notificaciones.jsx  —  EMISIÓN DE CÉDULAS  (URL: /#/notificaciones)
   ----------------------------------------------------------------------------
   Sección 6.4 del pliego. Tres bloques:

     1. COLA DE EMISIÓN     locales habilitados sin cédula emitida
     2. CÉDULAS EMITIDAS    con su estado de impresión y de entrega
     3. HOJA DE RUTA        el recorrido del día, imprimible

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

function Notificaciones() {
  const { localesConEstado, cedulas, localPorId, parametros, generarCedula } = useDatos();

  const [buscar, setBuscar] = useState('');
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

  const filas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return emitidas.filter((c) => {
      const enTexto =
        !q || [c.numeroCedula, c.local?.nombreLocal, c.local?.direccion].filter(Boolean).some((v) => v.toLowerCase().includes(q));
      const enImpresion = !soloSinImprimir || !c.impresaEn;
      return enTexto && enImpresion;
    });
  }, [emitidas, buscar, soloSinImprimir]);

  return (
    <>
      <PageHeader
        etiqueta="NOTIFICACIONES"
        titulo="EMISIÓN DE CÉDULAS Y HOJA DE RUTA"
        subtitulo={`${cola.length} en cola de emisión · ${hojaDeRuta.length} emitidas sin entregar`}
        botonVolver
      />

      <Aviso tipo="info" titulo={parametros.emisionAutomatica ? 'Emisión automática configurada' : 'Emisión manual con control previo'}>
        {parametros.emisionAutomatica
          ? 'El proceso diario genera todas las cédulas de la cola. Conviene revisar acá lo emitido antes de imprimir: un dato errado ya se materializó en un documento.'
          : 'Coordinación revisa la cola y dispara la generación. Conviene prever igual una ejecución automática de respaldo al final de la mañana, para que el circuito no se detenga si nadie la disparó; esa ejecución tiene que quedar identificada como tal en la auditoría.'}{' '}
        Se configura en Configuración → Parámetros (decisión pendiente, sección 9.6).
      </Aviso>

      {/* ================= 1. COLA DE EMISIÓN ================= */}
      <div className="accesos-header">
        <span>Cola de emisión ({cola.length})</span>
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
              <span className="texto-chico">
                Emisión por lote. Los {trabados.length} local(es) con datos incompletos quedan afuera.
              </span>
            </div>
          )}

          <table className="tabla-datos tabla-bandeja">
            <thead>
              <tr>
                <th>Local</th>
                <th>Dirección</th>
                <th>Instancia</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cola.map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link to={`/locales/${l.id}`} className="link-local">
                      {l.nombreLocal}
                    </Link>
                    <small className="celda-sub">{l.razonSocial || 'sin razón social'}</small>
                  </td>
                  <td>{l.direccion}</td>
                  <td>{l.estado.startsWith('NOTIF2') ? '2° notificación' : '1° notificación'}</td>
                  <td>
                    <BadgeEstado codigo={l.estado} />
                  </td>
                  <td>
                    <AccionesLocal local={l} compacto />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* ================= 2. CÉDULAS EMITIDAS ================= */}
      <div className="accesos-header">
        <span>Cédulas emitidas ({emitidas.length})</span>
      </div>

      <Grilla
        filas={filas}
        columnas={columnas}
        nombreArchivo="cedulas"
        vacio="Todavía no se emitió ninguna cédula."
        ordenInicial={[{ field: 'fecha', sort: 'desc' }]}
        buscadores={[{ placeholder: 'Buscar por N° de cédula, local o dirección...', valor: buscar, onChange: setBuscar }]}
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

      {/* ================= 3. HOJA DE RUTA ================= */}
      <div className="accesos-header">
        <span>Hoja de ruta del {fmtFecha(hoyISO())}</span>
      </div>

      {hojaDeRuta.length === 0 ? (
        <Vacio titulo="Nada para entregar">Todas las cédulas emitidas ya tienen resultado de entrega.</Vacio>
      ) : (
        <>
          <div className="barra-lote">
            <button type="button" className="btn-secundario" onClick={() => window.print()}>
              Imprimir hoja de ruta
            </button>
            <span className="texto-chico">
              Ordenada por proximidad geográfica, no por nombre de calle: el recorrido real es más corto.
            </span>
          </div>

          <table className="tabla-datos solo-impresion">
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
