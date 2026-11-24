/* ============================================================================
   BuscadorLocal.jsx  —  ELEGIR UN LOCAL ESCRIBIENDO, NO BAJANDO UNA LISTA
   ----------------------------------------------------------------------------
   Con 2.200 locales en el padrón, un desplegable con todos es inmanejable:
   hay que bajar hasta encontrarlo. Acá se escribe parte del nombre, de la
   dirección, de la razón social, del CUIT o el número de local, y aparecen
   los que coinciden (hasta 8). Un toque lo elige.

   Lo usa el alta de documentación (pages/Documentacion.jsx).

   PROPS
     locales   la lista donde buscar (ya filtrada si hace falta)
     valor     el id elegido, o '' si todavía no se eligió
     onElegir  recibe el id elegido ('' al tocar "Cambiar")
     etiqueta, ayuda
   ============================================================================ */

import { useMemo, useState } from 'react';
import { normalizarCuit } from '../dominio/duplicados';

// Minúsculas y sin tildes: "Peru" encuentra "Perú".
const normal = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function BuscadorLocal({ locales, valor, onElegir, etiqueta = 'Local', ayuda, maximo = 8 }) {
  const [texto, setTexto] = useState('');
  const elegido = valor ? locales.find((l) => String(l.id) === String(valor)) : null;

  const resultados = useMemo(() => {
    const q = normal(texto.trim());
    if (q.length < 2) return [];
    const digitos = normalizarCuit(texto);
    return locales
      .filter(
        (l) =>
          [l.nombreLocal, l.direccion, l.razonSocial, l.idLegacy, String(l.id)].some((campo) => normal(campo).includes(q)) ||
          (digitos.length >= 4 && normalizarCuit(l.cuit).includes(digitos)),
      )
      .slice(0, maximo);
  }, [texto, locales, maximo]);

  if (elegido) {
    return (
      <div className="form-grupo">
        <span className="buscador-rotulo">{etiqueta}</span>
        <div className="buscador-elegido">
          <span className="celda-apilada">
            <strong>{elegido.nombreLocal}</strong>
            <small className="celda-sub">
              {elegido.direccion} · N° {elegido.id}
            </small>
          </span>
          <button
            type="button"
            className="btn-tabla"
            onClick={() => {
              onElegir('');
              setTexto('');
            }}
          >
            Cambiar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="form-grupo">
      <label htmlFor="buscador-local">{etiqueta}</label>
      <input
        id="buscador-local"
        type="search"
        autoComplete="off"
        placeholder=" "
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />
      {ayuda && <span className="form-ayuda">{ayuda}</span>}
      {resultados.length > 0 && (
        <ul className="buscador-resultados">
          {resultados.map((l) => (
            <li key={l.id}>
              <button type="button" onClick={() => onElegir(l.id)}>
                <strong>{l.nombreLocal}</strong>
                <small>
                  {l.direccion}
                  {l.cuit ? ` · CUIT ${l.cuit}` : ''}
                </small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {texto.trim().length >= 2 && resultados.length === 0 && <span className="form-ayuda">No hay locales que coincidan.</span>}
    </div>
  );
}

export default BuscadorLocal;
