/* ============================================================================
   pages/Mapa.jsx  —  MAPA DEL PADRÓN  (URL: /#/mapa)
   ----------------------------------------------------------------------------
   Los locales en el territorio, con código de colores por estado y los mismos
   filtros que el padrón (sección 6.1).

   >>> POR QUÉ ES UN SVG Y NO UN MAPA DE VERDAD <<<
   Porque una capa de mapa (Leaflet, MapLibre) trae dependencia de servidor de
   tiles, y el build de este proyecto se arma en UN SOLO ARCHIVO para poder
   abrirlo desde el disco (ver vite.config.js). Un mapa que necesita internet
   rompe justamente eso.

   Lo que hay acá es la geometría real: el polígono del ejido municipal y cada
   local en su coordenada, proyectados sobre el recuadro que los contiene. Sirve
   para ver distribución y detectar locales mal ubicados, que es para lo que se
   usa el mapa en la práctica.

   CUANDO SE DEFINA EL DESPLIEGUE: si la app va a estar servida desde un
   servidor municipal, acá va la capa real con el KML de límites que tiene la
   Dirección de Ambiente. Lo único que hay que cambiar es este archivo; las
   coordenadas ya están bien guardadas (dos números, no una cadena de texto).

   >>> LOS PUNTOS SON LA COORDENADA DEL PADRÓN <<<
   La geocodificada desde la dirección. NUNCA la del relevamiento. Los locales
   sin coordenada no se dibujan y se listan aparte: no se les pone un punto
   aproximado, porque un punto aproximado en un mapa se lee como un dato.
   ============================================================================ */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import Badge, { BadgeEstado } from '../components/ui/Badge';
import Aviso from '../components/ui/Aviso';
import { CampoSelect } from '../components/ui/Campo';
import { useDatos } from '../datos/datosContexto';
import { LIMITE_MUNICIPAL, RECUADRO_MUNICIPAL } from '../dominio/geo';
import { LISTA_ESTADOS } from '../dominio/estados';

/* Los colores de los badges, para que el punto del mapa y la pastilla de la
   grilla sean del mismo color. Si divergen, el mapa deja de ser legible. */
const COLOR_HEX = {
  verde: '#2e7d32',
  naranja: '#ef6c00',
  azul: '#1565c0',
  amarillo: '#f9a825',
  rojo: '#c62828',
  gris: '#90a4ae',
};

const ANCHO = 900;
const ALTO = 620;
const MARGEN = 24;

/* Proyección lineal del recuadro al SVG. A escala de ciudad la distorsión es
   invisible, así que no hace falta una proyección cartográfica. */
function proyectar(lat, lng) {
  const { latMin, latMax, lngMin, lngMax } = RECUADRO_MUNICIPAL;
  const x = MARGEN + ((lng - lngMin) / (lngMax - lngMin)) * (ANCHO - 2 * MARGEN);
  // La latitud se invierte: en pantalla el norte va arriba (y crece hacia abajo).
  const y = MARGEN + ((latMax - lat) / (latMax - latMin)) * (ALTO - 2 * MARGEN);
  return [x, y];
}

function Mapa() {
  const { localesConEstado, rubros } = useDatos();
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroRubro, setFiltroRubro] = useState('');
  const [encima, setEncima] = useState(null);

  const filtrados = useMemo(
    () =>
      localesConEstado.filter(
        (l) => (!filtroEstado || l.estado === filtroEstado) && (!filtroRubro || l.rubro === filtroRubro),
      ),
    [localesConEstado, filtroEstado, filtroRubro],
  );

  const conUbicacion = filtrados.filter((l) => !l.sinGeo);
  const sinUbicacion = filtrados.filter((l) => l.sinGeo);

  const contorno = LIMITE_MUNICIPAL.map(([lat, lng]) => proyectar(lat, lng).join(',')).join(' ');

  // Solo los estados que están en pantalla: una leyenda con los 24 no se lee.
  const estadosPresentes = [...new Set(conUbicacion.map((l) => l.estado))];

  return (
    <>
      <PageHeader
        etiqueta="MAPA"
        titulo="DISTRIBUCIÓN TERRITORIAL"
        subtitulo={`${conUbicacion.length} local(es) ubicados · ${sinUbicacion.length} sin coordenada`}
        botonVolver
      />

      <div className="filtros-fila">
        <CampoSelect
          id="mapa-estado"
          etiqueta="Estado"
          valor={filtroEstado}
          onChange={setFiltroEstado}
          opciones={LISTA_ESTADOS.map((e) => ({ id: e.codigo, etiqueta: e.etiqueta }))}
          vacio="Todos los estados"
        />
        <CampoSelect
          id="mapa-rubro"
          etiqueta="Rubro"
          valor={filtroRubro}
          onChange={setFiltroRubro}
          opciones={rubros.map((r) => ({ id: r.nombre, etiqueta: r.nombre }))}
          vacio="Todos los rubros"
        />
      </div>

      <div className="mapa-contenedor">
        <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="mapa-svg" role="img" aria-label="Mapa de locales del padrón">
          {/* Grilla de referencia, solo para dar sensación de escala. */}
          <defs>
            <pattern id="cuadricula" width="45" height="45" patternUnits="userSpaceOnUse">
              <path d="M 45 0 L 0 0 0 45" fill="none" stroke="#e8eef4" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width={ANCHO} height={ALTO} fill="url(#cuadricula)" />

          {/* El ejido municipal: la referencia contra la que se valida toda
              coordenada. Lo que cae afuera se descarta, no se guarda. */}
          <polygon points={contorno} fill="rgba(25,118,210,0.06)" stroke="#1976d2" strokeWidth="2" strokeDasharray="6 4" />
          <text x={MARGEN + 8} y={MARGEN + 20} className="mapa-etiqueta-ejido">
            Ejido municipal (referencia: capa KML de la Dirección de Ambiente)
          </text>

          {/* Un círculo por local. El radio crece un poco con la cantidad de
              actuaciones: los locales con más historial se ven primero. */}
          {conUbicacion.map((l) => {
            const [x, y] = proyectar(l.latitud, l.longitud);
            const r = 5 + Math.min(l.cantidadActuaciones, 6);
            return (
              <g key={l.id} onMouseEnter={() => setEncima(l)} onMouseLeave={() => setEncima(null)}>
                <circle
                  cx={x}
                  cy={y}
                  r={r}
                  fill={COLOR_HEX[l.estadoColor] ?? COLOR_HEX.gris}
                  fillOpacity="0.75"
                  stroke="#fff"
                  strokeWidth="1.5"
                  className="mapa-punto"
                />
                {/* El bloqueo manual se marca con un anillo: si no, un local
                    congelado parece uno normal. */}
                {l.bloqueado && <circle cx={x} cy={y} r={r + 4} fill="none" stroke="#37474f" strokeWidth="1.5" />}
              </g>
            );
          })}
        </svg>

        {/* Ficha al pasar el mouse. No se hace con <title> del SVG porque el
            tooltip nativo tarda un segundo en aparecer y no se puede estilar. */}
        {encima && (
          <div className="mapa-tooltip">
            <strong>{encima.nombreLocal}</strong>
            <span>{encima.direccion}</span>
            <BadgeEstado codigo={encima.estado} />
            <span className="texto-chico">
              {encima.rubro || 'sin rubro'} · {encima.cantidadActuaciones} actuación(es)
            </span>
            <Link to={`/locales/${encima.id}`}>Abrir ficha</Link>
          </div>
        )}
      </div>

      {/* ---------- Leyenda ---------- */}
      <div className="leyenda">
        {estadosPresentes.map((codigo) => (
          <span key={codigo}>
            <BadgeEstado codigo={codigo} />
            <small> {conUbicacion.filter((l) => l.estado === codigo).length}</small>
          </span>
        ))}
      </div>

      {/* ---------- Los que no se pueden dibujar ---------- */}
      {sinUbicacion.length > 0 && (
        <>
          <Aviso tipo="alerta" titulo={`${sinUbicacion.length} local(es) no aparecen en el mapa`}>
            No se pudo geocodificar su dirección. Quedan sin coordenada a propósito: no se les asigna un punto aproximado ni se usa
            la coordenada del relevamiento. <Link to="/herramientas/geocodificacion">Corregir direcciones</Link>.
          </Aviso>

          <ul className="lista-simple">
            {sinUbicacion.map((l) => (
              <li key={l.id}>
                <Link to={`/locales/${l.id}`} className="link-local">
                  {l.nombreLocal}
                </Link>
                <span className="texto-gris"> — {l.direccion}</span>
                <Badge color="gris">{l.motivoSinGeo}</Badge>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

export default Mapa;
