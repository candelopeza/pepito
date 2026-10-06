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
   - NO HAY AUDITORÍA: no existe esa tabla. El historial de un local es su lista
     de trámites, que ya trae GET /locales/:id.
   - LOS PARÁMETROS Y LA PLANTILLA SON DE SOLO LECTURA: viven en el código del
     backend (backend/parametros-sistema.js), no en una tabla.
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
import { bandejas, cedulas, conEstado, documentosPorVencer, indicadores, porVencer, presentacionesPendientes } from './vistas';
import { hoyISO } from '../dominio/fechas';
import { deLocal } from '../dominio/actuaciones';
import { useRol } from '../auth/rolContexto';

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
  // la leen: no existe esa tabla (el historial son los trámites).
  auditoria: [],
  parametros: {},
  plantillaCedula: '',
  limiteMunicipal: [],
  limiteOficial: false,
  secuencias: { cedula: 0, expediente: 0 },
};

function DatosProvider({ children }) {
  const { usuario } = useRol();
  const [base, setBase] = useState(BASE_VACIA);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [aviso, setAviso] = useState(null);
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
     más lento, no la suma. Son nueve y el pesado es /locales.
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
      limite,
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
      api.limiteMunicipal(),
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

    setBase({
      locales,
      actuaciones,
      relevamientos,
      usuarios,
      rubros,
      feriados,
      fusiones,
      auditoria: [],
      parametros,
      plantillaCedula: plantilla?.texto ?? '',
      /* El polígono del ejido, para que el mapa dibuje EL MISMO límite contra
         el que valida el backend (sección 9.2 del pliego). */
      limiteMunicipal: limite?.poligono ?? [],
      limiteOficial: Boolean(limite?.oficial),
      secuencias: { cedula: ultimaCedula, expediente: 0 },
    });
  }, []);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    cargarTodo()
      .then(() => {
        if (vigente) setErrorCarga(null);
      })
      .catch((e) => {
        if (vigente) setErrorCarga(e.message);
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
        if (mensajeOk) setAviso({ tipo: 'success', texto: mensajeOk });
        return resultado;
      } catch (e) {
        setAviso({ tipo: 'error', texto: e.message });
        return null;
      }
    },
    [cargarTodo],
  );

  /* ==========================================================================
     PADRÓN
     ========================================================================== */

  /* Alta y edición. La coordenada NO se manda: la obtiene el backend
     geocodificando la dirección declarada, que es la única fuente válida
     (sección 9.2 del pliego). */
  const guardarLocal = useCallback(
    (datos) =>
      ejecutar(datos.id ? 'Local actualizado' : 'Local dado de alta', () =>
        datos.id ? api.localEdicion(datos.id, datos) : api.localAlta(datos),
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

  const geocodificarPendientes = useCallback(
    () =>
      ejecutar(null, async () => {
        const r = await api.geocodificar();
        setAviso({
          tipo: 'success',
          texto: `Geocodificación: ${r.resueltos} de ${r.revisados} direcciones resueltas`,
        });
        return r;
      }),
    [ejecutar],
  );

  /* ==========================================================================
     RELEVAMIENTO  (etapas 1 y 2)
     ========================================================================== */
  const crearRelevamiento = useCallback(
    (datos) => ejecutar('Relevamiento registrado', () => api.crearRelevamiento(datos)),
    [ejecutar],
  );

  const revisarRelevamiento = useCallback(
    (localId, resultado) => ejecutar('Control administrativo registrado', () => api.revisarRelevamiento(localId, resultado)),
    [ejecutar],
  );

  /* ==========================================================================
     NOTIFICACIONES  (etapas 3 y 4)
     ========================================================================== */
  const generarCedula = useCallback(
    (localId) => ejecutar('Cédula emitida', () => api.generarCedula(localId)),
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

  const marcarImpresa = useCallback(
    (actuacionId) => ejecutar('Impresión registrada', () => api.marcarImpresa(actuacionId)),
    [ejecutar],
  );

  /* Acá empieza a correr el plazo: el backend calcula el vencimiento una sola
     vez, con los feriados y los parámetros vigentes ese día. */
  const registrarEntrega = useCallback(
    (actuacionId, datos) => ejecutar('Entrega registrada', () => api.registrarEntrega(actuacionId, datos)),
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
    (actuacionId, aprobar, observaciones = '') =>
      ejecutar(aprobar ? 'Presentación aprobada' : 'Presentación rechazada', () =>
        api.validarPresentacion(actuacionId, aprobar, observaciones),
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

  const registrarExpediente = useCallback(
    (localId, numeroManual) => ejecutar('Expediente registrado', () => api.registrarExpediente(localId, numeroManual)),
    [ejecutar],
  );

  const reingresarAlCircuito = useCallback(
    (localId, motivo) => ejecutar('Local reingresado al circuito', () => api.reingresar(localId, motivo)),
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
  const guardarParametros = useCallback(
    () =>
      setAviso({
        tipo: 'info',
        texto: 'Los plazos se editan en backend/parametros-sistema.js. Para cambiarlos desde acá hace falta una tabla de parámetros en la base.',
      }),
    [],
  );

  const guardarPlantilla = useCallback(
    () =>
      setAviso({
        tipo: 'info',
        texto: 'La plantilla de la cédula se edita en backend/parametros-sistema.js.',
      }),
    [],
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
      // No hay tabla de auditoría: el historial de un local son sus trámites.
      auditoriaDeLocal: () => [],
      bandejasPara: (rol, modo) => bandejas(localesConEstado, rol, modo),
      cedulas: () => cedulas(base),
      porVencer: (dias) => porVencer(localesConEstado, dias),
      documentosPorVencer: (dias) => documentosPorVencer(base, localesConEstado, dias, hoy),
      presentacionesPendientes: () => presentacionesPendientes(base),
      indicadores: () => indicadores(base, localesConEstado, hoy),

      // --- acciones
      guardarLocal,
      eliminarLocal,
      bloquearLocal,
      desbloquearLocal,
      geocodificarPendientes,
      crearRelevamiento,
      revisarRelevamiento,
      generarCedula,
      regenerarCedula,
      asignarNotificador,
      marcarImpresa,
      registrarEntrega,
      registrarDocumento,
      validarPresentacion,
      otorgarProrroga,
      registrarExpediente,
      reingresarAlCircuito,
      fusionarLocales,
      guardarEnCatalogo,
      eliminarDeCatalogo,
      guardarParametros,
      guardarPlantilla,
      reiniciarDemo,
    }),
    [
      base, hoy, cargando, cargarTodo, localesConEstado,
      guardarLocal, eliminarLocal, bloquearLocal, desbloquearLocal, geocodificarPendientes,
      crearRelevamiento, revisarRelevamiento, generarCedula, regenerarCedula, asignarNotificador,
      marcarImpresa, registrarEntrega, registrarDocumento, validarPresentacion, otorgarProrroga,
      registrarExpediente, reingresarAlCircuito, fusionarLocales,
      guardarEnCatalogo, eliminarDeCatalogo, guardarParametros, guardarPlantilla, reiniciarDemo,
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
