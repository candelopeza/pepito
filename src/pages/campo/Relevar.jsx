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

   >>> LA COORDENADA Y LA HORA SON LAS DEL MOMENTO DE GUARDAR <<<
   El GPS se sigue mientras el formulario está abierto (watchPosition) y al
   guardar se usa la última posición, si tiene menos de dos minutos. Antes se
   tomaba una sola vez al abrir la pantalla: cinco locales relevados caminando
   quedaban con la coordenada del primero. Si no hay una posición reciente, la
   carga sale SIN coordenada, no con una vieja. La hora la pone el store al
   guardar (datos/DatosProvider.jsx → crearRelevamiento).

   TRABAJO SIN CONEXIÓN (requisito no negociable): si no hay señal, la carga
   queda guardada en el teléfono (datos/colaSinConexion.js) y se envía sola al
   volver la conexión, con la fecha y la coordenada del momento del guardado.
   La lista de abajo muestra qué pasó con cada carga.
   ============================================================================ */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Campo, { CampoSelect, CampoTexto } from '../../components/ui/Campo';
import Aviso from '../../components/ui/Aviso';
import Badge from '../../components/ui/Badge';
import { useDatos } from '../../datos/datosContexto';
import { useRol } from '../../auth/rolContexto';
import { CLASIFICACIONES } from '../../config/catalogos';
import { fmtFechaHora, hoyISO } from '../../dominio/fechas';

/* Hasta qué antigüedad sirve la última posición del GPS al guardar. */
const POSICION_RECIENTE_MS = 2 * 60 * 1000;

const VACIO = { direccionRelevada: '', nombreLocal: '', rubro: '', clasificacion: '', observaciones: '' };

function Relevar() {
  const navegar = useNavigate();
  const { usuario } = useRol();
  const {
    rubros,
    relevamientos,
    localPorId,
    crearRelevamiento,
    editarRelevamiento,
    pendientesSinConexion = [],
    descartarPendiente,
  } = useDatos();
  // El relevamiento que se está corrigiendo (sus cargas del día). null = carga nueva.
  const [corrigiendo, setCorrigiendo] = useState(null);

  const [datos, setDatos] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);
  // El estado arranca resuelto si el navegador no tiene geolocalización: así
  // no hace falta un setState dentro del efecto solo para decir eso.
  const [gps, setGps] = useState(() => ({
    estado: navigator.geolocation ? 'buscando' : 'no-disponible',
    latitud: null,
    longitud: null,
    momento: 0,
  }));
  // La última posición, también en una ref: guardar() la lee en el momento
  // exacto del clic, sin esperar a un render.
  const ultimaPosicion = useRef(null);
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  // Lo cargado en esta sesión y qué pasó con cada carga.
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

  /* ---------- Seguimiento del GPS ----------
     Si el usuario no da permiso, queda SIN coordenada (null), no en "0,0".
     El sistema viejo guarda "0,0" y después ese valor se confunde con una
     ubicación real en el medio del Golfo de Guinea. El GPS funciona sin
     señal de datos: no depende de la conexión. */
  useEffect(() => {
    if (!navigator.geolocation) return undefined;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const nueva = {
          estado: 'ok',
          latitud: Number(pos.coords.latitude.toFixed(6)),
          longitud: Number(pos.coords.longitude.toFixed(6)),
          momento: Date.now(),
        };
        ultimaPosicion.current = nueva;
        setGps(nueva);
      },
      (err) =>
        setGps((g) => ({
          ...g,
          estado: err.code === err.PERMISSION_DENIED ? 'sin-permiso' : g.estado === 'ok' ? 'ok' : 'sin-senal',
        })),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  function validar() {
    const e = {};
    if (!datos.direccionRelevada.trim()) e.direccionRelevada = 'La dirección es obligatoria: de acá sale la ubicación del local.';
    if (!datos.nombreLocal.trim()) e.nombreLocal = 'El nombre del local es obligatorio.';
    if (!datos.rubro) e.rubro = 'Elegí el rubro.';
    if (!datos.clasificacion) e.clasificacion = 'Clasificá el local: es la decisión central del relevamiento.';
    return e;
  }

  async function guardar(ev) {
    ev.preventDefault();
    const encontrados = validar();
    setErrores(encontrados);
    if (Object.keys(encontrados).length) return;

    // La posición del momento del guardado, si es reciente. Si no, sin coordenada.
    const pos = ultimaPosicion.current;
    const reciente = pos && Date.now() - pos.momento <= POSICION_RECIENTE_MS;

    setGuardando(true);
    // El rubro va con su número de catálogo (y el nombre, por las dudas).
    const rubroId = rubros.find((r) => r.nombre === datos.rubro)?.id ?? null;
    if (corrigiendo) {
      // Corregir una carga del día no cambia la coordenada ni la hora: esas
      // son las del momento en que se hizo el relevamiento.
      const ok = await editarRelevamiento(corrigiendo.id, { ...datos, rubroId });
      setGuardando(false);
      if (!ok) return;
      setCorrigiendo(null);
      setDatos(VACIO);
      return;
    }
    const resultado = await crearRelevamiento({
      ...datos,
      rubroId,
      latitud: reciente ? pos.latitud : null,
      longitud: reciente ? pos.longitud : null,
      offline: !enLinea,
    });
    setGuardando(false);

    // Si el servidor lo rechazó, el cartel dice por qué y el formulario queda
    // como estaba para corregirlo. Antes se limpiaba igual y la carga se perdía.
    if (!resultado) return;

    setCola((c) => [
      { id: Date.now(), nombre: datos.nombreLocal, momento: new Date().toISOString(), idCola: resultado.idCola ?? null },
      ...c,
    ]);

    // Se limpia para el siguiente: en la calle se cargan varios seguidos.
    setDatos(VACIO);
  }

  const clasificacionElegida = CLASIFICACIONES.find((c) => c.id === datos.clasificacion);

  /* MIS CARGAS DE HOY (sección 6.2): las propias, del día y todavía sin
     control de coordinación. Son las únicas que el agente puede corregir; el
     servidor controla lo mismo. Hace falta haber entrado como un agente de la
     base (selector "firmar como" de la barra): con el usuario de prueba no hay
     forma de saber de quién es cada carga. */
  const hoy = hoyISO();
  const misCargasDeHoy = usuario.id
    ? relevamientos.filter((r) => r.idUsuario === usuario.id && String(r.fechaHora ?? '').slice(0, 10) === hoy && !r.revisadoEn)
    : [];

  function corregir(r) {
    const local = localPorId(r.localId);
    setErrores({});
    setCorrigiendo(r);
    setDatos({
      direccionRelevada: r.direccionRelevada ?? '',
      nombreLocal: local?.nombreLocal ?? '',
      rubro: local?.rubro && local.rubro !== 'SIN INFORMAR' ? local.rubro : '',
      clasificacion: r.clasificacion ?? '',
      observaciones: r.observaciones ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const enElTelefono = pendientesSinConexion.filter((p) => p.tipo === 'relevamiento');
  // Qué pasó con cada carga que quedó en el teléfono, por su id en la cola.
  const enCola = new Map(enElTelefono.map((p) => [p.id, p]));

  return (
    <>
      <PageHeader etiqueta="CAMPO" titulo={corrigiendo ? 'CORREGIR RELEVAMIENTO' : 'NUEVO RELEVAMIENTO'} botonVolver />

      {/* ---------- Estado del dispositivo ---------- */}
      <div className="campo-estado">
        <span>
          {enLinea ? <Badge color="verde">Con conexión</Badge> : <Badge color="naranja">Sin conexión</Badge>}
        </span>
        <span>
          {gps.estado === 'ok' && <Badge color="verde">GPS: {gps.latitud}, {gps.longitud}</Badge>}
          {gps.estado === 'buscando' && <Badge color="azul">Buscando GPS...</Badge>}
          {gps.estado === 'sin-senal' && <Badge color="amarillo">GPS sin señal: se guarda sin coordenada</Badge>}
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
          <button type="submit" className="btn-primario" disabled={guardando}>
            {guardando ? 'Guardando…' : corrigiendo ? 'Guardar corrección' : 'Guardar relevamiento'}
          </button>
          {corrigiendo && (
            <button
              type="button"
              className="btn-secundario"
              onClick={() => {
                setCorrigiendo(null);
                setDatos(VACIO);
              }}
            >
              Cancelar la corrección
            </button>
          )}
          <button type="button" className="btn-secundario" onClick={() => navegar('/relevamientos')}>
            Ver los relevamientos
          </button>
        </div>
      </form>

      {/* ---------- Mis cargas de hoy: las que todavía puedo corregir ---------- */}
      {misCargasDeHoy.length > 0 && (
        <>
          <div className="accesos-header">
            <span>Mis cargas de hoy ({misCargasDeHoy.length})</span>
          </div>
          <ul className="lista-cola">
            {misCargasDeHoy.map((r) => (
              <li key={r.id}>
                <strong>{localPorId(r.localId)?.nombreLocal ?? r.direccionRelevada}</strong>
                <span>{fmtFechaHora(r.fechaHora)}</span>
                <button type="button" className="btn-tabla" onClick={() => corregir(r)}>
                  Corregir
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ---------- Guardados en el teléfono que el servidor rechazó ----------
          Quedan acá para que el agente vea por qué y decida. No traban al resto. */}
      {enElTelefono.some((p) => p.rechazado) && (
        <>
          <div className="accesos-header">
            <span>No se aceptaron</span>
          </div>
          <ul className="lista-cola">
            {enElTelefono
              .filter((p) => p.rechazado)
              .map((p) => (
                <li key={p.id}>
                  <strong>{p.etiqueta}</strong>
                  <span>{fmtFechaHora(p.creado)}</span>
                  <Badge color="rojo">{p.error}</Badge>
                  <button type="button" className="btn-tabla" onClick={() => descartarPendiente(p.id)}>
                    Descartar
                  </button>
                </li>
              ))}
          </ul>
        </>
      )}

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
                {c.idCola && enCola.get(c.idCola)?.rechazado ? (
                  <Badge color="rojo">No se aceptó</Badge>
                ) : c.idCola && enCola.has(c.idCola) ? (
                  <Badge color="naranja">Pendiente de sincronizar</Badge>
                ) : (
                  <Badge color="verde">Sincronizado</Badge>
                )}
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
