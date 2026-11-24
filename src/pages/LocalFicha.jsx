/* ============================================================================
   pages/LocalFicha.jsx  —  FICHA DEL LOCAL  (URL: /#/locales/:id)
   ----------------------------------------------------------------------------
   >>> ES LA PANTALLA MÁS IMPORTANTE DEL SISTEMA <<<
   Es donde alguien decide un acto administrativo, así que tiene que mostrar
   TODO el contexto de esa decisión en un solo lugar (sección 6.1).

   TRES BLOQUES:
     1. Situación actual   estado, plazo en curso, documentación vigente, y las
                           acciones que corresponden
     2. Datos del padrón   incluido el relevamiento de origen
     3. Historial          todas las actuaciones en orden cronológico

   EL HISTORIAL ES LA TRAZABILIDAD. Cada trámite guarda quién lo registró y
   cuándo, así que de ahí sale qué le pasó al local y en qué orden.

   LAS DOS COORDENADAS SE MUESTRAN SEPARADAS Y ETIQUETADAS. No es un detalle
   estético: son datos distintos con propósitos distintos, y confundirlos es el
   error conceptual que arrastra el sistema actual (sección 9.2).

   EDITAR DATOS (2026-10-02): quien edita el padrón corrige el teléfono o el
   correo desde acá, sin volver al listado. El acto "Completar datos" sigue
   igual: ese es el paso del circuito; esto es mantener el padrón al día.

   >>> FICHA DE CONSULTA PARA RELEVADOR Y NOTIFICADOR (20/11/2026) <<<
   Pedido de cande: los agentes de calle consultan el local pero no ven los
   datos sensibles ni el historial (config/modulos.js, ROLES_SOLO_CONSULTA).
   Ven: nombre, dirección, rubro, ubicación, estado y las acciones de SU rol
   (el notificador registra entregas desde acá). No ven: razón social, CUIT,
   domicilio fiscal, correo, teléfono, CUIL del titular, observaciones,
   plazos, avisos del circuito, relevamiento de origen ni historiales.
   ============================================================================ */

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import Badge, { BadgeEstado } from '../components/ui/Badge';
import Aviso, { Vacio } from '../components/ui/Aviso';
import { Dato } from '../components/ui/Campo';
import AccionesLocal from '../components/AccionesLocal';
import HistorialActuaciones from '../components/HistorialActuaciones';
import HistorialEstados from '../components/HistorialEstados';
import ArchivoGuardado from '../components/ArchivoGuardado';
import Modal from '../components/ui/Modal';
import FormLocal from '../components/FormLocal';
import ConstanciaArca from '../components/ConstanciaArca';
import { useDatos } from '../datos/datosContexto';
import { useRol } from '../auth/rolContexto';
import { esSoloConsulta, puedeEditar, puedeVerRuta } from '../config/modulos';

import { ETIQUETA_DOCUMENTO, textoFrecuencia } from '../dominio/actuaciones';
import { fmtFecha, fmtFechaHora } from '../dominio/fechas';
import { faltantesRegistrales } from '../dominio/reglas';
import { colorClasificacion, etiquetaClasificacion } from '../config/catalogos';

function LocalFicha() {
  const { id } = useParams();
  const {
    localPorId,
    actuacionesDeLocal,
    relevamientosDeLocal,
    usuarios,
    capacidades,
    auditoriaDeLocal,
    cargarAuditoria,
    versionDatos,
    guardarLocal,
    permisos,
  } = useDatos();
  const { rol } = useRol();
  // Va antes del "local no encontrado": los hooks no pueden quedar después
  // de un return.
  const [editando, setEditando] = useState(false);

  const local = localPorId(id);
  const soloConsulta = esSoloConsulta(rol);

  // El historial de estados se pide al abrir la ficha, y otra vez cada vez
  // que llegan datos nuevos (después de un acto, por ejemplo). En la ficha de
  // consulta no se muestra, así que ni se pide.
  const idLocal = local?.id;
  useEffect(() => {
    if (idLocal && !soloConsulta) cargarAuditoria(idLocal);
  }, [idLocal, versionDatos, cargarAuditoria, soloConsulta]);

  // Puede pasar: alguien guardó el link de un local que después se fusionó o
  // se eliminó. Mejor decirlo que mostrar una pantalla vacía.
  if (!local) {
    return (
      <>
        <PageHeader etiqueta="LOCALES" titulo="LOCAL NO ENCONTRADO" botonVolver volverA="/locales" volverTexto="VOLVER AL PADRÓN" />
        <Vacio titulo={`No existe un local con el número ${id}`}>
          Puede haberse eliminado, o haberse unificado con otro registro desde Herramientas → Duplicados.
        </Vacio>
      </>
    );
  }

  const actuaciones = actuacionesDeLocal(local.id);
  const relevamientos = relevamientosDeLocal(local.id);
  const faltan = faltantesRegistrales(local);
  // El de ORIGEN es el primero en el tiempo. La lista llega con el más nuevo
  // adelante, así que antes se mostraba el último relevamiento.
  const relevamientoOrigen =
    [...relevamientos].sort((a, b) => String(a.fechaHora ?? '').localeCompare(String(b.fechaHora ?? '')))[0] ?? null;
  const nombreDe = (idUsuario) => usuarios.find((u) => u.id === idUsuario)?.nombre ?? idUsuario ?? '—';

  const docsVigentes = ['contrato', 'reciclaje', 'ddjj']
    .map((k) => local.vigente[k])
    .filter(Boolean);

  const puedeEditarPadron = puedeEditar(rol, 'locales', permisos) && !local.bloqueado;
  const solicitud = local.solicitudProrroga;

  return (
    <>
      <PageHeader
        etiqueta={`LOCAL N° ${local.id}${local.idLegacy && !soloConsulta ? ` · ${local.idLegacy}` : ''}`}
        titulo={local.nombreLocal}
        subtitulo={soloConsulta ? local.direccion : `${local.razonSocial || 'Sin razón social'} · ${local.direccion}`}
        botonVolver
        volverA="/locales"
        volverTexto="VOLVER AL PADRÓN"
        acciones={
          puedeEditarPadron && (
            <button type="button" className="btn-secundario" onClick={() => setEditando(true)}>
              Editar datos
            </button>
          )
        }
      />

      {editando && (
        <Modal abierto etiqueta="PADRÓN" titulo="Editar datos del local" ancho="ancho" onCerrar={() => setEditando(false)}>
          <FormLocal
            local={local}
            onGuardar={async (l) => {
              // Se cierra solo si se guardó: si falla, queda lo escrito.
              if (await guardarLocal(l)) setEditando(false);
            }}
            onCancelar={() => setEditando(false)}
          />
        </Modal>
      )}

      {/* ================= 1. SITUACIÓN ACTUAL ================= */}
      <div className="accesos-header">
        <span>Situación actual</span>
      </div>

      <div className="ficha-situacion">
        <div className="ficha-estado">
          <BadgeEstado codigo={local.estado} />
        </div>

        {local.plazo && !soloConsulta && (
          <div className={`ficha-plazo ${local.plazo.vencido ? 'ficha-plazo-vencido' : ''}`}>
            <strong>
              {local.plazo.tipo === 'PRORROGA' ? 'Prórroga' : `Plazo de la ${local.plazo.instancia === 1 ? 'primera' : 'segunda'} notificación`}
            </strong>
            <span>
              Vence el {fmtFecha(local.plazo.vencimiento)} ·{' '}
              {local.plazo.vencido ? 'VENCIDO' : `faltan ${local.diasRestantes} día(s)`}
            </span>
          </div>
        )}
      </div>

      {/* ---------- Avisos de contexto ----------
          Lo que la persona necesita saber ANTES de apretar un botón. En la
          ficha de consulta no van: son del circuito administrativo. */}
      {!soloConsulta && (
        <>
      {local.bloqueado && (
        <Aviso tipo="bloqueo" titulo="Bloqueo manual activo">
          Este local está excluido del cálculo automático de estado. Bloqueado por {nombreDe(local.bloqueadoPor)}
          {local.bloqueadoEn ? ` el ${fmtFechaHora(local.bloqueadoEn)}` : ''}. Motivo: {local.bloqueadoMotivo}
        </Aviso>
      )}

      {solicitud && (
        <Aviso
          tipo="info"
          titulo={`El titular pidió una prórroga${solicitud.dias ? ` de ${solicitud.dias} día(s)` : ''} el ${fmtFechaHora(solicitud.momento)}`}
        >
          {solicitud.motivo}
        </Aviso>
      )}

      {faltan.length > 0 && (
        <Aviso tipo="alerta" titulo="Faltan datos registrales">
          Falta {faltan.join(', ')}. La primera cédula se puede emitir igual, pero la segunda tiene que individualizar al sujeto
          obligado: sin esos datos el local no puede avanzar a la segunda notificación.
        </Aviso>
      )}

      {docsVigentes.length > 0 && (
        <Aviso tipo="ok" titulo="Documentación vigente: el local está fuera del circuito sancionatorio">
          {docsVigentes
            .map((d) => {
              // El contrato del informe 9DJ puede venir sin número ni fecha: lo
              // sostiene la última foto de la prestataria (dominio/reglas.js).
              const numero = d.numero ? ` N° ${d.numero}` : ' sin número informado';
              const hasta = d.fechaVencimiento
                ? `vigente hasta el ${fmtFecha(d.fechaVencimiento)}`
                : d.origen === 'INFORME_9DJ'
                  ? 'vigente mientras el último informe de 9 de Julio lo sostenga'
                  : 'sin fecha de vencimiento';
              return `${ETIQUETA_DOCUMENTO[d.tipo]}${numero}, ${hasta}`;
            })
            .join(' · ')}
          . Al vencer, el local reingresa automáticamente a primera notificación pendiente.
        </Aviso>
      )}

      {local.sinGeo && (
        <Aviso tipo="alerta" titulo="El local no tiene ubicación en el padrón">
          {local.motivoSinGeo} No aparece en el mapa ni entra en el ruteo de notificaciones. Corregí la dirección para que se pueda
          geocodificar.
          {puedeVerRuta(rol, '/mapa', permisos) && (
            <>
              {' '}
              <Link to="/mapa">Ver todos los pendientes en el mapa</Link>.
            </>
          )}
        </Aviso>
      )}
        </>
      )}

      {/* ---------- Las acciones ---------- */}
      <div className="accesos-header">
        <span>Acciones disponibles en este estado</span>
      </div>
      <AccionesLocal local={local} />
      {/* En todos los locales, para completar la documentación. Solo la ve
          coordinación (ConstanciaArca). */}
      <ConstanciaArca cuit={local.cuit} tarjeta />

      {/* ================= 2. DATOS DEL PADRÓN ================= */}
      <div className="accesos-header">
        <span>Datos del padrón</span>
      </div>
      {soloConsulta ? (
        <>
          <div className="ficha-datos">
            <Dato etiqueta="Rubro">{local.rubro}</Dato>
            <Dato etiqueta="Dirección del local">{local.direccion}</Dato>
            <Dato etiqueta="Ubicación del padrón (geocodificada)">
              {local.sinGeo ? 'sin ubicación' : `${local.latitud}, ${local.longitud}`}
            </Dato>
          </div>
          <p className="texto-explicacion">Los datos del titular y el historial del local los consulta la oficina.</p>
        </>
      ) : (
        <>
      <div className="ficha-datos">
        <Dato etiqueta="Razón social">{local.razonSocial}</Dato>
        <Dato etiqueta="CUIT">{local.cuit}</Dato>
        <Dato etiqueta="Rubro">{local.rubro}</Dato>
        <Dato etiqueta="Dirección del local">{local.direccion}</Dato>
        <Dato etiqueta="Domicilio fiscal">{local.domicilioFiscal}</Dato>
        <Dato etiqueta="Correo">{local.email}</Dato>
        <Dato etiqueta="Teléfono">{local.telefono}</Dato>
        <Dato etiqueta="CUIL del titular habilitado">{local.titularCuil}</Dato>
        <Dato etiqueta="Id en el sistema anterior">{local.idLegacy}</Dato>
        {/* Del contrato vigente (sql/13). La carga coordinación en Informe 9 de Julio. */}
        {local.vigente?.contrato && (
          <Dato etiqueta="Frecuencia de recolección contratada">
            {local.frecuenciaSemanal ? (
              textoFrecuencia(local.frecuenciaSemanal)
            ) : (
              <span className="texto-gris">sin cargar (Herramientas → Informe 9 de Julio)</span>
            )}
          </Dato>
        )}
        {/* Ubicación OFICIAL: la que sale de geocodificar la dirección. */}
        <Dato etiqueta="Ubicación del padrón (geocodificada)">
          {local.sinGeo ? 'sin ubicación' : `${local.latitud}, ${local.longitud}`}
        </Dato>
        <Dato etiqueta="Observaciones" ancho={2}>
          {local.observaciones}
        </Dato>
      </div>

      {/* ---------- Relevamiento de origen ---------- */}
      <div className="accesos-header">
        <span>Relevamiento de origen</span>
      </div>
      {relevamientoOrigen ? (
        <div className="ficha-datos">
          <Dato etiqueta="Relevado por">{relevamientoOrigen.usuario}</Dato>
          <Dato etiqueta="Fecha y hora">{fmtFechaHora(relevamientoOrigen.fechaHora)}</Dato>
          <Dato etiqueta="Dirección relevada">{relevamientoOrigen.direccionRelevada}</Dato>
          <Dato etiqueta="Clasificación">
            <Badge color={colorClasificacion(relevamientoOrigen.clasificacion)}>
              {etiquetaClasificacion(relevamientoOrigen.clasificacion)}
            </Badge>
          </Dato>
          {/* Coordenada del RELEVAMIENTO: métrica de campo, NO ubicación del
              local. Está etiquetada así a propósito, para que nadie la use
              como ubicación ni la copie al padrón. */}
          <Dato etiqueta="Coordenada del dispositivo (métrica de campo, no es la ubicación del local)" ancho={2}>
            {relevamientoOrigen.latitud !== null
              ? `${relevamientoOrigen.latitud}, ${relevamientoOrigen.longitud}`
              : 'no capturada (el dispositivo no tenía permiso de GPS)'}
          </Dato>
          <Dato etiqueta="Control de coordinación" ancho={2}>
            {relevamientoOrigen.revisadoEn
              ? `Controlado el ${fmtFechaHora(relevamientoOrigen.revisadoEn)}`
              : 'pendiente de control'}
          </Dato>
          {/* La foto que sacó el agente al relevar (opcional, 22/11/2026). Si al
              corregir sacó otra, están todas: la más nueva primero. */}
          {relevamientoOrigen.foto && (
            <Dato etiqueta="Foto del local" ancho={2}>
              {[...(relevamientoOrigen.fotos ?? [relevamientoOrigen.foto])].reverse().map((f) => (
                <ArchivoGuardado key={f.id} archivo={f} etiqueta="Ver foto" />
              ))}
            </Dato>
          )}
          {relevamientoOrigen.offline && (
            <Dato etiqueta="Origen de la carga" ancho={2}>
              Cargado sin conexión y sincronizado después. La fecha y la coordenada son las del momento del guardado, no las de la
              sincronización.
            </Dato>
          )}
        </div>
      ) : (
        <Vacio titulo="Sin relevamiento asociado">
        </Vacio>
      )}
        </>
      )}

      {/* ================= 3. HISTORIAL DE ACTUACIONES ================= */}
      {!soloConsulta && (
        <>
          <div className="accesos-header">
            <span>Historial de actuaciones ({actuaciones.length})</span>
          </div>
          <HistorialActuaciones
            actuaciones={actuaciones}
            usuarios={usuarios}
            local={local}
            ediciones={auditoriaDeLocal(local.id).filter((h) => h.accion === 'editar-observaciones')}
          />
        </>
      )}

      {/* LA AUDITORÍA DE ESTADOS aparece solo si la base tiene la tabla
          `auditoria` (backend/sql/05-tabla-auditoria.sql). Sin ella no se
          muestra: una sección vacía permanente sugería que faltaba cargar algo. */}
      {capacidades?.auditoria && !soloConsulta && (
        <>
          <div className="accesos-header">
            <span>Historial de estados</span>
          </div>
          <HistorialEstados filas={auditoriaDeLocal(local.id)} />
        </>
      )}
    </>
  );
}

export default LocalFicha;
