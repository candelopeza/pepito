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

import { useMemo } from 'react';
import { DataGrid, GridToolbar, useGridApiRef } from '@mui/x-data-grid';
import { esES } from '@mui/x-data-grid/locales';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';

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
  '& .MuiDataGrid-toolbarContainer': { padding: '8px 12px', gap: 8 },
};

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
}) {
  const apiRef = useGridApiRef();

  const imprimir = () => apiRef.current?.exportDataAsPrint({ fileName: nombreArchivo });
  const descargar = () => apiRef.current?.exportDataAsCsv({ fileName: nombreArchivo, utf8WithBom: true });

  /* Con alto="auto" la grilla mide lo que necesita: una tabla de tres filas no
     deja medio metro de blanco abajo, y una de doscientas no crece sin fin
     porque el tope es la altura de una página completa. */
  const altura = useMemo(() => {
    if (alto !== 'auto') return alto;
    const visibles = Math.min(filas.length || 1, filasPorPagina);
    return ALTO_FIJO + visibles * (compacta ? ALTO_FILA_COMPACTA : ALTO_FILA);
  }, [alto, filas.length, filasPorPagina, compacta]);

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
     leer una fila.

     Se suma lo que pide cada columna: su `width` si lo tiene, o su `minWidth`
     más una holgura si es flexible. El resultado es el tope; si la pantalla es
     más angosta, manda la pantalla. */
  const anchoMaximo = useMemo(
    () =>
      columnas.reduce(
        (total, c) => total + (c.width ?? (c.minWidth ? c.minWidth + HOLGURA_FLEX : ANCHO_POR_DEFECTO)),
        24, // los bordes de la tabla
      ),
    [columnas],
  );

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
          disableRowSelectionOnClick
          onRowClick={alClickFila ? (params) => alClickFila(params.row) : undefined}
          sx={ESTILO}
        />
      </div>
    </>
  );
}

export default Grilla;
