/* ============================================================================
   pages/Mapa.jsx  —  MAPA DEL PADRÓN  (URL: /#/mapa)
   ----------------------------------------------------------------------------
   Los locales en el territorio, con código de colores por estado y los mismos
   filtros que el padrón (sección 6.1).

   >>> POR QUÉ LEAFLET Y NO GOOGLE MAPS <<<
   Porque Google Maps Platform exige una cuenta con tarjeta de crédito asociada
   al proyecto, y conseguir eso en un municipio suele llevar más que el
   desarrollo entero. Leaflet con baldosas libres no pide cuenta, no pide clave
   y no tiene costo.

   Además es lo que ya usa el municipio: el visor mapa.smt.gob.ar está hecho con
   Leaflet. Si mañana la Dirección de Innovación Tecnológica expone sus propias
   capas (calles, manzanas, barrios), se enchufan acá cambiando la URL de la
   capa, sin tocar nada más.

   >>> SE VE COMO EL MAPA DEL SISTEMA VIEJO, A PROPÓSITO <<<
   El área venía usando un mapa de Google: fondo claro con calles y nombres,
   botón Mapa / Satélite arriba a la izquierda, pantalla completa arriba a la
   derecha y un pin (la gota) por local con un color por situación. Acá se
   reproduce eso con capas libres, sin clave:
     Mapa      OpenStreetMap, el fondo de siempre: blanco, con calles y nombres.
     Satélite  World Imagery de Esri (ArcGIS Online), con las calles y los
               nombres de Esri encima, como la vista híbrida de Google.
   Se probaron otros dos fondos para "Mapa" y se descartaron: CARTO Voyager
   (el más parecido a Google) desde 2025 pide clave y sale con la marca
   "API KEY REQUIRED"; Esri World Street Map anda, pero tiene un fondo
   amarillento que el área no quiso.

   >>> ESTE MAPA NECESITA INTERNET <<<
   Las baldosas vienen de servidores externos. Sin conexión el mapa queda gris
   y los pines igual se dibujan, pero sin calles debajo.

   >>> LOS PINES SON LA COORDENADA DEL PADRÓN <<<
   La geocodificada desde la dirección. NUNCA la del relevamiento (sección 9.2).
   Los locales sin coordenada no se dibujan y se listan aparte: no se les pone
   un punto aproximado, porque un punto aproximado en un mapa se lee como un
   dato.
   ============================================================================ */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import { MapContainer, Marker, Polygon, Popup, TileLayer, Tooltip, ZoomControl, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import PageHeader from '../components/ui/PageHeader';
import Badge, { BadgeEstado } from '../components/ui/Badge';
import Grilla from '../components/ui/Grilla';
import Aviso from '../components/ui/Aviso';
import { CampoSelect } from '../components/ui/Campo';
import SeccionGeocodificacion from '../components/SeccionGeocodificacion';
import { useRol } from '../auth/rolContexto';
import { useDatos } from '../datos/datosContexto';
import { LISTA_ESTADOS, colorEstado, etiquetaEstado, grupoEstado } from '../dominio/estados';

/* ---------------------------------------------------------------- las capas
   Cada capa base trae sus baldosas y su atribución. La satelital lleva una
   segunda capa encima solo con los nombres de calles, para que se pueda leer
   dónde está cada pin. */
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const CAPAS = {
  mapa: {
    etiqueta: 'Mapa',
    baldosas: [
      {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      },
    ],
  },
  satelite: {
    etiqueta: 'Satélite',
    baldosas: [
      {
        url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
        attribution: 'Imágenes &copy; Esri, Maxar, Earthstar Geographics y la comunidad de usuarios de GIS',
        maxZoom: 19,
      },
      // Calles y nombres encima de la foto, como la vista híbrida de Google.
      { url: `${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`, attribution: '', maxZoom: 19 },
      { url: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, attribution: '', maxZoom: 19 },
    ],
  },
};

/* ---------------------------------------------------------------- los pines
   El color sale del estado, igual que la pastilla de la grilla: si el mapa y
   el padrón usaran colores distintos para lo mismo, el mapa dejaría de ser
   legible. Son los mismos tonos de los badges (App.css). */
const COLOR_HEX = {
  verde: '#2e7d32',
  naranja: '#ef6c00',
  azul: '#1565c0',
  amarillo: '#f9a825',
  rojo: '#c62828',
  gris: '#78909c',
};

/* La letra adentro del pin dice de qué se trata sin abrir la ficha: lo que
   en el mapa viejo eran los iconitos. Primero por estado puntual, después por
   grupo. */
const GLIFO_ESTADO = {
  EXENTO_CONFIRMADO: '✓',
  INACTIVO_CERRADO: '×',
  COMPLETAR_DATOS: '!',
  NOTIF1_NO_ENTREGADA: '!',
  NOTIF2_NO_ENTREGADA: '!',
  PRORROGA_VIGENTE: 'P',
  GENERAR_EXPEDIENTE: 'E',
};
const GLIFO_GRUPO = {
  documental: 'D',
  sancionatorio: 'E',
  cola_emision: 'N',
  en_tramite: 'N',
  entrega: 'N',
  cola_admin: 'R',
  bloqueo: '!',
  terminal: '•',
  transitorio: '…',
};

function glifoDe(codigo) {
  return GLIFO_ESTADO[codigo] ?? GLIFO_GRUPO[grupoEstado(codigo)] ?? '•';
}

function colorDe(codigo) {
  return COLOR_HEX[colorEstado(codigo)] ?? COLOR_HEX.gris;
}

/* Tamaño del pin en píxeles. Con casi dos mil locales, uno grande tapa el
   mapa; con este se ve la distribución y todavía se lee la letra. */
const ANCHO_PIN = 20;
const ALTO_PIN = Math.round((ANCHO_PIN * 38) / 28);

/* La gota, en SVG. Se usa en el mapa (como icono del marcador) y en la
   leyenda (achicada), así las dos son exactamente la misma figura. */
function svgPin(color, glifo, ancho = ANCHO_PIN) {
  const alto = Math.round((ancho * 38) / 28);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 38" width="${ancho}" height="${alto}" aria-hidden="true">
    <path d="M14 1C6.8 1 1 6.8 1 14c0 9.8 13 23 13 23s13-13.2 13-23C27 6.8 21.2 1 14 1z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
    <circle cx="14" cy="14" r="8.5" fill="#fff"/>
    <text x="14" y="18.2" text-anchor="middle" font-size="11.5" font-weight="700" fill="${color}" font-family="system-ui, Segoe UI, Roboto, sans-serif">${glifo}</text>
  </svg>`;
}

/* Un icono de Leaflet por combinación color+glifo, no uno por local: con dos
   mil pines, crear dos mil iconos iguales es tirar memoria. */
const iconos = new Map();
function iconoDe(codigo) {
  const color = colorDe(codigo);
  const glifo = glifoDe(codigo);
  const clave = `${color}|${glifo}`;
  if (!iconos.has(clave)) {
    iconos.set(
      clave,
      L.divIcon({
        className: 'mapa-pin',
        html: svgPin(color, glifo),
        iconSize: [ANCHO_PIN, ALTO_PIN],
        iconAnchor: [ANCHO_PIN / 2, ALTO_PIN - 1], // la punta de la gota es la coordenada
        popupAnchor: [0, -(ALTO_PIN - 3)],
        tooltipAnchor: [0, -(ALTO_PIN - 6)],
      }),
    );
  }
  return iconos.get(clave);
}

/* El centro del ejido y el acercamiento inicial. 13 muestra la ciudad entera. */
const CENTRO = [-26.8285, -65.2125];
const ZOOM = 13;

/* Leaflet mide su caja una sola vez, al montarse. Al entrar o salir de
   pantalla completa la caja cambia de tamaño y hay que avisarle, si no deja
   medio mapa gris. */
function AjustarAlTamano() {
  const mapa = useMap();
  useEffect(() => {
    const ajustar = () => setTimeout(() => mapa.invalidateSize(), 50);
    document.addEventListener('fullscreenchange', ajustar);
    return () => document.removeEventListener('fullscreenchange', ajustar);
  }, [mapa]);
  return null;
}

/* Los locales que no entraron al mapa. Van en la misma tabla que el resto del
   sistema: con 253 registros, una lista suelta no se puede ni buscar ni
   exportar para repartir el trabajo de corrección. */
const COLUMNAS_SIN_UBICACION = [
  { field: 'id', headerName: 'N°', width: 80 },
  {
    field: 'nombreLocal',
    headerName: 'Local',
    flex: 1,
    minWidth: 200,
    renderCell: ({ row }) => (
      <Link to={`/locales/${row.id}`} className="link-local">
        {row.nombreLocal}
      </Link>
    ),
  },
  { field: 'direccion', headerName: 'Dirección declarada', flex: 1.2, minWidth: 220 },
  {
    field: 'motivoSinGeo',
    headerName: 'Por qué no se pudo ubicar',
    flex: 1,
    minWidth: 220,
    renderCell: ({ row }) => <Badge color="gris">{row.motivoSinGeo}</Badge>,
  },
  {
    field: 'estado',
    headerName: 'Estado',
    width: 210,
    renderCell: ({ row }) => <BadgeEstado codigo={row.estado} />,
  },
];

function Mapa() {
  const { localesConEstado, rubros, limiteMunicipal } = useDatos();
  const { rol } = useRol();
  // La corrección de ubicaciones es de la oficina: para el resto, el mapa es
  // solo de consulta y la sección no aparece.
  const puedeCorregir = ['administrativo', 'coordinacion', 'administrador'].includes(rol);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroRubro, setFiltroRubro] = useState('');
  const [capa, setCapa] = useState('mapa');
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const contenedor = useRef(null);

  useEffect(() => {
    const alCambiar = () => setPantallaCompleta(document.fullscreenElement === contenedor.current);
    document.addEventListener('fullscreenchange', alCambiar);
    return () => document.removeEventListener('fullscreenchange', alCambiar);
  }, []);

  function alternarPantallaCompleta() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else contenedor.current?.requestFullscreen?.();
  }

  const filtrados = useMemo(
    () =>
      localesConEstado.filter(
        (l) =>
          // Los cerrados (el comercio cerró) no van al mapa, salvo que se los pida por estado.
          (l.estado !== 'INACTIVO_CERRADO' || filtroEstado === 'INACTIVO_CERRADO') &&
          (!filtroEstado || l.estado === filtroEstado) &&
          (!filtroRubro || l.rubro === filtroRubro),
      ),
    [localesConEstado, filtroEstado, filtroRubro],
  );

  const conUbicacion = useMemo(() => filtrados.filter((l) => !l.sinGeo), [filtrados]);
  const sinUbicacion = useMemo(() => filtrados.filter((l) => l.sinGeo), [filtrados]);

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

      {/* ---------- El mapa ----------
          Los botones Mapa / Satélite y el de pantalla completa van por fuera
          del MapContainer, encima: son de esta pantalla, no de Leaflet. El
          zoom se corre abajo a la derecha para no pisarlos. */}
      <div className={`mapa-contenedor${pantallaCompleta ? ' mapa-contenedor-completa' : ''}`} ref={contenedor}>
        <div className="mapa-capas" role="group" aria-label="Tipo de mapa">
          {Object.entries(CAPAS).map(([id, c]) => (
            <button
              key={id}
              type="button"
              className={id === capa ? 'activa' : ''}
              aria-pressed={id === capa}
              onClick={() => setCapa(id)}
            >
              {c.etiqueta}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="mapa-pantalla-completa"
          onClick={alternarPantallaCompleta}
          title={pantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'}
          aria-label={pantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#444" aria-hidden="true">
            {pantallaCompleta ? (
              <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
            ) : (
              <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
            )}
          </svg>
        </button>

        <MapContainer center={CENTRO} zoom={ZOOM} className="mapa-leaflet" zoomControl={false} scrollWheelZoom>
          <ZoomControl position="bottomright" />
          <AjustarAlTamano />

          {CAPAS[capa].baldosas.map((b) => (
            <TileLayer key={`${capa}-${b.url}`} {...b} />
          ))}

          {/* El ejido municipal. Viene del backend, que es el mismo polígono
              contra el que se valida cada coordenada: si el front dibujara su
              propia copia, el día que se cargue el KML oficial el mapa mostraría
              un límite y el sistema validaría contra otro. */}
          {limiteMunicipal.length > 0 && (
            <Polygon
              positions={limiteMunicipal}
              pathOptions={{ color: '#1565c0', weight: 2, fillOpacity: 0.04, dashArray: '6 4' }}
            />
          )}

          {conUbicacion.map((local) => (
            <Marker key={local.id} position={[local.latitud, local.longitud]} icon={iconoDe(local.estado)}>
              {/* El tooltip aparece al pasar por encima: permite barrer el
                  mapa sin tener que hacer clic en cada pin. */}
              <Tooltip direction="top">
                <strong>{local.nombreLocal}</strong>
                <br />
                {etiquetaEstado(local.estado)}
              </Tooltip>

              <Popup>
                <div className="mapa-popup">
                  <strong>{local.nombreLocal}</strong>
                  <span>{local.razonSocial || 'Sin razón social'}</span>
                  <span>{local.direccion}</span>
                  <BadgeEstado codigo={local.estado} />
                  {local.plazo && (
                    <span className={local.plazo.vencido ? 'texto-vencido' : ''}>
                      {local.plazo.vencido ? 'Plazo vencido' : `Vence en ${local.diasRestantes} día(s)`}
                    </span>
                  )}
                  <Link to={`/locales/${local.id}`} className="link-local">
                    Abrir la ficha del local →
                  </Link>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* ---------- Leyenda: el mismo pin que en el mapa, achicado ---------- */}
      {estadosPresentes.length > 0 && (
        <div className="leyenda">
          {estadosPresentes.map((codigo) => (
            <span key={codigo}>
              <i
                className="mapa-pin-leyenda"
                // El SVG lo arma este archivo con el color y la letra del estado: no entra texto de afuera.
                dangerouslySetInnerHTML={{ __html: svgPin(colorDe(codigo), glifoDe(codigo), 14) }}
              />
              {etiquetaEstado(codigo)}
            </span>
          ))}
        </div>
      )}

      {/* ---------- Los que no se pudieron ubicar ---------- */}
      {sinUbicacion.length > 0 && (
        <>
          <Aviso tipo="alerta" titulo={`${sinUbicacion.length} local(es) no aparecen en el mapa`}>
            No se pudo geocodificar su dirección. Quedan sin coordenada a propósito: no se les asigna un punto aproximado ni se usa
            la coordenada del relevamiento.{puedeCorregir ? ' La corrección está acá abajo, en Geocodificación pendiente.' : ''}
          </Aviso>

          <Grilla
            filas={sinUbicacion}
            columnas={COLUMNAS_SIN_UBICACION}
            nombreArchivo="locales-sin-ubicacion"
            vacio="Todos los locales del filtro tienen ubicación."
            alto="auto"
          />
        </>
      )}

      {/* ---------- La corrección, en la misma pantalla que el problema ----------
          Antes era la pestaña Herramientas → Geocodificación pendiente. */}
      {puedeCorregir && <SeccionGeocodificacion />}
    </>
  );
}

export default Mapa;
