/* ============================================================================
   ui/Grilla.jsx  —  LA TABLA DE DATOS DE TODA LA APP
   ----------------------------------------------------------------------------
   Envuelve al MUI Data Grid con la configuración común: el encabezado azul, el
   locale en castellano, la paginación, el buscador rápido, los filtros por
   columna y los botones de imprimir y CSV.

   Está una sola vez. Si el área pide "que las tablas se vean así", se toca este
   archivo y cambian TODAS las tablas del sistema.

   CÓMO SE USA
     <Grilla
       filas={filas}
       columnas={columnas}
       nombreArchivo="locales"          // para el CSV y el título de impresión
       buscadores={[                    // opcional, filtra ANTES de la grilla
         { placeholder: 'Buscar...', valor: q, onChange: setQ },
       ]}
       botones={<button .../>}           // opcional, acciones propias de la página
       vacio="Todavía no hay locales."   // opcional
       idFila={(f) => f.localId}         // opcional, si las filas no traen `id`
       alto="auto"                       // opcional: se adapta a la cantidad de filas
       compacta                          // opcional: más filas a la vista
       sinExportar                       // opcional: oculta imprimir/CSV
     />

   IMPRIMIR Y DESCARGAR: los maneja este componente con su propio apiRef, así
   ninguna pantalla necesita saber que existe.

   >>> LAS FILAS NECESITAN UN id ÚNICO <<<
   El Data Grid lo exige. Si las filas no tienen `id` propio (pasa con las que
   se arman juntando datos de varias colecciones), se pasa `idFila`.

   Si aun así alguna fila queda sin id, esta grilla le pone uno sintético en vez
   de dejar que el Data Grid lance un error: ver la red de seguridad más abajo.
   ============================================================================ */

import { useMemo, useState } from 'react';
import useMediaQuery from '@mui/material/useMediaQuery';
import {
  DataGrid,
  GridToolbar,
  gridFilteredSortedRowIdsSelector,
  gridVisibleColumnDefinitionsSelector,
  useGridApiRef,
} from '@mui/x-data-grid';
import { esES } from '@mui/x-data-grid/locales';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import { useRol } from '../../auth/rolContexto';
import { imprimirPdf, pdfDeTabla, quienGenera, textoParaPdf } from '../pdfCedulas';

/* El botón verde "Imprimir" arma un PDF con lo que muestra la grilla (ver
   pdfDeTabla en components/pdfCedulas.js). En false vuelve a la impresión del
   navegador, que cortaba las columnas de la derecha. */
const IMPRESION_EN_PDF = true;

/* Las columnas que no van al papel: botones y acciones. */
const SIN_IMPRIMIR = ['acciones', 'ver', '__check__'];

/* "padron-locales" -> "Padrón locales": el título del PDF cuando la grilla no
   trae uno propio (prop `tituloImpresion`). */
const CON_TILDE = {
  cedulas: 'cédulas',
  emision: 'emisión',
  correccion: 'corrección',
  documentacion: 'documentación',
  prorroga: 'prórroga',
  prorrogas: 'prórrogas',
  ubicacion: 'ubicación',
  padron: 'padrón',
  '9dj': '9 de Julio',
};
function tituloDesdeArchivo(nombre) {
  const texto = String(nombre ?? 'listado')
    .split('-')
    .map((p) => CON_TILDE[p] ?? p)
    .join(' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/* El estilo de la grilla. Encabezado azul institucional, filas que se marcan
   al pasar el mouse, tipografía heredada del resto de la app.

   `alignItems: center` en la celda es lo que mantiene alineado el contenido
   cuando una columna trae un badge o un botón en vez de texto suelto. */
const ESTILO = {
  border: 'none',
  fontFamily: 'inherit',
  '& .MuiDataGrid-columnHeader': { backgroundColor: '#1976d2', color: '#fff' },
  '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 700 },
  '& .MuiDataGrid-columnHeader .MuiSvgIcon-root': { color: '#fff' },
  '& .MuiDataGrid-columnSeparator': { color: 'rgba(255,255,255,0.4)' },
  '& .MuiDataGrid-row:hover': { backgroundColor: '#f8fafc' },
  '& .MuiDataGrid-cell': { fontSize: 14, color: '#444', display: 'flex', alignItems: 'center' },
  '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': { outline: 'none' },
  // La barra de herramientas hereda el fondo blanco de la tarjeta.
  // gap con 'px': en el sx de MUI un número suelto se multiplica por el
  // espaciado del tema, y `gap: 8` daba 64px entre botones. La barra se partía
  // en varios renglones aun en tablas anchas, y en el celular quedaban huecos
  // enormes entre COLUMNAS, FILTROS y DENSIDAD. flex y alignContent: que la
  // barra mida solo lo que ocupa si igual no entra en un renglón.
  '& .MuiDataGrid-toolbarContainer': { padding: '8px 12px', gap: '8px', flex: '0 0 auto', alignContent: 'flex-start' },
};

/* EN EL CELULAR (pantallas de hasta ANCHO_CELULAR px). En false, las tablas se
   ven en el teléfono igual que antes. */
const AJUSTE_CELULAR = true;
const ANCHO_CELULAR = 600;

/* La barra en un solo renglón y los botones solo con su ícono. El texto sigue
   en el botón (lo lee el lector de pantalla), solo que con tamaño cero. Va en
   el celular y también en la PC cuando la tabla es más angosta que
   ANCHO_BARRA_COMPLETA (Rubros, Reportes): ahí los cuatro botones con texto
   tampoco entran en un renglón. */
const ANCHO_BARRA_COMPLETA = 560;
const ESTILO_BARRA_COMPACTA = {
  '& .MuiDataGrid-toolbarContainer': { padding: '4px 6px', gap: 0, flex: '0 0 auto', flexWrap: 'nowrap' },
  '& .MuiDataGrid-toolbarContainer .MuiButton-root': { minWidth: 0, padding: '6px 8px', fontSize: 0 },
  '& .MuiDataGrid-toolbarContainer .MuiButton-startIcon': { margin: 0 },
};
const ESTILO_CELULAR = { '& .MuiDataGrid-cell': { fontSize: 13 } };

/* Alto de una fila y del andamiaje (encabezado + barra + paginador), para
   calcular cuánto mide la grilla cuando se pide alto automático. */
const ALTO_FILA = 52;
const ALTO_FILA_COMPACTA = 36;
const ALTO_FIJO = 170;

/* Cuánto ancho se le da a una columna flexible por encima de su mínimo. Las
   columnas con `width` fijo ya declaran lo que necesitan; las que tienen `flex`
   solo declaran un piso, así que se les suma este margen para calcular cuánto
   mide la tabla "cómoda". */
const HOLGURA_FLEX = 60;
const ANCHO_POR_DEFECTO = 150;

/* CUÁNTO MIDE UNA TABLA segun sus columnas. Se exporta porque hay pantallas que
   necesitan acompañar ese ancho con algo que va por fuera de la grilla: el
   tablero envuelve cada tabla en una tarjeta con su encabezado de color, y si
   la tarjeta es mucho más ancha que la tabla queda un bloque de color vacío al
   costado.

   Se suma lo que pide cada columna: su `width` si lo tiene, o su `minWidth` más
   una holgura si es flexible. */
export function anchoDeColumnas(columnas) {
  return columnas.reduce(
    (total, c) => total + (c.width ?? (c.minWidth ? c.minWidth + HOLGURA_FLEX : ANCHO_POR_DEFECTO)),
    24, // los bordes de la tabla
  );
}

function Grilla({
  filas,
  columnas,
  nombreArchivo = 'listado',
  buscadores = [],
  botones = null,
  vacio = 'No hay registros para mostrar.',
  alClickFila,
  alto = 560,
  ordenInicial,
  idFila,
  compacta = false,
  sinExportar = false,
  filasPorPagina = 10,
  tituloImpresion,
}) {
  const apiRef = useGridApiRef();
  const { usuario } = useRol();

  /* El PDF lleva las filas que quedaron después de buscar y filtrar, en el
     orden de la grilla, y las columnas visibles menos los botones. */
  function datosParaPdf() {
    const api = apiRef.current;
    const columnas = gridVisibleColumnDefinitionsSelector(apiRef).filter(
      (c) => c.type !== 'actions' && !c.disableExport && !SIN_IMPRIMIR.includes(c.field) && c.headerName,
    );
    const ids = gridFilteredSortedRowIdsSelector(apiRef);
    const valor = (id, row, c) =>
      typeof api.getRowFormattedValue === 'function'
        ? api.getRowFormattedValue(row, c)
        : api.getCellParams(id, c.field).formattedValue;
    const filasPdf = ids.map((id) => {
      const row = api.getRow(id);
      return columnas.map((c) => textoParaPdf(valor(id, row, c)));
    });
    const filtrado = ids.length < filas.length ? ` de ${filas.length} (con filtros)` : '';
    return {
      titulo: tituloImpresion ?? tituloDesdeArchivo(nombreArchivo),
      detalle: `${ids.length}${filtrado} registro(s)`,
      encabezados: columnas.map((c) => c.headerName),
      filas: filasPdf,
      generadoPor: quienGenera(usuario),
    };
  }

  const imprimir = () =>
    IMPRESION_EN_PDF
      ? imprimirPdf(() => pdfDeTabla(datosParaPdf()), nombreArchivo)
      : apiRef.current?.exportDataAsPrint({ fileName: nombreArchivo });
  const descargar = () => apiRef.current?.exportDataAsCsv({ fileName: nombreArchivo, utf8WithBom: true });

  /* Con alto="auto" la grilla mide lo que necesita: una tabla de tres filas no
     deja medio metro de blanco abajo, y una de doscientas no crece sin fin
     porque el tope es la altura de una página completa.

     En el celular TODAS las tablas van con alto automático, y siguiendo las
     filas por página que elija el agente. Con un alto fijo, la tabla tenía su
     propio scroll: al deslizar el dedo sobre ella se movían las filas y no la
     página, y nunca se llegaba al pie con el cambio de página. */
  const celular = useMediaQuery(`(max-width:${ANCHO_CELULAR}px)`) && AJUSTE_CELULAR;
  const [filasPorPaginaElegidas, setFilasPorPaginaElegidas] = useState(filasPorPagina);
  const altura = useMemo(() => {
    if (alto !== 'auto' && !celular) return alto;
    const porPagina = celular ? filasPorPaginaElegidas : filasPorPagina;
    const visibles = Math.min(filas.length || 1, porPagina);
    return ALTO_FIJO + visibles * (compacta ? ALTO_FILA_COMPACTA : ALTO_FILA);
  }, [alto, celular, filas.length, filasPorPagina, filasPorPaginaElegidas, compacta]);

  /* ---------------------------------------------------------------------------
     EL id DE CADA FILA  —  la red de seguridad
     ---------------------------------------------------------------------------
     El Data Grid EXIGE que cada fila tenga un id único, y si alguna no lo tiene
     lanza un error que React no atrapa: la pantalla entera queda en blanco, sin
     mensaje. Pasó con Reportes, donde las filas se identifican por el nombre del
     agente y en el padrón real casi ningún relevamiento tiene usuario cargado.

     Acá se garantiza que SIEMPRE haya uno. Si la fila no trae id propio ni lo
     produce `idFila`, se usa su posición en la lista. Un id sintético no sirve
     para nada más que para dibujar, pero es infinitamente mejor que una pantalla
     en blanco: la tabla se ve, y el dato que falta se nota mirándola.

     Se calcula una vez por lista y no en cada render: el Data Grid vuelve a
     dibujar todo si la función de id cambia de identidad.
     --------------------------------------------------------------------------- */
  const filasConId = useMemo(
    () =>
      filas.map((fila, indice) => {
        const propio = idFila ? idFila(fila) : fila.id;
        return propio === undefined || propio === null || propio === '' ? { ...fila, __id: `fila-${indice}` } : fila;
      }),
    [filas, idFila],
  );

  const obtenerId = useMemo(
    () => (fila) => fila.__id ?? (idFila ? idFila(fila) : fila.id),
    [idFila],
  );

  /* CADA TABLA MIDE LO QUE NECESITAN SUS COLUMNAS, no todo el ancho de la
     pantalla. Una tabla de cuatro columnas estirada a 1800px deja columnas
     enormes y medio vacías, y obliga a barrer la vista de un borde al otro para
     leer una fila. El resultado es el tope; si la pantalla es más angosta,
     manda la pantalla. */
  const anchoMaximo = useMemo(() => anchoDeColumnas(columnas), [columnas]);

  return (
    <>
      {/* ---------- Barra de acciones: buscadores + botones ---------- */}
      {(buscadores.length > 0 || botones || !sinExportar) && (
        <div className="tabla-acciones" style={{ maxWidth: anchoMaximo }}>
          <div className="tabla-buscadores">
            {buscadores.map((b) => (
              <input
                key={b.placeholder}
                className="buscador"
                type="search"
                placeholder={b.placeholder}
                value={b.valor}
                onChange={(e) => b.onChange(e.target.value)}
              />
            ))}
          </div>
          <div className="tabla-botones">
            {botones}
            {!sinExportar && (
              <>
                <button type="button" className="btn-icono btn-icono-verde" title="Imprimir" onClick={imprimir}>
                  <PrintIcon fontSize="small" />
                </button>
                <button type="button" className="btn-icono btn-icono-azul" title="Descargar CSV" onClick={descargar}>
                  <DownloadIcon fontSize="small" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ---------- La grilla ---------- */}
      <div className="grilla-contenedor" style={{ height: altura, maxWidth: anchoMaximo }}>
        <DataGrid
          apiRef={apiRef}
          rows={filasConId}
          columns={columnas}
          getRowId={obtenerId}
          density={compacta ? 'compact' : 'standard'}
          showToolbar
          slots={{ toolbar: GridToolbar }}
          slotProps={{
            toolbar: { showQuickFilter: true, csvOptions: { fileName: nombreArchivo, utf8WithBom: true } },
          }}
          localeText={{
            ...esES.components.MuiDataGrid.defaultProps.localeText,
            noRowsLabel: vacio,
            noResultsOverlayLabel: 'La búsqueda no encontró resultados.',
          }}
          initialState={{
            pagination: { paginationModel: { pageSize: filasPorPagina } },
            ...(ordenInicial ? { sorting: { sortModel: ordenInicial } } : {}),
          }}
          pageSizeOptions={[5, 10, 25, 50, 100]}
          onPaginationModelChange={(modelo) => setFilasPorPaginaElegidas(modelo.pageSize)}
          disableRowSelectionOnClick
          onRowClick={alClickFila ? (params) => alClickFila(params.row) : undefined}
          sx={{
            ...ESTILO,
            ...(celular || (AJUSTE_CELULAR && anchoMaximo < ANCHO_BARRA_COMPLETA) ? ESTILO_BARRA_COMPACTA : {}),
            ...(celular ? ESTILO_CELULAR : {}),
          }}
        />
      </div>
    </>
  );
}

export default Grilla;
