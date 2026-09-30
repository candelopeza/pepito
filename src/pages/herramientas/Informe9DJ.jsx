/* ============================================================================
   pages/herramientas/Informe9DJ.jsx  —  (URL: /#/herramientas/informe-9dj)
   ----------------------------------------------------------------------------
   Sección 9.3 del pliego. La empresa 9 de Julio, prestataria del servicio de
   recolección, remite periódicamente el listado de locales con los que
   mantiene contrato.

   >>> ESTA PANTALLA REEMPLAZA UNA AUTOMATIZACIÓN A PROPÓSITO <<<
   El sistema viejo procesa ese listado solo: lo lee de una casilla de correo,
   lo extrae con OCR cuando llega en PDF, y cruza los registros por CUIT y
   similitud de direcciones. Ese proceso CREA LOCALES y CAMBIA ESTADOS sin
   intervención humana.

   El listado no es lo suficientemente extenso como para justificar una
   automatización que introduce errores de coincidencia difíciles de detectar:
   un cruce equivocado altera el estado legal de un local, y nadie se entera.
   La recomendación del área es carga manual asistida, y es lo que hay acá:
   el sistema muestra la PREVISUALIZACIÓN de los cambios que produciría —altas,
   actualizaciones y coincidencias dudosas— y un agente confirma antes de
   aplicar. Conserva la eficiencia y elimina el riesgo.

   POR QUÉ EL CONTRATO INFORMADO TIENE ESTADO PROPIO (CONTRATO_9DJ, sección
   4.6): su vigencia no se acredita con un documento cargado en el sistema sino
   con la información periódica que remite la empresa, así que solo puede
   modificarse por esa misma vía. Ante una impugnación el valor probatorio es
   distinto del de un contrato presentado por el titular.
   ============================================================================ */

import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Grilla from '../../components/ui/Grilla';
import Badge from '../../components/ui/Badge';
import Aviso, { Vacio } from '../../components/ui/Aviso';
import Confirmar from '../../components/ui/Confirmar';
import { useDatos } from '../../datos/datosContexto';
import { INFORME_9DJ_EJEMPLO } from '../../datos/semilla';
import { normalizarCuit, similitud } from '../../dominio/duplicados';
import { fmtFecha } from '../../dominio/fechas';

function Informe9DJ() {
  const { localesConEstado, aplicarInforme9DJ } = useDatos();

  const [cargado, setCargado] = useState(false);
  const [excluidas, setExcluidas] = useState([]);
  const [confirmar, setConfirmar] = useState(false);

  /* La previsualización: qué haría cada fila del informe. Es el corazón de la
     pantalla. Se decide por CUIT normalizado (el criterio fuerte) y, si no
     coincide, se avisa el parecido de razón social para que la persona mire. */
  const analisis = useMemo(() => {
    if (!cargado) return [];

    return INFORME_9DJ_EJEMPLO.map((fila, i) => {
      const cuitFila = normalizarCuit(fila.cuit);
      const porCuit = localesConEstado.find((l) => cuitFila && normalizarCuit(l.cuit) === cuitFila);

      if (porCuit) {
        return {
          ...fila,
          indice: i,
          localId: porCuit.id,
          local: porCuit,
          accion: 'actualiza',
          detalle: `Se le registra el contrato al local N° ${porCuit.id}.`,
        };
      }

      // Sin coincidencia exacta: se busca el parecido más alto por razón
      // social. Si es alto pero el CUIT no coincide, es justo el caso dudoso
      // que la automatización resolvía mal y en silencio.
      const candidatos = localesConEstado
        .map((l) => ({ local: l, parecido: similitud(l.razonSocial || l.nombreLocal, fila.razonSocial) }))
        .filter((c) => c.parecido >= 0.5)
        .sort((a, b) => b.parecido - a.parecido);

      if (candidatos.length) {
        return {
          ...fila,
          indice: i,
          localId: null,
          local: candidatos[0].local,
          accion: 'dudosa',
          detalle: `Se parece a "${candidatos[0].local.nombreLocal}" (N° ${candidatos[0].local.id}) pero el CUIT no coincide. Revisá antes de aplicar.`,
        };
      }

      return {
        ...fila,
        indice: i,
        localId: null,
        local: null,
        accion: 'alta',
        detalle: 'No está en el padrón: se crea un local nuevo con prefijo CON en el id legacy.',
      };
    });
  }, [cargado, localesConEstado]);

  const aAplicar = analisis.filter((a) => !excluidas.includes(a.indice));
  const dudosas = analisis.filter((a) => a.accion === 'dudosa');

  /* Va memorizada porque las columnas de la grilla dependen de ella: si
     cambiara de identidad en cada render, las columnas se rearmarían solas. */
  const alternar = useCallback(
    (indice) =>
      setExcluidas((prev) => (prev.includes(indice) ? prev.filter((x) => x !== indice) : [...prev, indice])),
    [],
  );

  /* Las filas del informe ya analizadas. La columna "Aplicar" mantiene el
     checkbox propio en vez de usar la selección del Data Grid: acá lo
     seleccionado no es una selección temporal, es la decisión de qué filas se
     van a aplicar, y viene marcada por defecto. */
  const columnasAnalisis = useMemo(
    () => [
      {
        field: 'aplicar',
        headerName: 'Aplicar',
        width: 90,
        sortable: false,
        filterable: false,
        valueGetter: (_v, row) => (excluidas.includes(row.indice) ? 'No' : 'Sí'),
        renderCell: ({ row }) => (
          <input
            type="checkbox"
            checked={!excluidas.includes(row.indice)}
            onChange={() => alternar(row.indice)}
            aria-label={`Aplicar la fila de ${row.razonSocial}`}
          />
        ),
      },
      { field: 'cuit', headerName: 'CUIT informado', width: 150 },
      { field: 'razonSocial', headerName: 'Razón social', flex: 1, minWidth: 200 },
      { field: 'direccion', headerName: 'Dirección', flex: 1, minWidth: 180 },
      { field: 'numeroContrato', headerName: 'Contrato', width: 150 },
      {
        field: 'vencimiento',
        headerName: 'Vence',
        width: 120,
        renderCell: ({ row }) => fmtFecha(row.vencimiento),
      },
      {
        field: 'accion',
        headerName: 'Qué haría',
        flex: 1.2,
        minWidth: 260,
        renderCell: ({ row }) => (
          <span className="celda-apilada">
            <span>
              {row.accion === 'alta' && <Badge color="azul">Alta de local</Badge>}
              {row.accion === 'actualiza' && <Badge color="verde">Actualiza existente</Badge>}
              {row.accion === 'dudosa' && <Badge color="naranja">Coincidencia dudosa</Badge>}
            </span>
            <small className="celda-sub">{row.detalle}</small>
            {row.local && (
              <small className="celda-sub">
                <Link to={`/locales/${row.local.id}`} className="link-local">
                  Ver el local
                </Link>
              </small>
            )}
          </span>
        ),
      },
    ],
    [excluidas, alternar],
  );

  return (
    <>
      <PageHeader etiqueta="HERRAMIENTAS" titulo="INFORME DE 9 DE JULIO" botonVolver />

      {!cargado ? (
        <>
          {/* MAQUETA: no hay lectura real de archivo. Cuando exista, acá va un
              <input type="file"> que acepte el CSV o el XLSX que manda la
              empresa, y el resto de la pantalla no cambia. */}
          <div className="zona-carga">
            <strong>Cargar el listado que remitió la empresa</strong>
            <p>
              Maqueta: el botón carga un informe de ejemplo con cuatro filas, armado para mostrar los tres casos posibles (alta,
              actualización y coincidencia dudosa).
            </p>
            <button type="button" className="btn-primario" onClick={() => setCargado(true)}>
              Cargar informe de ejemplo
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="accesos-header">
            <span>Previsualización de los cambios ({analisis.length} filas)</span>
          </div>

          {dudosas.length > 0 && (
            <Aviso tipo="alerta" titulo={`${dudosas.length} coincidencia(s) dudosa(s)`}>
              El nombre se parece pero el CUIT no coincide. Si aplicás sin revisar, podés crear un duplicado o registrarle un
              contrato al local equivocado. Destildá las que no quieras aplicar.
            </Aviso>
          )}

          <Grilla
            filas={analisis}
            columnas={columnasAnalisis}
            idFila={(fila) => fila.indice}
            nombreArchivo="informe-9-de-julio"
            vacio="El archivo no trajo ninguna fila."
            alto="auto"
            filasPorPagina={25}
          />

          <div className="barra-lote">
            <button type="button" className="btn-primario" disabled={aAplicar.length === 0} onClick={() => setConfirmar(true)}>
              Aplicar {aAplicar.length} de {analisis.length} filas
            </button>
            <button type="button" className="btn-secundario" onClick={() => { setCargado(false); setExcluidas([]); }}>
              Descartar el informe
            </button>
          </div>
        </>
      )}

      {/* ---------- Contratos ya informados por la empresa ---------- */}
      <div className="accesos-header">
        <span>Locales con contrato informado por la prestataria</span>
      </div>
      {localesConEstado.filter((l) => l.estado === 'CONTRATO_9DJ').length === 0 ? (
        <Vacio titulo="Ninguno todavía" />
      ) : (
        <ul className="lista-simple">
          {localesConEstado
            .filter((l) => l.estado === 'CONTRATO_9DJ')
            .map((l) => (
              <li key={l.id}>
                <Link to={`/locales/${l.id}`} className="link-local">
                  {l.nombreLocal}
                </Link>
                <span className="texto-gris"> — CUIT {l.cuit}</span>
                {l.vigente.contrato && <Badge color="verde">Vence el {fmtFecha(l.vigente.contrato.fechaVencimiento)}</Badge>}
              </li>
            ))}
        </ul>
      )}

      <Confirmar
        abierto={confirmar}
        titulo="Aplicar el informe"
        textoConfirmar={`Aplicar ${aAplicar.length} filas`}
        onCancelar={() => setConfirmar(false)}
        onConfirmar={() => {
          aplicarInforme9DJ(aAplicar);
          setConfirmar(false);
          setCargado(false);
          setExcluidas([]);
        }}
      >
        <p>
          Se van a registrar {aAplicar.length} contrato(s) con origen <strong>Informe 9 de Julio</strong>.
        </p>
        <p className="texto-chico">
          Los locales afectados pasan a "Contrato vigente - 9 de Julio", su vigencia solo se puede modificar por esta misma vía.
          Cada cambio de estado queda en la auditoría.
        </p>
      </Confirmar>
    </>
  );
}

export default Informe9DJ;
