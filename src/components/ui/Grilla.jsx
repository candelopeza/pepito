/* ============================================================================
   ui/Grilla.jsx  —  LA TABLA DE DATOS DE TODA LA APP
   ----------------------------------------------------------------------------
   Envuelve al MUI Data Grid con la configuración que antes estaba COPIADA en
   Local.jsx, Tramite.jsx y Documentacion.jsx: los mismos 30 renglones de `sx`,
   el mismo locale, la misma paginación, los mismos botones de imprimir y CSV.
   Tres copias que ya habían empezado a separarse entre sí.

   Ahora está una sola vez. Si el área pide "que las tablas se vean así", se
   toca este archivo y cambian todas.

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
       alClickFila={(fila) => ...}       // opcional
     />

   IMPRIMIR Y DESCARGAR: los maneja este componente con su propio apiRef, así
   ninguna pantalla necesita saber que existe. Antes cada página se armaba el
   suyo y si se olvidaba de pasar la prop `apiRef` los dos botones morían en
   silencio.
   ============================================================================ */

import { DataGrid, GridToolbar, useGridApiRef } from '@mui/x-data-grid';
import { esES } from '@mui/x-data-grid/locales';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';

/* El estilo de la grilla. Encabezado azul institucional, filas que se marcan
   al pasar el mouse, tipografía heredada del resto de la app. */
const ESTILO = {
  border: 'none',
  fontFamily: 'inherit',
  '& .MuiDataGrid-columnHeader': { backgroundColor: '#1976d2', color: '#fff' },
  '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 700 },
  '& .MuiDataGrid-columnHeader .MuiSvgIcon-root': { color: '#fff' },
  '& .MuiDataGrid-columnSeparator': { color: 'rgba(255,255,255,0.4)' },
  '& .MuiDataGrid-row:hover': { backgroundColor: '#f8fafc' },
  '& .MuiDataGrid-cell': { fontSize: 14, color: '#444' },
  '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': { outline: 'none' },
};

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
}) {
  const apiRef = useGridApiRef();

  const imprimir = () => apiRef.current?.exportDataAsPrint({ fileName: nombreArchivo });
  const descargar = () => apiRef.current?.exportDataAsCsv({ fileName: nombreArchivo, utf8WithBom: true });

  return (
    <>
      {/* ---------- Barra de acciones: buscadores + botones ----------
          Se dibuja siempre: los dos botones de exportar están en todas las
          grillas, aunque la página no agregue nada propio. */}
      <div className="tabla-acciones">
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
          <button type="button" className="btn-icono btn-icono-verde" title="Imprimir" onClick={imprimir}>
            <PrintIcon fontSize="small" />
          </button>
          <button type="button" className="btn-icono btn-icono-azul" title="Descargar CSV" onClick={descargar}>
            <DownloadIcon fontSize="small" />
          </button>
        </div>
      </div>

      {/* ---------- La grilla ---------- */}
      <div className="grilla-contenedor" style={{ height: alto }}>
        <DataGrid
          apiRef={apiRef}
          rows={filas}
          columns={columnas}
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
            pagination: { paginationModel: { pageSize: 10 } },
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
