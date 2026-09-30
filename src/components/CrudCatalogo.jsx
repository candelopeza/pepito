/* ============================================================================
   CrudCatalogo.jsx  —  ALTA, BAJA Y MODIFICACIÓN DE UNA TABLA MAESTRA
   ----------------------------------------------------------------------------
   Un solo componente para las tres pantallas de Configuración que son lo mismo
   con distintos campos: Rubros, Feriados y Usuarios.

   POR QUÉ GENÉRICO: las tres son "listá, agregá, editá, borrá" sobre un array
   del store. Tres archivos casi idénticos se desincronizan solos (uno valida,
   otro no; uno confirma la baja, otro borra directo). Acá el comportamiento es
   uno.

   CÓMO SE USA
     <CrudCatalogo
       clave="rubros"                       // la clave del store
       titulo="rubro"                       // en singular, para los textos
       campos={[
         { id: 'nombre', etiqueta: 'Nombre', requerido: true },
         { id: 'alcance', etiqueta: 'Alcance', tipo: 'select', opciones: [...] },
       ]}
       columnas={['nombre', 'alcance']}     // qué mostrar en la tabla
       enUso={(item) => cantidad}           // opcional: ver abajo
     />

   `enUso` es lo que evita el problema clásico de las tablas maestras: borrar un
   rubro que veinte locales están usando. Si se pasa, la pantalla muestra
   cuántos registros dependen del ítem y avisa antes de la baja.
   ============================================================================ */

import { useMemo, useState } from 'react';
import Campo, { CampoSelect } from './ui/Campo';
import Modal from './ui/Modal';
import Confirmar from './ui/Confirmar';
import Aviso, { Vacio } from './ui/Aviso';
import Grilla from './ui/Grilla';
import { useDatos } from '../datos/datosContexto';

function CrudCatalogo({ clave, titulo, campos, columnas, enUso, soloLectura = false, orden }) {
  const datos = useDatos();
  const { guardarEnCatalogo, eliminarDeCatalogo } = datos;

  const [editando, setEditando] = useState(null);
  const [aEliminar, setAEliminar] = useState(null);
  const [errores, setErrores] = useState({});

  const lista = orden ? [...datos[clave]].sort(orden) : datos[clave];

  /* Las columnas del Data Grid salen de los mismos `campos` que ya declara cada
     pantalla: no hay que describir la tabla dos veces. `render` de un campo se
     convierte en `renderCell` de la columna.

     `flex` reparte el ancho sobrante entre las columnas de datos; las dos
     últimas (en uso y acciones) van con ancho fijo porque su contenido no
     crece. */
  const columnasGrilla = useMemo(() => {
    const deDatos = campos
      .filter((c) => columnas.includes(c.id))
      .map((c) => ({
        field: c.id,
        headerName: c.etiqueta,
        flex: 1,
        minWidth: 140,
        ...(c.render ? { renderCell: ({ row }) => c.render(row) } : {}),
      }));

    if (enUso) {
      deDatos.push({
        field: '__enUso',
        headerName: 'En uso',
        width: 110,
        // Se calcula al vuelo, así que hay que decirle a la grilla de dónde
        // sacar el valor para poder ordenar y filtrar por esta columna.
        valueGetter: (_v, row) => enUso(row),
      });
    }

    if (!soloLectura) {
      deDatos.push({
        field: '__acciones',
        headerName: 'Acciones',
        width: 190,
        sortable: false,
        filterable: false,
        renderCell: ({ row }) => (
          <span className="celda-acciones">
            <button
              type="button"
              className="btn-tabla"
              onClick={() => {
                setErrores({});
                setEditando(row);
              }}
            >
              Editar
            </button>
            <button type="button" className="btn-tabla" onClick={() => setAEliminar(row)}>
              Eliminar
            </button>
          </span>
        ),
      });
    }

    return deDatos;
  }, [campos, columnas, enUso, soloLectura]);

  function abrirNuevo() {
    const vacio = {};
    campos.forEach((c) => {
      vacio[c.id] = c.pordefecto ?? '';
    });
    setErrores({});
    setEditando(vacio);
  }

  function guardar() {
    const e = {};
    campos.forEach((c) => {
      if (c.requerido && !String(editando[c.id] ?? '').trim()) {
        e[c.id] = `${c.etiqueta} es obligatorio.`;
      }
    });
    setErrores(e);
    if (Object.keys(e).length) return;

    guardarEnCatalogo(clave, editando);
    setEditando(null);
  }

  const usos = aEliminar && enUso ? enUso(aEliminar) : 0;

  return (
    <>
      {!soloLectura && (
        <div className="barra-lote">
          <button type="button" className="btn-primario" onClick={abrirNuevo}>
            Agregar {titulo}
          </button>
          <span className="texto-chico">{lista.length} registro(s)</span>
        </div>
      )}

      {lista.length === 0 ? (
        <Vacio titulo={`Todavía no hay ningún ${titulo}`} />
      ) : (
        <Grilla
          filas={lista}
          columnas={columnasGrilla}
          nombreArchivo={clave}
          vacio={`Todavía no hay ningún ${titulo}`}
          alto="auto"
        />
      )}

      {/* ---------- Alta / edición ---------- */}
      {editando && (
        <Modal
          abierto
          etiqueta="CONFIGURACIÓN"
          titulo={editando.id ? `Editar ${titulo}` : `Nuevo ${titulo}`}
          onCerrar={() => setEditando(null)}
        >
          <div className="formulario formulario-modal">
            {campos.map((c) =>
              c.tipo === 'select' ? (
                <CampoSelect
                  key={c.id}
                  id={`cat-${c.id}`}
                  etiqueta={c.etiqueta}
                  valor={editando[c.id]}
                  onChange={(v) => setEditando({ ...editando, [c.id]: v })}
                  opciones={c.opciones}
                  error={errores[c.id]}
                  ayuda={c.ayuda}
                  vacio={c.vacio}
                />
              ) : c.tipo === 'checkbox' ? (
                <div className="form-grupo form-grupo-check" key={c.id}>
                  <label htmlFor={`cat-${c.id}`}>
                    <input
                      id={`cat-${c.id}`}
                      type="checkbox"
                      checked={Boolean(editando[c.id])}
                      onChange={(e) => setEditando({ ...editando, [c.id]: e.target.checked })}
                    />
                    {c.etiqueta}
                  </label>
                  {c.ayuda && <span className="form-ayuda">{c.ayuda}</span>}
                </div>
              ) : (
                <Campo
                  key={c.id}
                  id={`cat-${c.id}`}
                  etiqueta={c.etiqueta}
                  tipo={c.tipo ?? 'text'}
                  valor={editando[c.id]}
                  onChange={(v) => setEditando({ ...editando, [c.id]: v })}
                  error={errores[c.id]}
                  ayuda={c.ayuda}
                />
              ),
            )}

            <div className="form-acciones">
              <button type="button" className="btn-primario" onClick={guardar}>
                Guardar
              </button>
              <button type="button" className="btn-secundario" onClick={() => setEditando(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ---------- Baja ---------- */}
      <Confirmar
        abierto={Boolean(aEliminar)}
        titulo={`Eliminar ${titulo}`}
        textoConfirmar="Eliminar"
        peligro
        onCancelar={() => setAEliminar(null)}
        onConfirmar={() => {
          eliminarDeCatalogo(clave, aEliminar.id);
          setAEliminar(null);
        }}
      >
        <p>
          Se elimina <strong>{aEliminar?.nombre ?? aEliminar?.motivo ?? aEliminar?.id}</strong> del catálogo.
        </p>
        {usos > 0 && (
          <Aviso tipo="alerta" titulo={`Hay ${usos} registro(s) usándolo`}>
            Los registros existentes conservan el valor que tienen guardado, pero deja de estar en los desplegables. Si querés
            reemplazarlo, cambialos antes de eliminar.
          </Aviso>
        )}
      </Confirmar>
    </>
  );
}

export default CrudCatalogo;
