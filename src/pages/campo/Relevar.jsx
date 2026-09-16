/* ============================================================================
   pages/campo/Relevar.jsx  —  FORMULARIO DE CAMPO  (URL: /#/campo/relevar)
   ----------------------------------------------------------------------------
   Sección 6.2 del pliego. Es la pantalla que usa el agente en la calle, con el
   celular. Está pensada para eso: campos grandes, pocos, y todo en una vista.

   >>> LO QUE ESTE FORMULARIO *NO* PIDE, Y ES A PROPÓSITO <<<
   No pide CUIT ni razón social. Los relevadores NO tienen facultades de
   inspector y no están autorizados a requerirle esa información al
   comerciante. Los datos registrales los obtiene la oficina de la constancia
   de inscripción fiscal. Si alguien agrega esos campos acá, le está pidiendo
   al agente que haga algo que no puede hacer.

   LO QUE CAPTURA SOLO: fecha, hora, coordenadas del dispositivo y usuario.

   >>> LA COORDENADA QUE CAPTURA NO ES LA UBICACIÓN DEL LOCAL <<<
   Es una métrica del trabajo de campo. Aunque el relevamiento deba hacerse en
   el lugar, en la práctica la carga se completa fuera, así que este dato no es
   confiable como ubicación del establecimiento. La ubicación oficial se obtiene
   después, geocodificando la dirección declarada. El sistema NO copia una sobre
   la otra bajo ninguna circunstancia.

   TRABAJO SIN CONEXIÓN (requisito no negociable): los agentes relevan en zonas
   sin cobertura. Acá está simulado con la cola de pendientes de abajo, que
   muestra cuántos registros quedan sin sincronizar. En la app real esa cola va
   en IndexedDB y se sincroniza al recuperar señal, conservando la fecha y la
   coordenada del MOMENTO DEL GUARDADO, no las de la sincronización.
   ============================================================================ */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Campo, { CampoSelect, CampoTexto } from '../../components/ui/Campo';
import Aviso from '../../components/ui/Aviso';
import Badge from '../../components/ui/Badge';
import { useDatos } from '../../datos/datosContexto';
import { useRol } from '../../auth/rolContexto';
import { CLASIFICACIONES } from '../../config/catalogos';
import { fmtFechaHora } from '../../dominio/fechas';

function Relevar() {
  const navegar = useNavigate();
  const { usuario } = useRol();
  const { rubros, crearRelevamiento } = useDatos();

  const [datos, setDatos] = useState({
    direccionRelevada: '',
    nombreLocal: '',
    rubro: '',
    clasificacion: '',
    observaciones: '',
  });
  const [errores, setErrores] = useState({});
  // El estado arranca resuelto si el navegador no tiene geolocalización: así
  // no hace falta un setState dentro del efecto solo para decir eso.
  const [gps, setGps] = useState(() => ({
    estado: navigator.geolocation ? 'buscando' : 'no-disponible',
    latitud: null,
    longitud: null,
  }));
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  // Cola de lo cargado en esta sesión, para mostrar el comportamiento offline.
  const [cola, setCola] = useState([]);

  const cambiar = (campo, valor) => setDatos((p) => ({ ...p, [campo]: valor }));

  /* ---------- Estado de la conexión ----------
     El agente tiene que VER si está sin señal: si no, no entiende por qué lo
     que cargó "no aparece" en la oficina. */
  useEffect(() => {
    const arriba = () => setEnLinea(true);
    const abajo = () => setEnLinea(false);
    window.addEventListener('online', arriba);
    window.addEventListener('offline', abajo);
    return () => {
      window.removeEventListener('online', arriba);
      window.removeEventListener('offline', abajo);
    };
  }, []);

  /* ---------- Captura del GPS ----------
     Si el usuario no da permiso, queda SIN coordenada (null), no en "0,0".
     El sistema viejo guarda "0,0" y después ese valor se confunde con una
     ubicación real en el medio del Golfo de Guinea. */
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setGps({
          estado: 'ok',
          latitud: Number(pos.coords.latitude.toFixed(6)),
          longitud: Number(pos.coords.longitude.toFixed(6)),
        }),
      () => setGps({ estado: 'sin-permiso', latitud: null, longitud: null }),
      { timeout: 8000 },
    );
  }, []);

  function validar() {
    const e = {};
    if (!datos.direccionRelevada.trim()) e.direccionRelevada = 'La dirección es obligatoria: de acá sale la ubicación del local.';
    if (!datos.nombreLocal.trim()) e.nombreLocal = 'El nombre del local es obligatorio.';
    if (!datos.rubro) e.rubro = 'Elegí el rubro.';
    if (!datos.clasificacion) e.clasificacion = 'Clasificá el local: es la decisión central del relevamiento.';
    return e;
  }

  function guardar(ev) {
    ev.preventDefault();
    const encontrados = validar();
    setErrores(encontrados);
    if (Object.keys(encontrados).length) return;

    crearRelevamiento({
      ...datos,
      latitud: gps.latitud,
      longitud: gps.longitud,
      offline: !enLinea,
    });

    setCola((c) => [
      { id: Date.now(), nombre: datos.nombreLocal, momento: new Date().toISOString(), offline: !enLinea },
      ...c,
    ]);

    // Se limpia para el siguiente: en la calle se cargan varios seguidos.
    setDatos({ direccionRelevada: '', nombreLocal: '', rubro: '', clasificacion: '', observaciones: '' });
  }

  const clasificacionElegida = CLASIFICACIONES.find((c) => c.id === datos.clasificacion);

  return (
    <>
      <PageHeader etiqueta="CAMPO" titulo="NUEVO RELEVAMIENTO" botonVolver />

      {/* ---------- Estado del dispositivo ---------- */}
      <div className="campo-estado">
        <span>
          {enLinea ? <Badge color="verde">Con conexión</Badge> : <Badge color="naranja">Sin conexión</Badge>}
        </span>
        <span>
          {gps.estado === 'ok' && <Badge color="verde">GPS: {gps.latitud}, {gps.longitud}</Badge>}
          {gps.estado === 'buscando' && <Badge color="azul">Buscando GPS...</Badge>}
          {gps.estado === 'sin-permiso' && <Badge color="amarillo">Sin permiso de GPS</Badge>}
          {gps.estado === 'no-disponible' && <Badge color="gris">GPS no disponible</Badge>}
        </span>
        <span className="texto-gris">Releva: {usuario.nombre}</span>
      </div>

      {!enLinea && (
        <Aviso tipo="alerta" titulo="Estás sin conexión">
          Podés seguir cargando: los relevamientos se guardan en el dispositivo y se sincronizan cuando vuelva la señal, con la
          fecha y la coordenada del momento en que los guardaste.
        </Aviso>
      )}
      {/* ---------- El formulario ---------- */}
      <form className="formulario formulario-campo" onSubmit={guardar} noValidate autoComplete="off">
        <Campo
          id="rel-direccion"
          etiqueta="Dirección relevada"
          valor={datos.direccionRelevada}
          onChange={(v) => cambiar('direccionRelevada', v)}
          error={errores.direccionRelevada}
        />
        <Campo
          id="rel-nombre"
          etiqueta="Nombre del local"
          valor={datos.nombreLocal}
          onChange={(v) => cambiar('nombreLocal', v)}
          error={errores.nombreLocal}
        />
        <CampoSelect
          id="rel-rubro"
          etiqueta="Rubro"
          valor={datos.rubro}
          onChange={(v) => cambiar('rubro', v)}
          opciones={rubros.map((r) => ({ id: r.nombre, etiqueta: r.nombre }))}
          error={errores.rubro}
        />
        <CampoSelect
          id="rel-clasificacion"
          etiqueta="Clasificación"
          valor={datos.clasificacion}
          onChange={(v) => cambiar('clasificacion', v)}
          opciones={CLASIFICACIONES.map((c) => ({ id: c.id, etiqueta: c.etiqueta }))}
          error={errores.clasificacion}
          ayuda={clasificacionElegida?.descripcion}
        />
        <CampoTexto
          id="rel-obs"
          etiqueta="Observaciones"
          valor={datos.observaciones}
          onChange={(v) => cambiar('observaciones', v)}
        />

        <div className="form-acciones">
          <button type="submit" className="btn-primario">
            Guardar relevamiento
          </button>
          <button type="button" className="btn-secundario" onClick={() => navegar('/relevamientos')}>
            Ver los relevamientos
          </button>
        </div>
      </form>

      {/* ---------- Cola de esta sesión ---------- */}
      {cola.length > 0 && (
        <>
          <div className="accesos-header">
            <span>Cargados en esta sesión ({cola.length})</span>
          </div>
          <ul className="lista-cola">
            {cola.map((c) => (
              <li key={c.id}>
                <strong>{c.nombre}</strong>
                <span>{fmtFechaHora(c.momento)}</span>
                {c.offline ? <Badge color="naranja">Pendiente de sincronizar</Badge> : <Badge color="verde">Sincronizado</Badge>}
              </li>
            ))}
          </ul>
          <p className="texto-chico">
            Podés editar tus propias cargas solo durante la jornada en que las hiciste. Vencida esa ventana, la corrección la hace
            la oficina (sección 6.2).
          </p>
        </>
      )}
    </>
  );
}

export default Relevar;
