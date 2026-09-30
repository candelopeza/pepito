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
   ============================================================================ */

import { Link, useParams } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import Badge, { BadgeEstado } from '../components/ui/Badge';
import Aviso, { Vacio } from '../components/ui/Aviso';
import { Dato } from '../components/ui/Campo';
import AccionesLocal from '../components/AccionesLocal';
import HistorialActuaciones from '../components/HistorialActuaciones';
import { useDatos } from '../datos/datosContexto';

import { ETIQUETA_DOCUMENTO } from '../dominio/actuaciones';
import { fmtFecha, fmtFechaHora } from '../dominio/fechas';
import { faltantesRegistrales } from '../dominio/reglas';
import { colorClasificacion, etiquetaClasificacion } from '../config/catalogos';

function LocalFicha() {
  const { id } = useParams();
  const { localPorId, actuacionesDeLocal, relevamientosDeLocal, usuarios } = useDatos();

  const local = localPorId(id);

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
  const relevamientoOrigen = relevamientos[0] ?? null;

  const docsVigentes = ['contrato', 'reciclaje', 'ddjj']
    .map((k) => local.vigente[k])
    .filter(Boolean);

  return (
    <>
      <PageHeader
        etiqueta={`LOCAL N° ${local.id}${local.idLegacy ? ` · ${local.idLegacy}` : ''}`}
        titulo={local.nombreLocal}
        subtitulo={`${local.razonSocial || 'Sin razón social'} · ${local.direccion}`}
        botonVolver
        volverA="/locales"
        volverTexto="VOLVER AL PADRÓN"
      />

      {/* ================= 1. SITUACIÓN ACTUAL ================= */}
      <div className="accesos-header">
        <span>Situación actual</span>
      </div>

      <div className="ficha-situacion">
        <div className="ficha-estado">
          <BadgeEstado codigo={local.estado} />
        </div>

        {local.plazo && (
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
          Lo que la persona necesita saber ANTES de apretar un botón. */}
      {local.bloqueado && (
        <Aviso tipo="bloqueo" titulo="Bloqueo manual activo">
          Este local está excluido del cálculo automático de estado. Bloqueado por {local.bloqueadoPor} el{' '}
          {fmtFechaHora(local.bloqueadoEn)}. Motivo: {local.bloqueadoMotivo}
        </Aviso>
      )}

      {faltan.length > 0 && (
        <Aviso tipo="alerta" titulo="Faltan datos registrales">
          Falta {faltan.join(', ')}. Sin esos datos no se puede emitir una cédula que individualice correctamente al sujeto
          obligado, y el local no puede avanzar a segunda notificación.
        </Aviso>
      )}

      {docsVigentes.length > 0 && (
        <Aviso tipo="ok" titulo="Documentación vigente: el local está fuera del circuito sancionatorio">
          {docsVigentes
            .map((d) => `${ETIQUETA_DOCUMENTO[d.tipo]} N° ${d.numero}, vigente hasta el ${fmtFecha(d.fechaVencimiento)}`)
            .join(' · ')}
          . Al vencer, el local reingresa automáticamente a primera notificación pendiente.
        </Aviso>
      )}

      {local.sinGeo && (
        <Aviso tipo="alerta" titulo="El local no tiene ubicación en el padrón">
          {local.motivoSinGeo} No aparece en el mapa ni entra en el ruteo de notificaciones. Corregí la dirección para que se pueda
          geocodificar. <Link to="/herramientas/geocodificacion">Ver todos los pendientes</Link>.
        </Aviso>
      )}

      {/* ---------- Las acciones ---------- */}
      <div className="accesos-header">
        <span>Acciones disponibles en este estado</span>
      </div>
      <AccionesLocal local={local} />

      {/* ================= 2. DATOS DEL PADRÓN ================= */}
      <div className="accesos-header">
        <span>Datos del padrón</span>
      </div>
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
              ? `${relevamientoOrigen.revisadoPor} el ${fmtFechaHora(relevamientoOrigen.revisadoEn)} · resultado: ${
                  relevamientoOrigen.resultadoRevision ?? '—'
                }`
              : 'pendiente de control'}
          </Dato>
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

      {/* ================= 3. HISTORIAL DE ACTUACIONES ================= */}
      <div className="accesos-header">
        <span>Historial de actuaciones ({actuaciones.length})</span>
      </div>
      <HistorialActuaciones actuaciones={actuaciones} usuarios={usuarios} />

      {/* LA AUDITORÍA DE ESTADOS se sacó de esta ficha: la base no tiene una
          tabla de auditoría (se decidió no agregarla) y el historial del local
          son sus trámites, que ya se muestran arriba con quién los registró y
          cuándo. Una sección vacía permanente sugería que faltaba cargar algo. */}
    </>
  );
}

export default LocalFicha;
