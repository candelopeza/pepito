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
import { LISTA_ESTADOS, etiquetaEstado } from '../dominio/estados';

/* Los colores de los badges, para que el punto del mapa y la pastilla de la
   grilla sean del mismo color. Si divergen, el mapa deja de ser legible. */
/* >>> UN COLOR POR ESTADO, NO POR GRUPO <<<
   Los badges usan seis colores por familia, y en el mapa eso dejaba cuatro
   verdes y tres rojos imposibles de distinguir. Acá cada estado tiene SU
   color, elegido a mano para que se separen bien sobre el fondo claro de
   OpenStreetMap. Las variantes de una misma entrega (entregada / sin firma /
   fijada) comparten la familia con tonos escalonados: son la misma situación
   operativa y casi nunca conviven en cantidad; todo lo demás es distinto
   entre sí. Para cambiar un color se cambia acá, y la leyenda lo toma sola. */
const COLOR_POR_ESTADO = {
  // el padrón
  REVISION_DATOS: '#9a6324', // marrón
  COMPLETAR_DATOS: '#f032e6', // magenta
  // exentos y cerrados
  EXENTO_REVISION: '#4363d8', // azul
  EXENTO_CONFIRMADO: '#000075', // azul marino
  INACTIVO_CERRADO: '#a9a9a9', // gris
  // documental (cumple)
  CONTRATO_VIGENTE: '#2e7d32', // verde
  CONTRATO_9DJ: '#469990', // verde azulado
  DDJJ_VIGENTE: '#9acd32', // lima
  DDJJ_RECICLAJE: '#556b2f', // oliva
  PRESENTACION_EN_REVISION: '#26c6da', // celeste
  // primera notificación (amarillos y naranjas)
  NOTIF1_PENDIENTE: '#ffd600',
  NOTIF1_GENERADA: '#ffab00',
  NOTIF1_ENTREGADA: '#f57c00',
  NOTIF1_SIN_FIRMA: '#ef6c00',
  NOTIF1_FIJADA: '#e65100',
  NOTIF1_NO_ENTREGADA: '#bf360c', // ladrillo
  // segunda notificación (rosas y vinos)
  NOTIF2_PENDIENTE: '#f48fb1',
  NOTIF2_GENERADA: '#ec407a',
  NOTIF2_ENTREGADA: '#c2185b',
  NOTIF2_SIN_FIRMA: '#ad1457',
  NOTIF2_FIJADA: '#880e4f',
  NOTIF2_NO_ENTREGADA: '#560027', // vino
  // sancionatorio
  PRORROGA_VIGENTE: '#8e24aa', // violeta
  GENERAR_EXPEDIENTE: '#e6194b', // rojo frambuesa
  EXPEDIENTE_SOLICITADO: '#b71c1c', // rojo oscuro
  EXPEDIENTE: '#000000', // negro
};
const COLOR_DESCONOCIDO = '#78909c';
const colorDeEstado = (codigo) => COLOR_POR_ESTADO[codigo] ?? COLOR_DESCONOCIDO;

/* El centro del ejido y el acercamiento inicial. 13 muestra la ciudad entera
   sin que los puntos se pisen. */
const CENTRO = [-26.8285, -65.2125];
const ZOOM = 13;

/* Radio del punto en píxeles. Chico a propósito: con casi dos mil locales, un
   marcador con forma de gota tapa el mapa entero y no se ve la distribución,
   que es justamente para lo que se usa esta pantalla. */
const RADIO = 6;

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
        (l) => (!filtroEstado || l.estado === filtroEstado) && (!filtroRubro || l.rubro === filtroRubro),
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
            const color = colorDeEstado(local.estado);
            return (
              <CircleMarker
                key={local.id}
                center={[local.latitud, local.longitud]}
                radius={RADIO}
                /* Borde oscuro y no blanco: los colores claros (amarillo, lima,
                   rosa) se recortan contra el fondo claro del mapa. */
                pathOptions={{ color: '#37474f', weight: 1, fillColor: color, fillOpacity: 0.95 }}
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
                style={{ background: colorDeEstado(codigo) }}
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
