/* ============================================================================
   ListaTarjetasLocales.jsx  —  EL PADRÓN EN EL TELÉFONO
   ----------------------------------------------------------------------------
   En una pantalla de 360-430px la tabla del padrón muestra dos columnas y hay
   que deslizarla de costado para ver el estado o la dirección. Acá cada local
   es una tarjeta con lo que se necesita en la calle: nombre, dirección, estado,
   y un "Cómo llegar" que abre el mapa del teléfono.

   La usa pages/Local.jsx SOLO en pantallas de hasta 600px (TARJETAS_EN_CELULAR
   en ese archivo). En la PC sigue la tabla de siempre, con sus columnas,
   filtros, impresión y CSV.

   QUÉ RECIBE
     locales    los del padrón, ya filtrados por Estado/Rubro/Situación
     alAbrir    (local) -> ir a la ficha
     alEditar   (local) -> abrir el formulario; null si el rol no puede editar
     alNuevo    () -> alta de local; null si el rol no puede

   Se muestran de a POR_TANDA, con un botón para ver más: el padrón real tiene
   unos 2.200 locales, y dibujarlos todos juntos traba un teléfono modesto.
   ============================================================================ */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import LockIcon from '@mui/icons-material/Lock';
import { BadgeEstado } from './ui/Badge';
import { fmtFecha } from '../dominio/fechas';

const POR_TANDA = 20;

/* "Cómo llegar": abre Google Maps (la app, si está instalada) en el punto del
   padrón, que es el geocodificado de la dirección declarada. Si el local
   todavía no tiene coordenada, busca la dirección escrita. */
function enlaceMapa(local) {
  const destino =
    typeof local.latitud === 'number' && typeof local.longitud === 'number'
      ? `${local.latitud},${local.longitud}`
      : `${local.direccion ?? ''}, San Miguel de Tucumán`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destino)}`;
}

/* Sin tildes ni mayúsculas: "jose" encuentra "José". */
const normalizar = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/* Lo mismo que muestra la columna "Vence" de la tabla. */
function vence(local) {
  if (local.plazo) return { fecha: local.plazo.vencimiento, vencido: local.plazo.vencido };
  const vigencia =
    local.vigente?.contrato?.fechaVencimiento ??
    local.vigente?.reciclaje?.fechaVencimiento ??
    local.vigente?.ddjj?.fechaVencimiento;
  return vigencia ? { fecha: vigencia, vencido: false } : null;
}

function ListaTarjetasLocales({ locales, alAbrir, alEditar = null, alNuevo = null }) {
  const [busqueda, setBusqueda] = useState('');
  const [cuantos, setCuantos] = useState(POR_TANDA);

  const encontrados = useMemo(() => {
    const q = normalizar(busqueda.trim());
    if (!q) return locales;
    return locales.filter((l) =>
      [l.id, l.nombreLocal, l.razonSocial, l.cuit, l.direccion, l.rubro].some((v) => normalizar(v).includes(q)),
    );
  }, [locales, busqueda]);

  const visibles = encontrados.slice(0, cuantos);
  const quedan = encontrados.length - visibles.length;

  return (
    <div className="tarjetas-locales">
      <div className="tarjetas-locales-barra">
        <input
          className="buscador"
          type="search"
          placeholder="Buscar nombre, dirección, CUIT…"
          aria-label="Buscar en el padrón"
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setCuantos(POR_TANDA);
          }}
        />
        {alNuevo && (
          <button type="button" className="btn-icono btn-icono-azul" title="Nuevo local" onClick={alNuevo}>
            <AddIcon fontSize="small" />
          </button>
        )}
      </div>

      {encontrados.length === 0 ? (
        <p className="texto-gris tarjetas-locales-vacio">Ningún local coincide con la búsqueda.</p>
      ) : (
        <ul className="tarjetas-locales-lista">
          {visibles.map((l) => {
            const v = vence(l);
            return (
              <li key={l.id} className="tarjeta-local">
                <div className="tarjeta-local-titulo">
                  <Link to={`/locales/${l.id}`} className="link-local">
                    {l.nombreLocal || 'Sin nombre'}
                  </Link>
                  <span className="texto-chico">N° {l.id}</span>
                </div>
                <div className="tarjeta-local-direccion">{l.direccion || 'Sin dirección'}</div>
                {(l.razonSocial || l.cuit) && (
                  <div className="texto-chico">{[l.razonSocial, l.cuit].filter(Boolean).join(' · ')}</div>
                )}
                <div className="tarjeta-local-estado">
                  <BadgeEstado codigo={l.estado} />
                  {l.bloqueado && (
                    <LockIcon fontSize="inherit" titleAccess={l.bloqueadoMotivo} sx={{ color: '#78909c' }} />
                  )}
                  {v && (
                    <span className={v.vencido ? 'texto-vencido' : 'texto-chico'}>
                      {v.vencido ? 'Venció' : 'Vence'} {fmtFecha(v.fecha)}
                    </span>
                  )}
                </div>
                <div className="tarjeta-local-acciones">
                  <button type="button" className="btn-tabla" onClick={() => alAbrir(l)}>
                    Ficha
                  </button>
                  <a className="btn-tabla" href={enlaceMapa(l)} target="_blank" rel="noreferrer">
                    Cómo llegar
                  </a>
                  {alEditar && (
                    <button type="button" className="btn-tabla" onClick={() => alEditar(l)}>
                      Editar
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {quedan > 0 && (
        <button
          type="button"
          className="btn-secundario tarjetas-locales-mas"
          onClick={() => setCuantos((c) => c + POR_TANDA)}
        >
          Ver {Math.min(quedan, POR_TANDA)} más (quedan {quedan})
        </button>
      )}
    </div>
  );
}

export default ListaTarjetasLocales;
