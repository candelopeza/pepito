/* ============================================================================
   datos/api.js  —  EL ÚNICO LUGAR DEL FRONT QUE HABLA CON EL BACKEND
   ----------------------------------------------------------------------------
   Todas las llamadas HTTP pasan por acá. Las pantallas NO usan fetch: usan
   useDatos(), y el store (DatosProvider.jsx) usa estas funciones.

   POR QUÉ IMPORTA QUE ESTÉ CENTRALIZADO: el día que haya login, el token se
   agrega en UN lugar (pedir()). Si cada pantalla hiciera su propio fetch,
   habría que tocarlas todas.

   LA DIRECCIÓN DE LA API sale de la variable de entorno VITE_API_URL, que se
   define en el archivo `.env` de la raíz del proyecto (no el de backend/). Si
   no está, asume http://localhost:3000, que es donde corre el backend en
   desarrollo.
   ============================================================================ */

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/* ---------------------------------------------------------------------------
   QUIÉN PIDE
   ---------------------------------------------------------------------------
   Hasta que exista el inicio de sesión único, el backend identifica al usuario
   por dos cabeceras (ver backend/middlewares/usuario.js). El store las carga
   con el usuario activo del selector de rol.

   El nombre va con encodeURIComponent porque una cabecera HTTP no admite
   acentos: "Mariano Agustín" rompería el pedido entero.
   --------------------------------------------------------------------------- */
let usuarioActual = null;

export function identificarse(usuario) {
  usuarioActual = usuario;
}

function cabeceras() {
  const h = { 'Content-Type': 'application/json' };
  if (usuarioActual?.nombre) h['x-usuario-nombre'] = encodeURIComponent(usuarioActual.nombre);
  if (usuarioActual?.rol) h['x-usuario-rol'] = usuarioActual.rol;
  return h;
}

/* ---------------------------------------------------------------------------
   EL PEDIDO
   ---------------------------------------------------------------------------
   Devuelve el JSON ya parseado, o lanza un Error con el mensaje que mandó el
   backend. Eso es lo importante: el backend responde { error: "..." } con un
   texto pensado para mostrarle al usuario ("No se puede emitir la cédula:
   faltan CUIT, razón social"), y acá ese texto se conserva en vez de perderse
   detrás de un "Error 400".
   --------------------------------------------------------------------------- */
export class ErrorApi extends Error {
  constructor(mensaje, estado, cuerpo = null) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.estado = estado;
    // La respuesta completa del backend: algunos errores traen datos ademas
    // del texto (la comparacion de un vinculo dudoso del informe 9DJ).
    this.cuerpo = cuerpo;
  }
}

async function pedir(ruta, opciones = {}) {
  let respuesta;
  try {
    respuesta = await fetch(`${BASE}${ruta}`, { ...opciones, headers: cabeceras() });
  } catch {
    // fetch solo falla así cuando no hubo respuesta: el backend está apagado,
    // o no hay red. Es el error más común en desarrollo, así que conviene que
    // lo diga con todas las letras.
    throw new ErrorApi(`No se pudo contactar al servidor en ${BASE}. ¿Está corriendo el backend?`, 0);
  }

  if (respuesta.status === 204) return null;

  const texto = await respuesta.text();
  let cuerpo = null;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    cuerpo = null;
  }

  if (!respuesta.ok) {
    throw new ErrorApi(cuerpo?.error ?? `Error ${respuesta.status} en ${ruta}`, respuesta.status, cuerpo);
  }
  return cuerpo;
}

/* Un archivo guardado (la foto de una entrega, el PDF de una DDJJ) como
   dirección que el navegador puede mostrar, con su tipo ('image/jpeg',
   'application/pdf'). Se pide con las mismas cabeceras que el resto: no es
   público, así que no alcanza con un <img src> directo al servidor. */
export async function descargarArchivo(id) {
  let respuesta;
  try {
    respuesta = await fetch(`${BASE}/archivos/${id}`, { headers: cabeceras() });
  } catch {
    throw new ErrorApi(`No se pudo contactar al servidor en ${BASE}. ¿Está corriendo el backend?`, 0);
  }
  if (!respuesta.ok) {
    let cuerpo = null;
    try {
      cuerpo = await respuesta.json();
    } catch {
      cuerpo = null;
    }
    throw new ErrorApi(cuerpo?.error ?? `Error ${respuesta.status} al pedir el archivo`, respuesta.status);
  }
  const blob = await respuesta.blob();
  return { url: URL.createObjectURL(blob), tipo: blob.type };
}

/* Lo mismo, cuando solo hace falta la dirección. */
export async function urlDeArchivo(id) {
  return (await descargarArchivo(id)).url;
}

const get = (ruta) => pedir(ruta);
const post = (ruta, cuerpo) => pedir(ruta, { method: 'POST', body: JSON.stringify(cuerpo ?? {}) });
const put = (ruta, cuerpo) => pedir(ruta, { method: 'PUT', body: JSON.stringify(cuerpo ?? {}) });
const borrar = (ruta) => pedir(ruta, { method: 'DELETE' });

/* ---------------------------------------------------------------------------
   LOS ENDPOINTS
   ---------------------------------------------------------------------------
   Un método por cada función del store. Los nombres son los mismos que usa
   DatosProvider.jsx para que se puedan seguir de un lado al otro.
   --------------------------------------------------------------------------- */
export const api = {
  salud: () => get('/salud'),

  // --- lectura del padrón ---------------------------------------------------
  locales: () => get('/locales'),
  local: (id) => get(`/locales/${id}`),
  actuaciones: () => get('/actuaciones'),
  relevamientos: () => get('/relevamientos'),
  notificaciones: () => get('/notificaciones'),
  documentacion: () => get('/documentacion'),

  // --- catálogos y configuración -------------------------------------------
  rubros: () => get('/configuracion/rubros'),
  usuarios: () => get('/configuracion/usuarios'),
  feriados: () => get('/configuracion/feriados'),
  tiposUsuario: () => get('/configuracion/tipos-usuario'),
  parametros: () => get('/configuracion/parametros'),
  plantilla: () => get('/configuracion/plantilla'),
  limiteMunicipal: () => get('/configuracion/limite-municipal'),
  // Las dos escrituras necesitan la tabla opcional `parametro` (sql/06): sin
  // ella el backend responde 405 y el store no las llama (ver capacidades).
  guardarParametros: (valores) => put('/configuracion/parametros', valores),
  guardarPlantilla: (texto) => put('/configuracion/plantilla', { texto }),
  // Qué funciones opcionales tiene prendidas el servidor (auditoría,
  // impresión, parámetros, accesos). Ver backend/capacidades.js.
  capacidades: () => get('/configuracion/capacidades'),

  catalogoAlta: (catalogo, item) => post(`/configuracion/${catalogo}`, item),
  catalogoEdicion: (catalogo, id, item) => put(`/configuracion/${catalogo}/${id}`, item),
  catalogoBaja: (catalogo, id) => borrar(`/configuracion/${catalogo}/${id}`),

  // --- accesos (qué ve y qué modifica cada rol) ----------------------------
  permisos: () => get('/configuracion/permisos'),
  guardarPermiso: (modulo, rol, nivel) => put(`/configuracion/permisos/${modulo}/${rol}`, { nivel }),
  restablecerPermisosDeRol: (rol) => borrar(`/configuracion/permisos/rol/${rol}`),
  habilitarRol: (rol, habilitado) => put(`/configuracion/permisos/rol/${rol}`, { habilitado }),

  // --- padrón: escritura ----------------------------------------------------
  localAlta: (datos) => post('/locales', datos),
  localEdicion: (id, datos) => put(`/locales/${id}`, datos),
  localBaja: (id) => borrar(`/locales/${id}`),
  bloquear: (id, motivo) => post(`/locales/${id}/bloqueo`, { motivo }),
  // Prórrogas que pidieron los titulares por el portal y nadie resolvió todavía.
  solicitudesProrroga: () => get('/locales/solicitudes-prorroga'),
  desbloquear: (id) => borrar(`/locales/${id}/bloqueo`),
  // Historial de cambios de estado (tabla opcional `auditoria`, sql/05).
  auditoria: (id) => get(`/locales/${id}/auditoria`),

  // --- relevamiento ---------------------------------------------------------
  crearRelevamiento: (datos) => post('/relevamientos', datos),
  // El autor corrige su carga, el mismo día (sección 6.2).
  editarRelevamiento: (id, datos) => put(`/relevamientos/${id}`, datos),
  revisarRelevamiento: (localId, resultado) => post(`/relevamientos/${localId}/revision`, { resultado }),

  // --- notificaciones -------------------------------------------------------
  generarCedula: (localId) => post('/notificaciones', { localId }),
  regenerarCedula: (id) => post(`/notificaciones/${id}/regenerar`),
  asignarNotificador: (id, notificadorId) => put(`/notificaciones/${id}/notificador`, { notificadorId }),
  marcarImpresa: (id) => post(`/notificaciones/${id}/impresion`),
  registrarEntrega: (id, datos) => post(`/notificaciones/${id}/entrega`, datos),
  // Corregir una entrega mal cargada: el agente en el día, o coordinación con motivo.
  corregirEntrega: (id, datos) => put(`/notificaciones/${id}/entrega`, datos),
  // Corregir o borrar las observaciones de una actuación (queda en el historial).
  editarObservaciones: (id, observaciones) => put(`/actuaciones/${id}/observaciones`, { observaciones }),

  // --- documentación --------------------------------------------------------
  registrarDocumento: (datos) => post('/documentacion', datos),
  validarPresentacion: (id, aprobar, observaciones) =>
    post(`/documentacion/${id}/validacion`, { aprobar, observaciones }),

  // --- prórrogas y expedientes ---------------------------------------------
  otorgarProrroga: (localId, datos) => post(`/locales/${localId}/prorrogas`, datos),
  // El titular PIDE (portal); coordinación OTORGA (la de arriba).
  solicitarProrroga: (localId, datos) => post(`/locales/${localId}/solicitud-prorroga`, datos),
  registrarExpediente: (localId, numeroManual) => post(`/locales/${localId}/expedientes`, { numeroManual }),
  // Reemplaza un expediente PROV- por el número de la mesa de entradas.
  numeroDefinitivoExpediente: (id, numero) => put(`/expedientes/${id}/numero`, { numero }),
  reingresar: (localId, motivo) => post(`/locales/${localId}/reingreso`, { motivo }),

  // --- herramientas ---------------------------------------------------------
  fusiones: () => get('/herramientas/fusiones'),
  fusionar: (idPrincipal, idDuplicado) => post('/herramientas/fusiones', { idPrincipal, idDuplicado }),
  geocodificar: () => post('/herramientas/geocodificar'),
  recalcularEstados: () => post('/herramientas/recalcular-estados'),
  coordenadasFuera: () => get('/herramientas/coordenadas-fuera'),
  proponerCoordenadas: (ids) => post('/herramientas/coordenadas/propuestas', { ids }),
  aplicarCoordenadas: (cambios) => post('/herramientas/coordenadas/aplicar', { cambios }),

  // --- informe de la prestataria (modelo de foto) ----------------------------
  informe9djCargas: () => get('/informe-9dj/cargas'),
  informe9djCarga: (id) => get(`/informe-9dj/cargas/${id}`),
  informe9djSubir: (datos) => post('/informe-9dj/cargas', datos),
  // `datos` es { decision, idLocal?, datosAlta?, forzar? }
  informe9djDecidir: (idCarga, idFila, datos) => put(`/informe-9dj/cargas/${idCarga}/filas/${idFila}`, datos),
  informe9djAplicar: (id, datos) => post(`/informe-9dj/cargas/${id}/aplicar`, datos),
  informe9djDescartar: (id) => post(`/informe-9dj/cargas/${id}/descartar`),
  informe9djAnular: (id, motivo) => post(`/informe-9dj/cargas/${id}/anular`, { motivo }),
};
