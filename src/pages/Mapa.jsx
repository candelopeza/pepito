/* ============================================================================
   pages/Mapa.jsx  —  MAPA DEL PADRÓN  (URL: /#/mapa)
   ----------------------------------------------------------------------------
   Los locales en el territorio, con código de colores por estado y los mismos
   filtros que el padrón (sección 6.1).

   >>> POR QUÉ LEAFLET Y NO GOOGLE MAPS <<<
   Porque Google Maps Platform exige una cuenta con tarjeta de crédito asociada
   al proyecto, y conseguir eso en un municipio suele llevar más que el
   desarrollo entero. Leaflet con OpenStreetMap no pide cuenta, no pide clave y
   no tiene costo.

   Además es lo que ya usa el municipio: el visor mapa.smt.gob.ar está hecho con
   Leaflet. Si mañana la Dirección de Innovación Tecnológica expone sus propias
   capas (calles, manzanas, barrios), se enchufan acá cambiando la URL del
   TileLayer, sin tocar nada más.

   >>> ESTE MAPA NECESITA INTERNET <<<
   Las baldosas vienen de los servidores de OpenStreetMap. Sin conexión el mapa
   queda gris y los puntos igual se dibujan, pero sin calles debajo.

   Antes esta pantalla era un SVG dibujado a mano justamente para no depender de
   internet, porque el build se arma en un solo archivo para abrirlo desde el
   disco (ver vite.config.js). Eso dejó de tener sentido cuando el front pasó a
   consumir la API: la aplicación ya necesita un servidor corriendo igual.

   >>> LOS PUNTOS SON LA COORDENADA DEL PADRÓN <<<
   La geocodificada desde la dirección. NUNCA la del relevamiento (sección 9.2).
   Los locales sin coordenada no se dibujan y se listan aparte: no se les pone
   un punto aproximado, porque un punto aproximado en un mapa se lee como un
   dato.
   ============================================================================ */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleMarker, MapContainer, Polygon, Popup, TileLayer, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import PageHeader from '../components/ui/PageHeader';
import Badge, { BadgeEstado } from '../components/ui/Badge';
import Grilla from '../components/ui/Grilla';
import Aviso from '../components/ui/Aviso';
import { CampoSelect } from '../components/ui/Campo';
import { useDatos } from '../datos/datosContexto';
import { LISTA_ESTADOS, colorEstado, etiquetaEstado } from '../dominio/estados';

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

/* El centro del ejido y el acercamiento inicial. 13 muestra la ciudad entera
   sin que los puntos se pisen. */
const CENTRO = [-26.8285, -65.2125];
const ZOOM = 13;

/* Radio del punto en píxeles. Chico a propósito: con casi dos mil locales, un
   marcador con forma de gota tapa el mapa entero y no se ve la distribución,
   que es justamente para lo que se usa esta pantalla. */
const RADIO = 5;

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
  const { localesConEstado, rubros, limiteMunicipal, limiteOficial } = useDatos();
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroRubro, setFiltroRubro] = useState('');

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
          `preferCanvas` dibuja los puntos en un canvas en vez de crear dos mil
          elementos SVG. Con este volumen es la diferencia entre un mapa que se
          mueve y uno que se traba al arrastrar. */}
      <div className="mapa-contenedor">
        <MapContainer center={CENTRO} zoom={ZOOM} className="mapa-leaflet" preferCanvas scrollWheelZoom>
          <TileLayer
            attribution='&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />

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

          {conUbicacion.map((local) => {
            const color = COLOR_HEX[colorEstado(local.estado)] ?? COLOR_HEX.gris;
            return (
              <CircleMarker
                key={local.id}
                center={[local.latitud, local.longitud]}
                radius={RADIO}
                pathOptions={{ color: '#fff', weight: 1, fillColor: color, fillOpacity: 0.9 }}
              >
                {/* El tooltip aparece al pasar por encima: permite barrer el
                    mapa sin tener que hacer clic en cada punto. */}
                <Tooltip direction="top" offset={[0, -4]}>
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
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      {/* ---------- Leyenda ---------- */}
      {estadosPresentes.length > 0 && (
        <div className="leyenda">
          {estadosPresentes.map((codigo) => (
            <span key={codigo}>
              <i
                className="mapa-punto-leyenda"
                style={{ background: COLOR_HEX[colorEstado(codigo)] ?? COLOR_HEX.gris }}
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
            la coordenada del relevamiento. <Link to="/herramientas/geocodificacion">Corregir direcciones</Link>.
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
    </>
  );
}

export default Mapa;
