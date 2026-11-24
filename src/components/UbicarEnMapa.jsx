/* ============================================================================
   UbicarEnMapa.jsx  —  PONER A MANO LA UBICACIÓN DE UN LOCAL
   ----------------------------------------------------------------------------
   (24/11/2026) Desde que el geocodificador solo acepta un punto cuando el
   mapa tiene ESA altura en ESA calle (backend/geocodificador.js), muchas
   direcciones quedan sin ubicación: OpenStreetMap tiene pocas alturas
   cargadas en Tucumán. Antes se guardaba igual un punto de la calle (toda la
   avenida Belgrano terminaba en la Belgrano 2642). Ahora la oficina lo ubica
   a mano: clic en el mapa donde está el local, y guardar.

   La coordenada se guarda con POST /herramientas/coordenadas/aplicar, que
   vuelve a validar que caiga dentro del ejido. Es una ubicación OFICIAL
   puesta por una persona, no la coordenada del relevamiento (que nunca se
   copia al padrón).

   La vista satélite ayuda a reconocer el edificio; la de calles, a leer los
   nombres y las alturas de las esquinas.
   ============================================================================ */

import { useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, ZoomControl, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import Modal from './ui/Modal';
import Aviso from './ui/Aviso';
import { api } from '../datos/api';
import { useDatos } from '../datos/datosContexto';

const CENTRO = [-26.8285, -65.2125];
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';

function AlHacerClic({ onClic }) {
  useMapEvents({ click: (e) => onClic([Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))]) });
  return null;
}

function UbicarEnMapa({ local, onCerrar }) {
  const { recargar } = useDatos();
  const [punto, setPunto] = useState(
    local.latitud !== null && local.longitud !== null ? [local.latitud, local.longitud] : null,
  );
  const [satelite, setSatelite] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function guardar() {
    if (!punto) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await api.aplicarCoordenadas([{ id: local.id, latitud: punto[0], longitud: punto[1] }]);
      if (r.rechazados?.length) {
        setError(r.rechazados[0].motivo);
        return;
      }
      await recargar();
      onCerrar();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal abierto etiqueta="UBICACIÓN" titulo={`Ubicar en el mapa: ${local.nombreLocal}`} ancho="ancho" onCerrar={onCerrar}>
      <p className="texto-explicacion">
        Dirección declarada: <strong>{local.direccion || 'sin dirección'}</strong>. Hacé clic en el mapa donde está el local
        (podés acercar con la rueda del mouse). El punto se puede mover haciendo clic en otro lugar.
      </p>
      <label className="texto-explicacion" style={{ display: 'block' }}>
        <input type="checkbox" checked={satelite} onChange={(e) => setSatelite(e.target.checked)} /> Vista satélite
      </label>

      <div style={{ height: 420, borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
        <MapContainer center={punto ?? CENTRO} zoom={punto ? 17 : 14} style={{ height: '100%' }} zoomControl={false} scrollWheelZoom>
          <ZoomControl position="bottomright" />
          {satelite ? (
            <>
              <TileLayer url={`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`} attribution="Imágenes &copy; Esri" maxZoom={19} />
              <TileLayer url={`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`} maxZoom={19} />
            </>
          ) : (
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              maxZoom={19}
            />
          )}
          <AlHacerClic onClic={setPunto} />
          {punto && <CircleMarker center={punto} radius={9} pathOptions={{ color: '#c62828', fillColor: '#c62828', fillOpacity: 0.8 }} />}
        </MapContainer>
      </div>

      {error && <Aviso tipo="alerta" titulo="No se guardó la ubicación">{error}</Aviso>}

      <div className="form-acciones">
        <button type="button" className="btn-primario" onClick={guardar} disabled={!punto || guardando}>
          {guardando ? 'Guardando…' : punto ? `Guardar ubicación (${punto[0]}, ${punto[1]})` : 'Hacé clic en el mapa'}
        </button>
        <button type="button" className="btn-secundario" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </Modal>
  );
}

export default UbicarEnMapa;
