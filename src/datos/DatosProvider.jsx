/* ============================================================================
   datos/DatosProvider.jsx  —  EL STORE. TODO LO QUE MODIFICA DATOS PASA POR ACÁ
   ----------------------------------------------------------------------------
   >>> ESTE ARCHIVO REEMPLAZA AL BACKEND MIENTRAS NO EXISTA <<<
   Cada función de abajo es, uno a uno, un endpoint que va a haber que escribir.
   Los nombres están elegidos pensando en eso: guardarLocal -> PUT /locales/:id,
   generarCedula -> POST /locales/:id/cedulas, y así.

   CUANDO EXISTA LA API: se cambia SOLO este archivo. Las pantallas llaman a
   estas funciones con useDatos() y no saben de dónde salen los datos, así que
   no hay que tocar ninguna.

   ---------------------------------------------------------------------------
   DOS COSAS QUE HACEN QUE ESTO NO SE DESALINEE NUNCA

   1. NINGUNA FUNCIÓN ESCRIBE EL ESTADO DEL LOCAL.
      El estado se calcula (dominio/reglas.js). Las funciones registran
      ACTUACIONES; el estado sale de eso. Es imposible que un local quede con
      un estado que no se corresponde con su historial, que es el bug crónico
      del sistema viejo.

   2. TODA MODIFICACIÓN PASA POR despachar().
      Ese envoltorio compara los estados de todos los locales antes y después
      del cambio y anota solo, en la tabla de auditoría, quién cambió qué y por
      qué (sección 5.2). No hay forma de cambiar un estado sin dejar rastro,
      porque no depende de que uno se acuerde de registrarlo.
   ---------------------------------------------------------------------------

   PERSISTENCIA: guarda en localStorage del navegador, así F5 no borra la demo.
   Es del navegador de cada uno, no es una base compartida. Se limpia desde
   Configuración → Parámetros → "Reiniciar datos de demostración".
   ============================================================================ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DatosContext } from './datosContexto';
import { crearSemilla } from './semilla';
import { bandejas, cedulas, conEstado, documentosPorVencer, indicadores, porVencer, presentacionesPendientes } from './vistas';
import { hoyISO, vencimientoHabil } from '../dominio/fechas';
import { vencimientoDocumento } from '../dominio/vigencias';
import { resolverEstado } from '../dominio/reglas';
import { geocodificar } from '../dominio/geo';
import { deLocal, numeroCedula } from '../dominio/actuaciones';
import { useRol } from '../auth/rolContexto';

const CLAVE_ALMACEN = 'gg-datos-v3';

function leerAlmacen() {
  try {
    const crudo = localStorage.getItem(CLAVE_ALMACEN);
    if (!crudo) return null;
    const datos = JSON.parse(crudo);
    // Si cambia la forma de los datos, la semilla nueva gana: un store viejo
    // con campos que ya no existen rompe pantallas de formas raras.
    if (datos.version !== crearSemilla().version) return null;
    return datos;
  } catch {
    return null;
  }
}

/* Siguiente id de una lista. No reutiliza números dados de baja. */
const siguienteId = (lista) => lista.reduce((max, x) => Math.max(max, Number(x.id) || 0), 0) + 1;

/* Atajo para modificar un local puntual. Es pura, así que vive acá afuera. */
const conLocal = (prev, localId, cambios) => ({
  ...prev,
  locales: prev.locales.map((l) => (l.id === localId ? { ...l, ...cambios } : l)),
});

function DatosProvider({ children }) {
  const { usuario } = useRol();
  const [base, setBase] = useState(() => leerAlmacen() ?? crearSemilla());
  const hoy = hoyISO();

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(base));
    } catch {
      // Modo privado o almacenamiento lleno: la app sigue funcionando en
      // memoria, solo se pierde al recargar.
    }
  }, [base]);

  /* ==========================================================================
     despachar()  —  el envoltorio por donde pasa TODO cambio
     --------------------------------------------------------------------------
     `motivo` es el texto que queda en la auditoría. Escribilo pensando en
     alguien que dentro de dos años tiene que entender qué pasó.
     ========================================================================== */
  const despachar = useCallback(
    (motivo, transformar) => {
      setBase((prev) => {
        const siguiente = transformar(prev);
        if (!siguiente) return prev;

        const antes = new Map(prev.locales.map((l) => [l.id, resolverEstado(l, prev.actuaciones, { hoy })]));
        const filas = [];

        siguiente.locales.forEach((l) => {
          const nuevo = resolverEstado(l, siguiente.actuaciones, { hoy });
          const anterior = antes.get(l.id) ?? null;
          if (anterior !== nuevo) {
            filas.push({
              id: `${Date.now()}-${l.id}-${filas.length}`,
              localId: l.id,
              estadoAnterior: anterior,
              estadoNuevo: nuevo,
              motivo,
              actor: usuario?.nombre ?? 'Sistema',
              momento: new Date().toISOString(),
            });
          }
        });

        return filas.length ? { ...siguiente, auditoria: [...siguiente.auditoria, ...filas] } : siguiente;
      });
    },
    [hoy, usuario],
  );

  /* Atajo para agregar una actuación firmada por el usuario actual.
     Va en useCallback porque lo usan varias acciones que también están
     memorizadas: si cambiara de identidad en cada render, todas se
     recrearían y el useMemo del final no serviría para nada. */
  const conActuacion = useCallback(
    (prev, actuacion) => ({
      ...prev,
      actuaciones: [
        ...prev.actuaciones,
        { id: siguienteId(prev.actuaciones), usuario: usuario?.nombre ?? 'Sistema', ...actuacion },
      ],
    }),
    [usuario],
  );

  /* ==========================================================================
     PADRÓN
     ========================================================================== */

  /* Alta y edición. La coordenada NO se recibe: se obtiene geocodificando la
     dirección declarada, que es la única fuente válida (sección 9.2). */
  const guardarLocal = useCallback(
    (datos) => {
      despachar(datos.id ? `Edición de datos del local` : 'Alta manual de local', (prev) => {
        const geo = geocodificar(datos.direccion);
        const ubicacion = geo.ok
          ? { latitud: geo.latitud, longitud: geo.longitud, motivoSinGeo: null }
          : { latitud: null, longitud: null, motivoSinGeo: geo.motivo };

        if (datos.id && prev.locales.some((l) => l.id === datos.id)) {
          return conLocal(prev, datos.id, { ...datos, ...ubicacion });
        }
        const id = siguienteId(prev.locales);
        return {
          ...prev,
          locales: [...prev.locales, { estadoInicial: 'REVISION_DATOS', bloqueado: false, ...datos, ...ubicacion, id }],
        };
      });
    },
    [despachar],
  );

  const eliminarLocal = useCallback(
    (localId) => {
      despachar('Baja de local', (prev) => ({
        ...prev,
        locales: prev.locales.filter((l) => l.id !== localId),
        actuaciones: prev.actuaciones.filter((a) => a.localId !== localId),
        relevamientos: prev.relevamientos.filter((r) => r.localId !== localId),
      }));
    },
    [despachar],
  );

  /* Bloqueo manual (sección 3.4). Queda quién, cuándo y por qué, y el estado
     se congela en el que tenía al momento del bloqueo. */
  const bloquearLocal = useCallback(
    (localId, motivo) => {
      despachar(`Bloqueo manual: ${motivo}`, (prev) => {
        const local = prev.locales.find((l) => l.id === localId);
        if (!local) return null;
        return conLocal(prev, localId, {
          bloqueado: true,
          bloqueadoMotivo: motivo,
          bloqueadoPor: usuario?.nombre ?? 'Sistema',
          bloqueadoEn: new Date().toISOString(),
          estadoCongelado: resolverEstado(local, prev.actuaciones, { hoy }),
        });
      });
    },
    [despachar, hoy, usuario],
  );

  const desbloquearLocal = useCallback(
    (localId) => {
      despachar('Se levantó el bloqueo manual', (prev) =>
        conLocal(prev, localId, { bloqueado: false, bloqueadoMotivo: '', estadoCongelado: null }),
      );
    },
    [despachar],
  );

  /* Proceso diario de geocodificación (sección 9.1). Acá se dispara a mano
     desde Herramientas para poder mostrarlo. */
  const geocodificarPendientes = useCallback(() => {
    despachar('Geocodificación de direcciones pendientes', (prev) => ({
      ...prev,
      locales: prev.locales.map((l) => {
        if (l.latitud !== null && l.longitud !== null) return l;
        const geo = geocodificar(l.direccion);
        return geo.ok
          ? { ...l, latitud: geo.latitud, longitud: geo.longitud, motivoSinGeo: null }
          : { ...l, motivoSinGeo: geo.motivo };
      }),
    }));
  }, [despachar]);

  /* ==========================================================================
     RELEVAMIENTO  (etapa 1)
     --------------------------------------------------------------------------
     El formulario de campo NO pide CUIT ni razón social: los relevadores no
     tienen facultades de inspector y no están autorizados a requerir esa
     información al comerciante. Los datos registrales los completa la oficina
     desde la constancia de inscripción fiscal (sección 6.2).
     ========================================================================== */
  const crearRelevamiento = useCallback(
    (datos) => {
      despachar(
        `Relevamiento de campo: clasificado como ${datos.clasificacion === 'GRAN_GENERADOR' ? 'Gran Generador' : 'Generador Menor'}`,
        (prev) => {
          const localId = siguienteId(prev.locales);
          const geo = geocodificar(datos.direccionRelevada);

          const nuevoLocal = {
            id: localId,
            idLegacy: null,
            nombreLocal: datos.nombreLocal,
            razonSocial: '',
            cuit: '',
            rubro: datos.rubro,
            direccion: datos.direccionRelevada,
            domicilioFiscal: '',
            email: '',
            telefono: '',
            observaciones: datos.observaciones ?? '',
            titularCuil: null,
            bloqueado: false,
            estadoCongelado: null,
            // La coordenada del padrón sale de la dirección, NUNCA del GPS del
            // dispositivo. Ver el encabezado de dominio/geo.js.
            latitud: geo.ok ? geo.latitud : null,
            longitud: geo.ok ? geo.longitud : null,
            motivoSinGeo: geo.ok ? null : geo.motivo,
            estadoInicial: datos.clasificacion === 'GRAN_GENERADOR' ? 'REVISION_DATOS' : 'EXENTO_REVISION',
          };

          const nuevoRelevamiento = {
            id: siguienteId(prev.relevamientos),
            localId,
            usuario: usuario?.nombre ?? 'Sistema',
            fechaHora: new Date().toISOString(),
            direccionRelevada: datos.direccionRelevada,
            // Coordenada del DISPOSITIVO al guardar. Es una métrica del trabajo
            // de campo, no la ubicación del establecimiento.
            latitud: datos.latitud ?? null,
            longitud: datos.longitud ?? null,
            nombreLocal: datos.nombreLocal,
            rubro: datos.rubro,
            clasificacion: datos.clasificacion,
            revisadoPor: null,
            revisadoEn: null,
            offline: Boolean(datos.offline),
          };

          return {
            ...prev,
            locales: [...prev.locales, nuevoLocal],
            relevamientos: [...prev.relevamientos, nuevoRelevamiento],
          };
        },
      );
    },
    [despachar, usuario],
  );

  /* Control administrativo (etapa 2). Los tres cierres posibles del control. */
  const revisarRelevamiento = useCallback(
    (localId, resultado) => {
      const motivos = {
        EXENTO_CONFIRMADO: 'Coordinación confirmó la exención',
        GRAN_GENERADOR: 'Coordinación corrigió la clasificación: sí es Gran Generador',
        HABILITADO: 'Coordinación habilitó la notificación',
      };
      const estados = {
        EXENTO_CONFIRMADO: 'EXENTO_CONFIRMADO',
        GRAN_GENERADOR: 'NOTIF1_PENDIENTE',
        HABILITADO: 'NOTIF1_PENDIENTE',
      };
      despachar(motivos[resultado], (prev) => {
        const conRevision = {
          ...prev,
          relevamientos: prev.relevamientos.map((r) =>
            r.localId === localId && !r.revisadoEn
              ? { ...r, revisadoPor: usuario?.nombre ?? 'Sistema', revisadoEn: new Date().toISOString(), resultadoRevision: resultado }
              : r,
          ),
        };
        return conLocal(conRevision, localId, { estadoInicial: estados[resultado] });
      });
    },
    [despachar, usuario],
  );

  /* ==========================================================================
     NOTIFICACIONES  (etapas 3 y 4)
     ========================================================================== */

  /* Emite la cédula. La instancia se deduce del estado: no se elige a mano,
     así no se puede emitir una primera notificación en un local que ya tiene
     una segunda (sección 6.1, "Registro de actuaciones").

     El número sale de una secuencia controlada, sin reutilización (sección 5.4).
     La emisión NO altera ningún plazo: el cómputo arranca en la entrega. */
  const generarCedula = useCallback(
    (localId) => {
      despachar('Se emitió la cédula de notificación', (prev) => {
        const local = prev.locales.find((l) => l.id === localId);
        if (!local) return null;
        const estado = resolverEstado(local, prev.actuaciones, { hoy });
        const instancia = estado.startsWith('NOTIF2') ? 2 : 1;
        const numero = prev.secuencias.cedula + 1;

        const conNueva = conActuacion(prev, {
          localId,
          tipo: 'NOTIFICACION',
          fecha: hoy,
          instancia,
          numeroCedula: numeroCedula(numero),
          notificadorId: null,
          fechaEntrega: null,
          plazoDias: instancia === 1 ? prev.parametros.plazoNotif1 : prev.parametros.plazoNotif2,
          fechaVencimiento: null,
          resultado: null,
          evidencia: null,
          impresaPor: null,
          impresaEn: null,
          observaciones: '',
        });
        return { ...conNueva, secuencias: { ...prev.secuencias, cedula: numero } };
      });
    },
    [despachar, hoy, conActuacion],
  );

  /* Regeneración: se corrigieron datos del local después de emitir. Reemplaza
     el documento y le da número nuevo, porque el anterior ya salió con datos
     mal y no puede quedar circulando con el mismo número. */
  const regenerarCedula = useCallback(
    (actuacionId) => {
      despachar('Se regeneró la cédula por corrección de datos', (prev) => {
        const numero = prev.secuencias.cedula + 1;
        return {
          ...prev,
          secuencias: { ...prev.secuencias, cedula: numero },
          actuaciones: prev.actuaciones.map((a) =>
            a.id === actuacionId
              ? {
                  ...a,
                  numeroCedula: numeroCedula(numero),
                  fecha: hoy,
                  impresaPor: null,
                  impresaEn: null,
                  observaciones: `${a.observaciones ? `${a.observaciones} · ` : ''}Reemplaza la cédula ${a.numeroCedula}.`,
                }
              : a,
          ),
        };
      });
    },
    [despachar, hoy],
  );

  const asignarNotificador = useCallback(
    (actuacionId, notificadorId) => {
      despachar('Se asignó notificador a la cédula', (prev) => ({
        ...prev,
        actuaciones: prev.actuaciones.map((a) => (a.id === actuacionId ? { ...a, notificadorId: Number(notificadorId) || null } : a)),
      }));
    },
    [despachar],
  );

  /* Constancia de impresión (sección 9.6): quién imprimió y cuándo. Evita
     tanto la duplicación como el olvido, sin depender de la memoria de nadie. */
  const marcarImpresa = useCallback(
    (actuacionId) => {
      despachar('Se registró la impresión de la cédula', (prev) => ({
        ...prev,
        actuaciones: prev.actuaciones.map((a) =>
          a.id === actuacionId && !a.impresaEn
            ? { ...a, impresaPor: usuario?.nombre ?? 'Sistema', impresaEn: new Date().toISOString() }
            : a,
        ),
      }));
    },
    [despachar, usuario],
  );

  /* >>> ACÁ EMPIEZA A CORRER EL PLAZO <<<
     Es el único lugar del sistema donde se calcula una fecha de vencimiento de
     notificación, y se calcula UNA vez y se guarda (vencimiento materializado).
     Si el resultado no hace correr el plazo (no entregada), no hay vencimiento:
     el circuito se detiene hasta que la entrega se concrete. */
  const registrarEntrega = useCallback(
    (actuacionId, { resultado, fechaEntrega, observaciones, evidencia }) => {
      despachar(`Resultado de entrega registrado: ${resultado}`, (prev) => {
        const corre = resultado !== 'NO_ENTREGADA';
        const act = prev.actuaciones.find((a) => a.id === actuacionId);
        if (!act) return null;
        const plazoDias = act.instancia === 1 ? prev.parametros.plazoNotif1 : prev.parametros.plazoNotif2;

        return {
          ...prev,
          actuaciones: prev.actuaciones.map((a) =>
            a.id === actuacionId
              ? {
                  ...a,
                  resultado,
                  fechaEntrega: corre ? fechaEntrega : null,
                  plazoDias,
                  fechaVencimiento: corre
                    ? vencimientoHabil(fechaEntrega, plazoDias, prev.feriados, prev.parametros.contarDiaEntrega)
                    : null,
                  evidencia: evidencia ?? a.evidencia,
                  observaciones: observaciones ?? a.observaciones,
                }
              : a,
          ),
        };
      });
    },
    [despachar],
  );

  /* ==========================================================================
     DOCUMENTACIÓN  (sección 4.5)
     --------------------------------------------------------------------------
     Todo documento lleva el número de SU EXPEDIENTE DE TRÁMITE, que es el que
     se inicia en CiDiTuc al presentarlo. Es un dato distinto del expediente de
     multa: uno acredita cumplimiento, el otro inicia una sanción. No comparten
     campo ni tipo de actuación. El sistema viejo no guardaba este número, así
     que hoy no se puede reconstruir el trámite que respalda una acreditación.
     ========================================================================== */
  const registrarDocumento = useCallback(
    (localId, datos) => {
      const validado = datos.validado !== false;
      despachar(
        validado ? `Se registró documentación: ${datos.tipo}` : `Presentación del titular pendiente de validación: ${datos.tipo}`,
        (prev) =>
          conActuacion(prev, {
            localId,
            tipo: datos.tipo,
            fecha: datos.fechaEmision || hoy,
            numero: datos.numero,
            fechaEmision: datos.fechaEmision,
            // El vencimiento se calcula y se almacena. La DDJJ vence al año
            // exacto; el contrato trae su propia fecha.
            fechaVencimiento: vencimientoDocumento(datos, prev.parametros.modoBisiesto),
            origen: datos.origen ?? 'PRESENTADO_TITULAR',
            expedienteTramite: datos.expedienteTramite ?? null,
            archivo: datos.archivo ?? null,
            validado,
            observaciones: datos.observaciones ?? '',
          }),
      );
    },
    [despachar, hoy, conActuacion],
  );

  /* Bandeja de validación del portal. Hasta que un agente aprueba, el
     documento no suspende ningún plazo. */
  const validarPresentacion = useCallback(
    (actuacionId, aprobar, observaciones = '') => {
      despachar(aprobar ? 'Presentación del portal aprobada' : 'Presentación del portal rechazada', (prev) =>
        aprobar
          ? {
              ...prev,
              actuaciones: prev.actuaciones.map((a) =>
                a.id === actuacionId
                  ? { ...a, validado: true, observaciones: `${a.observaciones ? `${a.observaciones} · ` : ''}Aprobada por ${usuario?.nombre}. ${observaciones}`.trim() }
                  : a,
              ),
            }
          : { ...prev, actuaciones: prev.actuaciones.filter((a) => a.id !== actuacionId) },
      );
    },
    [despachar, usuario],
  );

  /* ==========================================================================
     PRÓRROGA  (etapa 5)
     --------------------------------------------------------------------------
     Los días NO tienen valor por defecto: es el único plazo que se ingresa
     manualmente en cada caso (sección 4.1).
     ========================================================================== */
  const otorgarProrroga = useCallback(
    (localId, { dias, motivo }) => {
      despachar(`Prórroga otorgada por ${dias} días`, (prev) =>
        conActuacion(prev, {
          localId,
          tipo: 'PRORROGA',
          fecha: hoy,
          diasOtorgados: Number(dias),
          // Días corridos desde el otorgamiento: la prórroga no se cuenta en
          // días hábiles, a diferencia del plazo de las notificaciones.
          fechaVencimiento: (() => {
            const f = new Date(`${hoy}T12:00:00`);
            f.setDate(f.getDate() + Number(dias));
            return f.toISOString().slice(0, 10);
          })(),
          motivo,
          observaciones: '',
        }),
      );
    },
    [despachar, hoy, conActuacion],
  );

  /* ==========================================================================
     EXPEDIENTE DE MULTA  (etapa 6)
     ========================================================================== */
  const registrarExpediente = useCallback(
    (localId, numeroManual) => {
      despachar('Se inició el expediente de multa', (prev) => {
        const numero = prev.secuencias.expediente + 1;
        const anio = hoy.slice(0, 4);
        const conNueva = conActuacion(prev, {
          localId,
          tipo: 'EXPEDIENTE',
          fecha: hoy,
          // Si la integración con expedientes municipales no responde, el
          // número se ingresa a mano y se reconcilia después (sección 8.3).
          numeroExpediente: numeroManual || `EXP-${anio}-${String(numero).padStart(6, '0')}`,
          observaciones: numeroManual ? 'Número ingresado manualmente.' : 'Número asignado por el sistema.',
        });
        return numeroManual ? conNueva : { ...conNueva, secuencias: { ...prev.secuencias, expediente: numero } };
      });
    },
    [despachar, hoy, conActuacion],
  );

  /* El expediente NO es terminal: coordinación puede reingresar el local y la
     intimación arranca de cero. */
  const reingresarAlCircuito = useCallback(
    (localId, motivo) => {
      despachar('Reingreso al circuito desde expediente', (prev) =>
        conActuacion(prev, { localId, tipo: 'REINGRESO', fecha: hoy, observaciones: motivo ?? '' }),
      );
    },
    [despachar, hoy, conActuacion],
  );

  /* ==========================================================================
     HERRAMIENTAS
     ========================================================================== */

  /* Fusión de duplicados (sección 9.4). Las actuaciones y los relevamientos
     del duplicado pasan al principal, y queda constancia de qué ids se
     unificaron: sin eso no se puede rastrear una actuación histórica. */
  const fusionarLocales = useCallback(
    (idPrincipal, idDuplicado) => {
      despachar(`Fusión de duplicados: el local ${idDuplicado} se unificó en el ${idPrincipal}`, (prev) => {
        const duplicado = prev.locales.find((l) => l.id === idDuplicado);
        const principal = prev.locales.find((l) => l.id === idPrincipal);
        if (!duplicado || !principal) return null;

        return {
          ...prev,
          // Los datos que el principal no tenga se completan con los del
          // duplicado: la fusión no debería perder información.
          locales: prev.locales
            .filter((l) => l.id !== idDuplicado)
            .map((l) =>
              l.id === idPrincipal
                ? {
                    ...l,
                    cuit: l.cuit || duplicado.cuit,
                    razonSocial: l.razonSocial || duplicado.razonSocial,
                    email: l.email || duplicado.email,
                    telefono: l.telefono || duplicado.telefono,
                    domicilioFiscal: l.domicilioFiscal || duplicado.domicilioFiscal,
                  }
                : l,
            ),
          actuaciones: prev.actuaciones.map((a) => (a.localId === idDuplicado ? { ...a, localId: idPrincipal } : a)),
          relevamientos: prev.relevamientos.map((r) => (r.localId === idDuplicado ? { ...r, localId: idPrincipal } : r)),
          fusiones: [
            ...prev.fusiones,
            {
              id: siguienteId(prev.fusiones),
              idPrincipal,
              idDuplicado,
              idLegacyDuplicado: duplicado.idLegacy,
              nombreDuplicado: duplicado.nombreLocal,
              actor: usuario?.nombre ?? 'Sistema',
              momento: new Date().toISOString(),
            },
          ],
        };
      });
    },
    [despachar, usuario],
  );

  /* Informe de la prestataria (sección 9.3). El pliego pide reemplazar la
     automatización por CARGA MANUAL ASISTIDA: el sistema propone los cambios y
     un agente confirma. Acá llegan las filas ya confirmadas. */
  const aplicarInforme9DJ = useCallback(
    (filas) => {
      despachar(`Informe de 9 de Julio aplicado: ${filas.length} registro(s)`, (prev) => {
        let siguiente = prev;
        filas.forEach((fila) => {
          let localId = fila.localId;

          if (!localId) {
            // Alta: los locales creados desde el informe llevan prefijo CON en
            // el id legacy, igual que en el sistema viejo.
            localId = siguienteId(siguiente.locales);
            const geo = geocodificar(fila.direccion);
            siguiente = {
              ...siguiente,
              locales: [
                ...siguiente.locales,
                {
                  id: localId,
                  idLegacy: `CON-${String(localId).padStart(4, '0')}`,
                  nombreLocal: fila.razonSocial,
                  razonSocial: fila.razonSocial,
                  cuit: fila.cuit,
                  rubro: '',
                  direccion: fila.direccion,
                  domicilioFiscal: '',
                  email: '',
                  telefono: '',
                  observaciones: 'Creado desde el informe de la prestataria.',
                  titularCuil: null,
                  bloqueado: false,
                  estadoCongelado: null,
                  latitud: geo.ok ? geo.latitud : null,
                  longitud: geo.ok ? geo.longitud : null,
                  motivoSinGeo: geo.ok ? null : geo.motivo,
                  estadoInicial: 'REVISION_DATOS',
                },
              ],
            };
          }

          siguiente = {
            ...siguiente,
            actuaciones: [
              ...siguiente.actuaciones,
              {
                id: siguienteId(siguiente.actuaciones),
                localId,
                tipo: 'CONTRATO',
                fecha: hoy,
                usuario: usuario?.nombre ?? 'Sistema',
                numero: fila.numeroContrato,
                fechaEmision: hoy,
                fechaVencimiento: fila.vencimiento,
                // El origen es lo que distingue este contrato del presentado
                // por el titular: distinto valor probatorio (sección 4.6).
                origen: 'INFORME_9DJ',
                expedienteTramite: null,
                archivo: null,
                validado: true,
                observaciones: 'Informado por la empresa 9 de Julio.',
              },
            ],
          };
        });
        return siguiente;
      });
    },
    [despachar, hoy, usuario],
  );

  /* ==========================================================================
     CONFIGURACIÓN
     ========================================================================== */
  const guardarEnCatalogo = useCallback(
    (clave, item) => {
      despachar(`Configuración: se guardó un registro en ${clave}`, (prev) => ({
        ...prev,
        [clave]: item.id
          ? prev[clave].map((x) => (x.id === item.id ? { ...x, ...item } : x))
          : [...prev[clave], { ...item, id: siguienteId(prev[clave]) }],
      }));
    },
    [despachar],
  );

  const eliminarDeCatalogo = useCallback(
    (clave, id) => {
      despachar(`Configuración: se eliminó un registro de ${clave}`, (prev) => ({
        ...prev,
        [clave]: prev[clave].filter((x) => x.id !== id),
      }));
    },
    [despachar],
  );

  /* Los plazos solo los puede tocar Dirección. El control del rol está en la
     pantalla; acá se guarda lo que llegue. La restricción de verdad va en el
     backend: esto corre en el navegador del usuario. */
  const guardarParametros = useCallback(
    (parametros) => {
      despachar('Se modificaron los parámetros del sistema', (prev) => ({ ...prev, parametros: { ...prev.parametros, ...parametros } }));
    },
    [despachar],
  );

  const guardarPlantilla = useCallback(
    (texto) => {
      despachar('Se modificó la plantilla de la cédula', (prev) => ({ ...prev, plantillaCedula: texto }));
    },
    [despachar],
  );

  const reiniciarDemo = useCallback(() => {
    localStorage.removeItem(CLAVE_ALMACEN);
    setBase(crearSemilla());
  }, []);

  /* ==========================================================================
     DERIVADOS
     --------------------------------------------------------------------------
     Se recalculan cuando cambian los datos. El estado de los 20 locales de la
     demo se resuelve en microsegundos; con 2.000 tampoco es un problema, pero
     si algún día lo fuera, el punto a optimizar es este useMemo, no las reglas.
     ========================================================================== */
  const localesConEstado = useMemo(() => conEstado(base, hoy), [base, hoy]);

  const valor = useMemo(
    () => ({
      // --- datos crudos
      ...base,
      hoy,

      // --- derivados
      localesConEstado,
      localPorId: (id) => localesConEstado.find((l) => l.id === Number(id)) ?? null,
      actuacionesDeLocal: (id) => deLocal(base.actuaciones, Number(id)),
      relevamientosDeLocal: (id) => base.relevamientos.filter((r) => r.localId === Number(id)),
      auditoriaDeLocal: (id) => base.auditoria.filter((a) => a.localId === Number(id)),
      // `modo` es el orden de las bandejas: 'prioridad' (por defecto) o 'cantidad'.
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
      aplicarInforme9DJ,
      guardarEnCatalogo,
      eliminarDeCatalogo,
      guardarParametros,
      guardarPlantilla,
      reiniciarDemo,
    }),
    [
      base, hoy, localesConEstado,
      guardarLocal, eliminarLocal, bloquearLocal, desbloquearLocal, geocodificarPendientes,
      crearRelevamiento, revisarRelevamiento, generarCedula, regenerarCedula, asignarNotificador,
      marcarImpresa, registrarEntrega, registrarDocumento, validarPresentacion, otorgarProrroga,
      registrarExpediente, reingresarAlCircuito, fusionarLocales, aplicarInforme9DJ,
      guardarEnCatalogo, eliminarDeCatalogo, guardarParametros, guardarPlantilla, reiniciarDemo,
    ],
  );

  return <DatosContext.Provider value={valor}>{children}</DatosContext.Provider>;
}

export default DatosProvider;
