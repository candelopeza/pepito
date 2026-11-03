/* ============================================================================
   datos/DatosProvider.jsx  —  EL STORE. TODO LO QUE MODIFICA DATOS PASA POR ACÁ
   ----------------------------------------------------------------------------
   >>> AHORA HABLA CON EL BACKEND <<<
   Antes este archivo ERA el backend: guardaba todo en localStorage con los
   datos de prueba de semilla.js. Hoy lee y escribe contra la API
   (backend/, Node + Express sobre MariaDB), y es el ÚNICO archivo del front
   que cambió: las 29 pantallas siguen usando useDatos() igual que antes.

   ---------------------------------------------------------------------------
   CÓMO FUNCIONA

   1. Al montar, carga TODO de una vez (cargarTodo) y lo deja en `base`, con la
      misma forma que tenía la semilla: { locales, actuaciones, relevamientos,
      usuarios, rubros, feriados, parametros, ... }. Por eso vistas.js y las
      pantallas no notan la diferencia.

   2. Mientras carga, muestra una pantalla de espera en lugar de los hijos. Es
      lo que evita que 29 pantallas tengan que preguntar "¿ya llegaron los
      datos?": cuando se renderizan, los datos están.

   3. Cada acción llama al endpoint y después RECARGA. No intenta adivinar cómo
      quedaron los datos después del cambio: se los vuelve a pedir al servidor,
      que es el único que sabe. Es más tráfico y es a propósito; con 2.200
      locales en red local no se nota, y elimina de raíz que la pantalla muestre
      algo distinto de lo que hay en la base.

   4. Si una acción falla, el error NO rompe la pantalla: se muestra abajo en un
      cartel con el mensaje que mandó el backend ("No se puede emitir la cédula:
      faltan CUIT, razón social"). Las pantallas llaman a estas funciones sin
      await, igual que cuando eran síncronas, y siguen andando.

   ---------------------------------------------------------------------------
   LO QUE CAMBIÓ RESPECTO DE LA VERSIÓN CON localStorage

   - EL ESTADO DEL LOCAL YA NO SE CALCULA ACÁ. Lo resuelve el backend leyendo
     `local.id_estado` y el último trámite (ver backend/mapeo.js). El front lo
     recibe hecho. Antes se calculaba con resolverEstado() sobre el historial.
   - EL HISTORIAL DE ESTADOS lo escribe el backend en la tabla opcional
     `auditoria` (backend/sql/05). Acá se pide por local, cuando se abre la
     ficha (cargarAuditoria). Sin la tabla, la lista viene vacía.
   - LOS PARÁMETROS Y LA PLANTILLA se guardan si la base tiene la tabla
     opcional `parametro` (backend/sql/06). Sin ella son de solo lectura y
     viven en backend/parametros-sistema.js.
   - QUÉ TIENE PRENDIDO EL SERVIDOR llega en `capacidades`, y las pantallas no
     ofrecen lo que no se puede guardar.

   ---------------------------------------------------------------------------
   TRABAJO SIN CONEXIÓN (sección 6.2)

   - Cada carga exitosa deja una copia de los datos en el dispositivo. Si al
     abrir la app no hay señal, se trabaja con esa copia (`sinConexion`).
   - Relevamientos y entregas hechos sin señal quedan en una cola del
     dispositivo (colaSinConexion.js) y se envían solos al volver la conexión.
     `pendientesSinConexion` es lo que espera; la barra lo muestra.
   ============================================================================ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import Typography from '@mui/material/Typography';

import { DatosContext } from './datosContexto';
import { api, identificarse } from './api';
import { aplicarEtiquetas } from '../dominio/estados';
import {
  bandejas,
  cedulas,
  conEstado,
  documentosPorVencer,
  indicadores,
  indicadoresDelPeriodo,
  porVencer,
  presentacionesPendientes,
} from './vistas';
import { guardar as guardarEnDispositivo, leer as leerDelDispositivo } from './almacenLocal';
import { encolar, enviarPendientes, listar as listarPendientes, quitar as quitarPendiente, suscribir } from './colaSinConexion';
import { hoyISO } from '../dominio/fechas';
import { deLocal } from '../dominio/actuaciones';
import { useRol } from '../auth/rolContexto';

/* Accesos sin nada guardado: rige el reparto por defecto de config/modulos.js. */
const PERMISOS_VACIOS = { modulos: {}, rolesDeshabilitados: [] };

/* Qué funciones opcionales tiene prendidas el servidor (backend/capacidades.js).
   Arranca todo apagado: si el servidor es viejo y no sabe responder, las
   pantallas no ofrecen lo que no se puede guardar. */
const CAPACIDADES_VACIAS = { auditoria: false, parametros: false, accesos: false, impresion: false, correo: false, geocodificador: 'ninguno' };

/* Donde queda la última copia de los datos, para abrir la app sin señal. */
const CLAVE_COPIA = 'copia-datos';

/* ¿El error es "no hubo respuesta" (sin señal o servidor apagado)? Lo marca
   api.js con estado 0. Cualquier otro error es una respuesta del servidor. */
const esSinConexion = (e) => e?.estado === 0;

/* La cola sin conexión manda cada carga a nombre de quien la hizo (ver
   enviarItem). En false, todas salen a nombre del usuario activo, como antes. */
const ENVIAR_A_NOMBRE_DE_QUIEN_CARGO = true;

/* Lo que se guarda del autor: lo justo para las cabeceras de api.js y para
   mostrar en la lista de pendientes quién la cargó. */
const autorDeLaCarga = (u) => (u?.nombre ? { id: u.id ?? null, nombre: String(u.nombre), rol: u.rol } : null);

/* La forma del store antes de que lleguen los datos. Existe para que nada
   explote si algo se renderiza antes de tiempo: todas las colecciones son
   arrays vacíos, no undefined. */
const BASE_VACIA = {
  locales: [],
  actuaciones: [],
  relevamientos: [],
  usuarios: [],
  rubros: [],
  feriados: [],
  fusiones: [],
  // La auditoría se conserva como array vacío para no romper las pantallas que
  // la leen. El historial de cada local se pide aparte, cuando se abre su
  // ficha (ver cargarAuditoria más abajo): traer el de 2.200 locales de una
  // vez sería pesado y casi nunca hace falta.
  auditoria: [],
  parametros: {},
  plantillaCedula: '',
  limiteMunicipal: [],
  limiteOficial: false,
  novedadesExpedientes: [],
  secuencias: { cedula: 0, expediente: 0 },
  permisos: PERMISOS_VACIOS,
  capacidades: CAPACIDADES_VACIAS,
  // Prórrogas pedidas por el portal sin resolver (las usa la bandeja de
  // coordinación). Vacía si la base no tiene el historial (sql/05).
  solicitudesProrroga: [],
};

function DatosProvider({ children }) {
  const { usuario } = useRol();
  const [base, setBase] = useState(BASE_VACIA);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [aviso, setAviso] = useState(null);
  // null con señal; { desde } cuando se está mostrando la copia guardada.
  const [sinConexion, setSinConexion] = useState(null);
  // Lo cargado sin señal que espera para enviarse (colaSinConexion.js).
  const [pendientes, setPendientes] = useState([]);
  // Historial de estados ya pedido, por local: { [idLocal]: [...] }.
  const [auditorias, setAuditorias] = useState({});
  // Sube cada vez que llegan datos nuevos del servidor. Las pantallas que
  // piden algo aparte (el historial de la ficha) lo usan para volver a pedir.
  const [versionDatos, setVersionDatos] = useState(0);
  const hoy = hoyISO();

  /* El backend identifica al usuario por cabeceras (ver src/datos/api.js).
     Se avisa apenas cambia el rol, antes de cualquier pedido. */
  useEffect(() => {
    identificarse(usuario);
  }, [usuario]);

  /* ==========================================================================
     LA CARGA
     --------------------------------------------------------------------------
     Todos los pedidos salen en paralelo (Promise.all): tardan lo que tarda el
     más lento, no la suma. Son diez y el pesado es /locales.
     ========================================================================== */
  const cargarTodo = useCallback(async () => {
    const [
      locales,
      actuaciones,
      relevamientos,
      usuarios,
      rubros,
      feriados,
      parametros,
      plantilla,
      fusiones,
      permisos,
      capacidades,
      solicitudesProrroga,
      limite,
      novedadesExpedientes,
    ] = await Promise.all([
      api.locales(),
      api.actuaciones(),
      api.relevamientos(),
      api.usuarios(),
      api.rubros(),
      api.feriados(),
      api.parametros(),
      api.plantilla(),
      api.fusiones(),
      // Si la base todavía no tiene las tablas de Accesos, la llamada falla y
      // el sistema sigue con el reparto por defecto del código en vez de
      // quedarse sin cargar.
      api.permisos().catch(() => PERMISOS_VACIOS),
      // Lo mismo con un servidor que todavía no sabe responder capacidades.
      api.capacidades().catch(() => CAPACIDADES_VACIAS),
      api.solicitudesProrroga().catch(() => []),
      api.limiteMunicipal(),
      // La bitacora de los expedientes de multa. Si la base no tiene la tabla
      // (sql/10), el sistema sigue andando sin ella.
      api.novedadesExpedientes().catch(() => []),
    ]);

    /* `secuencias` ya no es una tabla: el último número de cédula se deduce de
       las actuaciones. Se conserva la forma { cedula, expediente } porque es lo
       que espera la pantalla de Reportes.

       El correlativo es lo que va DESPUÉS del guion: '0001-675' -> 675. No se
       usa digitosCedula() del dominio porque esa función está hecha para el
       formato 'CED-001275' de la maqueta y sobre '0001-675' devuelve 1675. */
    const ultimaCedula = actuaciones.reduce((max, a) => {
      if (!a.numeroCedula) return max;
      const n = Number(String(a.numeroCedula).split('-').pop());
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);

    const nueva = {
      locales,
      actuaciones,
      relevamientos,
      usuarios,
      rubros,
      feriados,
      fusiones,
      permisos,
      auditoria: [],
      parametros,
      plantillaCedula: plantilla?.texto ?? '',
      /* El polígono del ejido, para que el mapa dibuje EL MISMO límite contra
         el que valida el backend (sección 9.2 del pliego). */
      limiteMunicipal: limite?.poligono ?? [],
      limiteOficial: Boolean(limite?.oficial),
      novedadesExpedientes,
      secuencias: { cedula: ultimaCedula, expediente: 0 },
      capacidades: { ...CAPACIDADES_VACIAS, ...capacidades },
      solicitudesProrroga,
    };
    // Los nombres de estado que cambió el área (sección 3.1), antes de dibujar.
    aplicarEtiquetas(parametros?.etiquetasEstado);
    setBase(nueva);
    setSinConexion(null);
    setAuditorias({});
    setVersionDatos((v) => v + 1);
    // La copia para trabajar sin señal. No se espera: si el dispositivo no
    // deja guardar, la app sigue igual con conexión.
    guardarEnDispositivo(CLAVE_COPIA, { momento: new Date().toISOString(), base: nueva });
  }, []);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    cargarTodo()
      .then(() => {
        if (vigente) setErrorCarga(null);
      })
      .catch(async (e) => {
        /* SIN SEÑAL AL ABRIR LA APP. Si hay una copia guardada de la última
           vez, se trabaja con ella: el relevador puede cargar y el notificador
           ve sus cédulas. Lo que carguen queda en la cola y sale solo cuando
           vuelva la conexión. Sin copia, no hay nada que mostrar. */
        const copia = esSinConexion(e) ? await leerDelDispositivo(CLAVE_COPIA) : null;
        if (!vigente) return;
        if (copia?.base) {
          aplicarEtiquetas(copia.base?.parametros?.etiquetasEstado);
          setBase({ ...BASE_VACIA, ...copia.base });
          setSinConexion({ desde: copia.momento });
          setErrorCarga(null);
        } else {
          setErrorCarga(e.message);
        }
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    // Evita que una carga que quedó en el aire pise el estado después de que el
    // componente se desmontó (pasa con el recambio en caliente de Vite).
    return () => {
      vigente = false;
    };
  }, [cargarTodo]);

  /* ==========================================================================
     ejecutar()  —  el envoltorio por donde pasa TODA acción
     --------------------------------------------------------------------------
     Reemplaza al despachar() de la versión con localStorage. Aquel calculaba
     los cambios de estado para anotarlos en la auditoría; ahora de eso se
     ocupa el backend, y acá lo que hace falta es otra cosa:

       - llamar al endpoint
       - recargar los datos
       - si algo falla, mostrar el mensaje en vez de dejar la promesa suelta

     Ese último punto es el que permite que las pantallas sigan llamando a las
     acciones sin await, exactamente como cuando eran síncronas.
     ========================================================================== */
  const ejecutar = useCallback(
    async (mensajeOk, llamada) => {
      try {
        const resultado = await llamada();
        await cargarTodo();
        // mensajeOk puede ser una función del resultado, para avisos que
        // dependen de lo que contestó el servidor (ver guardarLocal).
        if (mensajeOk) setAviso(typeof mensajeOk === 'function' ? mensajeOk(resultado) : { tipo: 'success', texto: mensajeOk });
        // Siempre algo "verdadero" cuando salió bien, aunque el endpoint no
        // devuelva cuerpo: las pantallas cierran el formulario solo si esto
        // no es null, y así no se pierde lo escrito cuando falla.
        return resultado ?? true;
      } catch (e) {
        if (esSinConexion(e)) {
          setSinConexion((s) => s ?? { desde: null });
          setAviso({ tipo: 'error', texto: 'Sin conexión con el servidor: no se guardó. Probá de nuevo cuando vuelva la señal.' });
        } else {
          setAviso({ tipo: 'error', texto: e.message });
        }
        return null;
      }
    },
    [cargarTodo],
  );

  /* ==========================================================================
     TRABAJO SIN CONEXIÓN  (sección 6.2, requisito no negociable)
     --------------------------------------------------------------------------
     Relevamientos y entregas: si no hay señal al guardar, la carga queda en
     el dispositivo (colaSinConexion.js) y sale sola cuando vuelve la conexión.
     El resto de los actos (los de oficina) necesitan señal y lo dicen.
     ========================================================================== */
  /* Cada carga sale a nombre de QUIEN LA HIZO (item.autor), no de quien esté
     elegido cuando vuelve la señal: un teléfono compartido, o un "Firmar como"
     cambiado en el medio, la firmaban a nombre de otro. Las cargas guardadas
     antes de este cambio no traen autor y salen con el usuario activo, como
     antes. En false, todas salen con el usuario activo.
     PENDIENTE CON EL LOGIN (CiDiTuc): no se va a poder mandar a nombre de otro.
     Ahí la regla pasa a ser enviar solo las cargas del que inició sesión y
     dejar esperando las de los demás. */
  const enviarItem = useCallback(
    (item) => {
      const autor = ENVIAR_A_NOMBRE_DE_QUIEN_CARGO ? (item.autor ?? undefined) : undefined;
      return item.tipo === 'relevamiento'
        ? api.crearRelevamiento(item.datos, autor)
        : api.registrarEntrega(item.referencia, item.datos, autor);
    },
    [],
  );

  const sincronizar = useCallback(async () => {
    const { enviados, rechazados, ocupada } = await enviarPendientes(enviarItem);
    if (ocupada) return;
    if (enviados) {
      try {
        await cargarTodo();
      } catch {
        // Se enviaron, pero recargar falló: se ve en la próxima recarga.
      }
    }
    if (enviados && !rechazados) {
      setAviso({ tipo: 'success', texto: `Se enviaron ${enviados} carga(s) que estaban guardadas en el dispositivo` });
    } else if (rechazados) {
      setAviso({
        tipo: 'error',
        texto: `${rechazados} carga(s) guardadas sin señal no se aceptaron. Revisalas en la lista de pendientes.`,
      });
    }
  }, [enviarItem, cargarTodo]);

  /* Guarda en la cola o envía: lo que corresponda según haya señal. */
  const guardarOEncolar = useCallback(
    async (itemSinAutor, mensajeOk) => {
      // Quién la cargó queda pegado a la carga, igual que la hora y el GPS.
      const item = { ...itemSinAutor, autor: autorDeLaCarga(usuario) };
      try {
        const resultado = await enviarItem(item);
        await cargarTodo();
        setAviso({ tipo: 'success', texto: mensajeOk });
        return resultado ?? true;
      } catch (e) {
        if (!esSinConexion(e)) {
          setAviso({ tipo: 'error', texto: e.message });
          return null;
        }
        const guardado = await encolar(item);
        setSinConexion((s) => s ?? { desde: null });
        setAviso({
          tipo: 'info',
          texto: 'Sin señal: quedó guardado en el dispositivo y se envía solo cuando vuelva la conexión.',
        });
        return { enCola: true, idCola: guardado.id };
      }
    },
    [enviarItem, cargarTodo, usuario],
  );

  const descartarPendiente = useCallback((id) => quitarPendiente(id), []);

  // La cola se lee al arrancar y se escucha: el contador de la barra se
  // actualiza solo. Al volver la señal, y cada minuto si hay pendientes, se
  // intenta enviar.
  useEffect(() => {
    let vigente = true;
    listarPendientes().then((l) => vigente && setPendientes(l));
    const dejar = suscribir((l) => setPendientes(l));
    const alVolver = () => sincronizar();
    window.addEventListener('online', alVolver);
    return () => {
      vigente = false;
      dejar();
      window.removeEventListener('online', alVolver);
    };
  }, [sincronizar]);

  const hayPorEnviar = pendientes.some((p) => !p.rechazado);
  useEffect(() => {
    if (!hayPorEnviar) return undefined;
    const primero = setTimeout(sincronizar, 3000);
    const t = setInterval(sincronizar, 60 * 1000);
    return () => {
      clearTimeout(primero);
      clearInterval(t);
    };
  }, [hayPorEnviar, sincronizar]);

  /* Con la copia del dispositivo en pantalla, se reintenta traer los datos
     frescos cada 30 segundos y apenas el navegador avisa que volvió la red. */
  useEffect(() => {
    if (!sinConexion) return undefined;
    const reintentar = () => cargarTodo().catch(() => {});
    window.addEventListener('online', reintentar);
    const t = setInterval(reintentar, 30 * 1000);
    return () => {
      window.removeEventListener('online', reintentar);
      clearInterval(t);
    };
  }, [sinConexion, cargarTodo]);

  /* ==========================================================================
     HISTORIAL DE ESTADOS  (tabla opcional `auditoria`, sql/05)
     --------------------------------------------------------------------------
     Se pide por local, cuando la ficha lo necesita. auditoriaDeLocal() sigue
     siendo sincrónica como antes: devuelve lo que ya llegó, o [] mientras tanto.
     ========================================================================== */
  const cargarAuditoria = useCallback(
    (idLocal) => {
      if (!base.capacidades.auditoria) return;
      api
        .auditoria(idLocal)
        .then((lista) => setAuditorias((prev) => ({ ...prev, [Number(idLocal)]: lista })))
        .catch(() => {});
    },
    [base.capacidades.auditoria],
  );

  /* ==========================================================================
     PADRÓN
     ========================================================================== */

  /* Alta y edición. La coordenada NO se manda: la obtiene el backend
     geocodificando la dirección declarada, que es la única fuente válida
     (sección 9.2 del pliego). */
  /* Si se cargó o se cambió la dirección, el backend la busca en el mapa y
     contesta `ubicacion`. Antes no se decía nada: el local quedaba sin
     ubicación y recién se notaba en el mapa. */
  const guardarLocal = useCallback(
    (datos) =>
      ejecutar(
        (r) => {
          const hecho = datos.id ? 'Local actualizado' : 'Local dado de alta';
          if (!r?.ubicacion) return { tipo: 'success', texto: hecho };
          return r.ubicacion.ok
            ? { tipo: 'success', texto: `${hecho}. La dirección se ubicó en el mapa.` }
            : {
                tipo: 'info',
                texto: `${hecho}, pero la dirección no se pudo ubicar en el mapa: ${r.ubicacion.motivo ?? 'sin motivo'} Revisala, o ubicala a mano en el Mapa (Geocodificación pendiente).`,
              };
        },
        () => (datos.id ? api.localEdicion(datos.id, datos) : api.localAlta(datos)),
      ),
    [ejecutar],
  );

  const eliminarLocal = useCallback(
    (localId) => ejecutar('Local dado de baja', () => api.localBaja(localId)),
    [ejecutar],
  );

  const bloquearLocal = useCallback(
    (localId, motivo) => ejecutar('Local bloqueado', () => api.bloquear(localId, motivo)),
    [ejecutar],
  );

  const desbloquearLocal = useCallback(
    (localId) => ejecutar('Se levantó el bloqueo', () => api.desbloquear(localId)),
    [ejecutar],
  );

  /* Busca una dirección en el mapa SIN guardar nada (botón "Ubicar en el mapa"
     del formulario del local). No muestra cartel: el formulario muestra el
     resultado debajo del campo. */
  const ubicarDireccion = useCallback(async (direccion) => {
    try {
      return await api.ubicarDireccion(direccion);
    } catch (e) {
      return { ok: false, motivo: esSinConexion(e) ? 'Sin conexión con el servidor: probá cuando vuelva la señal.' : e.message };
    }
  }, []);

  const geocodificarPendientes = useCallback(
    () =>
      ejecutar(null, async () => {
        const r = await api.geocodificar();
        setAviso(
          r.configurado === false
            ? {
                tipo: 'info',
                texto: `Todavía no hay un servicio de geocodificación configurado: los ${r.revisados} locales siguen sin ubicación. Corregí la dirección de cada uno o pedí a DITEC que configure el servicio.`,
              }
            : { tipo: 'success', texto: `Geocodificación: ${r.resueltos} de ${r.revisados} direcciones resueltas` },
        );
        return r;
      }),
    [ejecutar],
  );

  /* ==========================================================================
     RELEVAMIENTO  (etapas 1 y 2)
     ========================================================================== */
  /* Sin señal, el relevamiento queda en el dispositivo (ver guardarOEncolar).
     `datos.momento` es el instante del guardado: viaja con la carga y es el
     que queda en la base aunque llegue horas después. */
  const crearRelevamiento = useCallback(
    (datos) =>
      guardarOEncolar(
        { tipo: 'relevamiento', datos: { momento: new Date().toISOString(), ...datos }, etiqueta: datos.nombreLocal },
        'Relevamiento registrado',
      ),
    [guardarOEncolar],
  );

  /* El agente corrige su propia carga el mismo día. Necesita señal: es una
     corrección, no una carga nueva, y el servidor tiene que confirmar que
     todavía se puede (mismo día, sin control de coordinación). */
  const editarRelevamiento = useCallback(
    (id, datos) => ejecutar('Relevamiento corregido', () => api.editarRelevamiento(id, datos)),
    [ejecutar],
  );

  const revisarRelevamiento = useCallback(
    (localId, resultado) => ejecutar('Control administrativo registrado', () => api.revisarRelevamiento(localId, resultado)),
    [ejecutar],
  );

  /* ==========================================================================
     NOTIFICACIONES  (etapas 3 y 4)
     ========================================================================== */
  /* `medio`: papel (como siempre), correo o ambos (sql/13). El aviso depende
     de lo que contestó el servidor: la cédula puede haberse emitido y el
     correo no haber salido. */
  const avisoDeCorreo = (verbo) => (r) => {
    if (!r?.correo) return { tipo: 'success', texto: verbo };
    if (r.correo.enviado) return { tipo: 'success', texto: `${verbo} y enviada por correo a ${r.correo.para}.` };
    return { tipo: 'warning', texto: `${verbo}, pero el correo NO salió: ${r.correo.error} Podés reintentar con "Enviar por correo".` };
  };
  const generarCedula = useCallback(
    (localId, medio = 'papel') => ejecutar(avisoDeCorreo('Cédula emitida'), () => api.generarCedula(localId, medio)),
    [ejecutar],
  );
  const enviarCedulaPorCorreo = useCallback(
    (actuacionId) => ejecutar(avisoDeCorreo('Cédula'), () => api.enviarCedulaPorCorreo(actuacionId)),
    [ejecutar],
  );

  const regenerarCedula = useCallback(
    (actuacionId) => ejecutar('Cédula regenerada', () => api.regenerarCedula(actuacionId)),
    [ejecutar],
  );

  const asignarNotificador = useCallback(
    (actuacionId, notificadorId) => ejecutar('Notificador asignado', () => api.asignarNotificador(actuacionId, notificadorId)),
    [ejecutar],
  );

  /* La constancia de impresión necesita las columnas de sql/04. Sin ellas no
     se llama: se imprime igual y no aparece un error que el usuario no puede
     resolver. */
  const marcarImpresa = useCallback(
    (actuacionId) =>
      base.capacidades.impresion ? ejecutar('Impresión registrada', () => api.marcarImpresa(actuacionId)) : Promise.resolve(null),
    [ejecutar, base.capacidades.impresion],
  );

  /* La impresión por lote (sección 6.4): una constancia por cédula, y la
     recarga de datos UNA vez al final (con marcarImpresa serían N recargas). */
  const marcarImpresas = useCallback(
    (ids) =>
      base.capacidades.impresion && ids.length
        ? ejecutar(`${ids.length} cédula(s) registradas como impresas`, async () => {
            for (const id of ids) await api.marcarImpresa(id);
          })
        : Promise.resolve(null),
    [ejecutar, base.capacidades.impresion],
  );

  /* Acá empieza a correr el plazo: el backend calcula el vencimiento una sola
     vez, con los feriados y los parámetros vigentes ese día. Sin señal, la
     entrega queda en el dispositivo con su fecha y se envía después. */
  const registrarEntrega = useCallback(
    (actuacionId, datos) =>
      guardarOEncolar(
        { tipo: 'entrega', referencia: actuacionId, datos, etiqueta: datos.etiqueta ?? `Cédula ${actuacionId}` },
        'Entrega registrada',
      ),
    [guardarOEncolar],
  );

  /* Corregir una entrega ya registrada (sección 6.2). Necesita señal: es una
     corrección, no una carga de campo, y el servidor decide si todavía se
     puede (el mismo día para el agente; después, coordinación con motivo). */
  /* Corregir o borrar las observaciones de una actuación. El servidor anota
     en el historial quién lo hizo y qué decían antes. */
  const editarObservaciones = useCallback(
    (actuacionId, texto) => ejecutar('Observaciones guardadas', () => api.editarObservaciones(actuacionId, texto)),
    [ejecutar],
  );

  const corregirEntrega = useCallback(
    (actuacionId, datos) => ejecutar('Entrega corregida', () => api.corregirEntrega(actuacionId, datos)),
    [ejecutar],
  );

  /* ==========================================================================
     DOCUMENTACIÓN
     ========================================================================== */
  const registrarDocumento = useCallback(
    (localId, datos) => ejecutar('Documentación registrada', () => api.registrarDocumento({ ...datos, localId })),
    [ejecutar],
  );

  const validarPresentacion = useCallback(
    (actuacionId, aprobar, observaciones = '', completar = {}) =>
      ejecutar(aprobar ? 'Presentación aprobada' : 'Presentación rechazada', () =>
        api.validarPresentacion(actuacionId, aprobar, observaciones, completar),
      ),
    [ejecutar],
  );

  /* ==========================================================================
     PRÓRROGA Y EXPEDIENTE  (etapas 5 y 6)
     ========================================================================== */
  const otorgarProrroga = useCallback(
    (localId, datos) => ejecutar('Prórroga otorgada', () => api.otorgarProrroga(localId, datos)),
    [ejecutar],
  );

  /* Desde el portal: el titular pide, no otorga. Queda anotado en el
     historial del local para que coordinación lo resuelva. */
  const solicitarProrroga = useCallback(
    (localId, datos) =>
      ejecutar('Solicitud enviada: la oficina la va a revisar', () => api.solicitarProrroga(localId, datos)),
    [ejecutar],
  );

  const solicitarExpediente = useCallback(
    (localId, canal, observaciones) =>
      ejecutar('Solicitud registrada', () => api.solicitarExpediente(localId, canal, observaciones)),
    [ejecutar],
  );

  const novedadExpediente = useCallback(
    (idTramite, datos) => ejecutar('Novedad registrada', () => api.novedadExpediente(idTramite, datos)),
    [ejecutar],
  );

  const registrarExpediente = useCallback(
    (localId, numeroManual) => ejecutar('Expediente registrado', () => api.registrarExpediente(localId, numeroManual)),
    [ejecutar],
  );

  /* El número definitivo de un expediente provisorio (sección 8.3). */
  const numeroDefinitivoExpediente = useCallback(
    (actuacionId, numero, motivo) =>
      ejecutar('Número de expediente registrado', () => api.numeroDefinitivoExpediente(actuacionId, numero, motivo)),
    [ejecutar],
  );

  const reingresarAlCircuito = useCallback(
    (localId, motivo) => ejecutar('Local reingresado al circuito', () => api.reingresar(localId, motivo)),
    [ejecutar],
  );

  // El comercio cerró: sale del padrón y del mapa, conserva el historial.
  const cerrarLocal = useCallback(
    (localId, motivo) => ejecutar('Local marcado como cerrado', () => api.cerrarLocal(localId, motivo)),
    [ejecutar],
  );
  const reabrirLocal = useCallback(
    (localId, motivo) => ejecutar('Local reabierto', () => api.reabrirLocal(localId, motivo)),
    [ejecutar],
  );

  // Sin las dos entregas efectivas: vuelve a 1° notificación (ver reglas.js).
  const volverANotificar = useCallback(
    (localId, motivo) => ejecutar('El local vuelve a 1° notificación pendiente', () => api.volverANotificar(localId, motivo)),
    [ejecutar],
  );

  /* ==========================================================================
     HERRAMIENTAS
     ========================================================================== */
  const fusionarLocales = useCallback(
    (idPrincipal, idDuplicado) => ejecutar('Locales fusionados', () => api.fusionar(idPrincipal, idDuplicado)),
    [ejecutar],
  );

  /* El informe de la prestataria tiene su propio módulo con revisión fila por
     fila: la pantalla Informe9DJ.jsx habla con api.informe9dj* directamente y
     llama a recargar() cuando aplica o anula una carga. */

  /* ==========================================================================
     CONFIGURACIÓN
     ========================================================================== */
  const guardarEnCatalogo = useCallback(
    (clave, item) =>
      ejecutar('Registro guardado', () =>
        item.id ? api.catalogoEdicion(clave, item.id, item) : api.catalogoAlta(clave, item),
      ),
    [ejecutar],
  );

  const eliminarDeCatalogo = useCallback(
    (clave, id) => ejecutar('Registro eliminado', () => api.catalogoBaja(clave, id)),
    [ejecutar],
  );

  /* Los parámetros y la plantilla viven en el código del backend
     (backend/parametros-sistema.js), no en una tabla. El backend responde 405 y
     ese mensaje es el que se muestra: avisa dónde se cambian. */
  /* Con la tabla opcional `parametro` (sql/06) se guardan de verdad y
     devuelven el resultado: la pantalla dice "Guardado" solo si salió bien.
     Sin la tabla, avisan que todavía no se puede y devuelven null. */
  const guardarParametros = useCallback(
    async (valores) => {
      if (!base.capacidades.parametros) {
        setAviso({ tipo: 'info', texto: 'Los parámetros todavía no se pueden guardar desde la aplicación en esta base.' });
        return null;
      }
      return ejecutar('Parámetros guardados', () => api.guardarParametros(valores));
    },
    [ejecutar, base.capacidades.parametros],
  );

  const guardarPlantilla = useCallback(
    async (texto) => {
      if (!base.capacidades.parametros) {
        setAviso({ tipo: 'info', texto: 'La plantilla todavía no se puede guardar desde la aplicación en esta base.' });
        return null;
      }
      return ejecutar('Plantilla guardada', () => api.guardarPlantilla(texto));
    },
    [ejecutar, base.capacidades.parametros],
  );

  /* Corre ahora la recorrida diaria del backend: anota en el historial los
     cambios de estado que produjo el paso del tiempo. */
  const recalcularEstados = useCallback(
    () =>
      ejecutar(null, async () => {
        const r = await api.recalcularEstados();
        setAviso(
          r.omitida
            ? { tipo: 'info', texto: 'El historial de estados todavía no está habilitado en esta base.' }
            : { tipo: 'success', texto: `Estados revisados: ${r.cambios} cambio(s) anotados en ${r.revisados} locales` },
        );
        return r;
      }),
    [ejecutar],
  );

  /* ==========================================================================
     ACCESOS  (qué ve y qué modifica cada tipo de usuario)
     --------------------------------------------------------------------------
     Solo se guardan las DIFERENCIAS respecto de config/modulos.js:
       permisos.modulos[idModulo][rol] = 'no' | 'ver' | 'editar'
       permisos.rolesDeshabilitados    = roles apagados enteros
     Lo que no está guardado sale del código, así un módulo nuevo aparece con
     su reparto por defecto. La pantalla es Accesos → Tipos de usuario; la
     restricción real va en el backend (tablas permisos_modulos y tipos_usuario).

     Las tres escrituras necesitan las tablas opcionales de sql/07 y el rol
     administrador. Sin las tablas el backend responde 501 y el cartel de error
     lo dice.
     ========================================================================== */
  const guardarPermiso = useCallback(
    (idModulo, rol, nivel) =>
      ejecutar(`Accesos: ${rol} en ${idModulo} pasa a "${nivel}"`, () => api.guardarPermiso(idModulo, rol, nivel)),
    [ejecutar],
  );

  /* Borra todo lo guardado para un rol: vuelve a lo que trae el código. */
  const restablecerPermisosDeRol = useCallback(
    (rol) => ejecutar(`Accesos: ${rol} vuelve a los valores por defecto`, () => api.restablecerPermisosDeRol(rol)),
    [ejecutar],
  );

  /* Apaga o prende un tipo de usuario entero. Apagado, no ve ningún módulo
     aunque tenga permisos guardados; sus usuarios siguen dados de alta. El
     administrador también se puede apagar, pero conserva Tipos de usuario
     (config/modulos.js, FIJOS): siempre hay una puerta para deshacerlo. */
  const habilitarRol = useCallback(
    (rol, habilitado) =>
      ejecutar(`Accesos: ${rol} ${habilitado ? 'habilitado' : 'deshabilitado'}`, () => api.habilitarRol(rol, habilitado)),
    [ejecutar],
  );

  /* Ya no hay demo que reiniciar: los datos son los de la base del área. Se
     conserva la función para no romper la pantalla de Parámetros, y hace lo
     único sensato que puede hacer, que es volver a pedir los datos. */
  const reiniciarDemo = useCallback(
    () => ejecutar('Datos actualizados desde el servidor', async () => null),
    [ejecutar],
  );

  /* ==========================================================================
     DERIVADOS
     ========================================================================== */
  const localesConEstado = useMemo(() => conEstado(base, hoy), [base, hoy]);

  const valor = useMemo(
    () => ({
      // --- datos crudos
      ...base,
      hoy,
      cargando,
      recargar: cargarTodo,

      // --- derivados
      localesConEstado,
      localPorId: (id) => localesConEstado.find((l) => l.id === Number(id)) ?? null,
      actuacionesDeLocal: (id) => deLocal(base.actuaciones, Number(id)),
      relevamientosDeLocal: (id) => base.relevamientos.filter((r) => r.localId === Number(id)),
      // El historial de estados que ya llegó para ese local ([] mientras tanto
      // o si la base no tiene la tabla). Lo pide cargarAuditoria(id).
      auditoriaDeLocal: (id) => auditorias[Number(id)] ?? [],
      cargarAuditoria,
      versionDatos,

      // --- trabajo sin conexión
      sinConexion,
      pendientesSinConexion: pendientes,
      sincronizar,
      descartarPendiente,
      bandejasPara: (rol, modo, opciones) => bandejas(localesConEstado, rol, modo, opciones),
      cedulas: () => cedulas(base),
      porVencer: (dias) => porVencer(localesConEstado, dias),
      documentosPorVencer: (dias) => documentosPorVencer(base, localesConEstado, dias, hoy),
      presentacionesPendientes: () => presentacionesPendientes(base),
      indicadores: () => indicadores(base, localesConEstado, hoy),
      // Lo que pasó entre dos fechas ISO (Reportes, selector de período).
      indicadoresDelPeriodo: (desde, hasta) => indicadoresDelPeriodo(base, desde, hasta),

      // --- acciones
      guardarLocal,
      eliminarLocal,
      bloquearLocal,
      desbloquearLocal,
      geocodificarPendientes,
      ubicarDireccion,
      crearRelevamiento,
      editarRelevamiento,
      revisarRelevamiento,
      generarCedula,
      enviarCedulaPorCorreo,
      regenerarCedula,
      asignarNotificador,
      marcarImpresa,
      marcarImpresas,
      registrarEntrega,
      corregirEntrega,
      editarObservaciones,
      registrarDocumento,
      validarPresentacion,
      otorgarProrroga,
      solicitarProrroga,
      registrarExpediente,
      solicitarExpediente,
      novedadExpediente,
      numeroDefinitivoExpediente,
      reingresarAlCircuito,
      volverANotificar,
      cerrarLocal,
      reabrirLocal,
      fusionarLocales,
      guardarEnCatalogo,
      eliminarDeCatalogo,
      guardarParametros,
      guardarPlantilla,
      guardarPermiso,
      restablecerPermisosDeRol,
      habilitarRol,
      reiniciarDemo,
      recalcularEstados,
    }),
    [
      base, hoy, cargando, cargarTodo, localesConEstado,
      auditorias, cargarAuditoria, versionDatos, sinConexion, pendientes, sincronizar, descartarPendiente,
      guardarLocal, eliminarLocal, bloquearLocal, desbloquearLocal, geocodificarPendientes, ubicarDireccion,
      crearRelevamiento, editarRelevamiento, revisarRelevamiento, generarCedula, enviarCedulaPorCorreo, regenerarCedula, asignarNotificador,
      marcarImpresa, marcarImpresas, registrarEntrega, corregirEntrega, editarObservaciones, registrarDocumento, validarPresentacion, otorgarProrroga, solicitarProrroga,
      registrarExpediente, numeroDefinitivoExpediente, solicitarExpediente, novedadExpediente, reingresarAlCircuito, volverANotificar, cerrarLocal, reabrirLocal, fusionarLocales,
      guardarEnCatalogo, eliminarDeCatalogo, guardarParametros, guardarPlantilla,
      guardarPermiso, restablecerPermisosDeRol, habilitarRol, reiniciarDemo, recalcularEstados,
    ],
  );

  /* ==========================================================================
     LO QUE SE VE MIENTRAS TANTO
     ========================================================================== */

  if (cargando) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh', gap: 2 }}>
        <CircularProgress />
        <Typography color="text.secondary">Cargando el padrón desde el servidor…</Typography>
      </Box>
    );
  }

  /* Si la carga inicial falló no se puede mostrar nada: sin locales no hay
     pantalla que tenga sentido. Se explica qué pasó y se ofrece reintentar, que
     es lo que resuelve el caso más común (el backend todavía no estaba
     levantado cuando se abrió la página). */
  if (errorCarga) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh', p: 3 }}>
        <Alert
          severity="error"
          sx={{ maxWidth: 560 }}
          action={
            <Button color="inherit" size="small" onClick={() => window.location.reload()}>
              Reintentar
            </Button>
          }
        >
          <Typography fontWeight={600} gutterBottom>
            No se pudieron cargar los datos
          </Typography>
          <Typography variant="body2" gutterBottom>
            {errorCarga}
          </Typography>
          {/* Lo que puede hacer un agente en la calle, y abajo lo que mira DITEC. */}
          <Typography variant="body2" gutterBottom>
            Si estás sin señal, reintentá cuando vuelva: la primera vez hace falta conexión para bajar los datos.
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Revisá que el backend esté corriendo (<code>cd backend &amp;&amp; npm run dev</code>) y que la
            base responda (<code>npm run probar</code>).
          </Typography>
        </Alert>
      </Box>
    );
  }

  return (
    <DatosContext.Provider value={valor}>
      {children}
      <Snackbar
        open={Boolean(aviso)}
        autoHideDuration={aviso?.tipo === 'error' ? 10000 : 4000}
        onClose={() => setAviso(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {aviso ? (
          <Alert severity={aviso.tipo} onClose={() => setAviso(null)} variant="filled" sx={{ maxWidth: 600 }}>
            {aviso.texto}
          </Alert>
        ) : undefined}
      </Snackbar>
    </DatosContext.Provider>
  );
}

export default DatosProvider;
