/* ============================================================================
   pages/Portal.jsx  —  PORTAL DEL TITULAR  (URL: /#/portal)
   ----------------------------------------------------------------------------
   Sección 6.3 del pliego. Funcionalidad NUEVA, habilitada por la integración
   con CiDiTuc: el titular entra con su Ciudadano Digital y presenta su
   documentación sin ir a la oficina.

   QUÉ PUEDE HACER:
     - consultar la situación de sus locales y los plazos en curso
     - presentar DDJJ, DDJJ de reciclaje o contrato con el respaldatorio
     - solicitar prórroga cuando el estado del local lo habilite
     - consultar sus expedientes: los de trámite de sus presentaciones y el de
       multa si existe

   >>> LO QUE NO PUEDE HACER, Y ES LO MÁS IMPORTANTE <<<
   Su presentación NO cambia el estado del local. Entra en una bandeja de
   validación y el plazo SIGUE CORRIENDO hasta que un agente la apruebe. Si no
   fuera así, cualquiera podría suspender una intimación subiendo un archivo.
   Eso está avisado en pantalla, para que el titular no crea que ya cumplió.

   >>> PUNTO A RESOLVER CON LA DIRECCIÓN TÉCNICA (sección 8.2) <<<
   Cómo se vincula la persona autenticada con sus locales. CiDiTuc identifica
   personas físicas por CUIL; el padrón identifica establecimientos por CUIT
   del titular, que puede ser una persona jurídica. Hay que definir si CiDiTuc
   expone la vinculación persona-empresa, si el sistema implementa su propio
   apoderamiento, o si la habilitación la otorga a mano la oficina.
   Mientras no se defina, esta pantalla usa el campo `titularCuil` del local
   si existe, y si no, el CUIT del local: para una persona física el CUIT es
   su CUIL. La base del área no tiene `titularCuil`, así que hoy vale el CUIT.

   >>> PRUEBA: "VER COMO EL TITULAR DEL CUIT" <<<
   Sin CiDiTuc no hay titulares de verdad que entren. Para mostrar el portal
   con datos reales hay un campo marcado PRUEBA, igual que el selector de rol
   de la barra: se escribe un CUIT del padrón y el portal se ve como lo vería
   ese titular. Se va cuando exista el inicio de sesión.

   LA PRÓRROGA SE SOLICITA, NO SE OTORGA: el pedido queda anotado en el
   historial del local y coordinación decide los días (ver
   backend/rutas/prorrogas-expedientes.js → solicitud-prorroga).

   EL TIMBRADO también está pendiente (sección 4.5): si el portal gestiona el
   pago o si el trámite se constituye íntegramente en CiDiTuc y el sistema solo
   registra el número. Esta pantalla asume lo segundo.
   ============================================================================ */

import { useEffect, useState } from 'react';
import PageHeader from '../components/ui/PageHeader';
import Badge, { BadgeEstado } from '../components/ui/Badge';
import Aviso, { Vacio } from '../components/ui/Aviso';
import Modal from '../components/ui/Modal';
import Campo, { CampoTexto } from '../components/ui/Campo';
import FormDocumento from '../components/FormDocumento';
import HistorialActuaciones from '../components/HistorialActuaciones';
import { useRol } from '../auth/rolContexto';
import { useDatos } from '../datos/datosContexto';
import { ETIQUETA_DOCUMENTO } from '../dominio/actuaciones';
import { fmtFecha, fmtFechaHora } from '../dominio/fechas';
import { normalizarCuit } from '../dominio/duplicados';

/* Lo que el titular lee de cada estado del expediente. Sin jerga interna. */
const SITUACION_PORTAL = {
  23: 'Pendiente',
  24: 'Iniciado',
  25: 'En gestión (se pidió la apertura)',
  26: 'En trámite',
  27: 'Concluido',
};

function Portal() {
  const { usuario } = useRol();
  const {
    novedadesExpedientes,
    parametros,
    localesConEstado,
    actuacionesDeLocal,
    usuarios,
    registrarDocumento,
    solicitarProrroga,
    cargarAuditoria,
    auditoriaDeLocal,
    versionDatos,
  } = useDatos();

  const [presentando, setPresentando] = useState(null);
  const [pidiendoProrroga, setPidiendoProrroga] = useState(null);
  const [solicitud, setSolicitud] = useState({ dias: '', motivo: '' });
  // PRUEBA: ver el portal como el titular de este CUIT (ver el encabezado).
  const [cuitPrueba, setCuitPrueba] = useState('');

  /* Los locales de esta persona. Es el punto que hay que reemplazar cuando se
     defina la vinculación con CiDiTuc: hoy compara el CUIL del usuario contra
     el campo `titularCuil` del local o, si no lo tiene, contra su CUIT. */
  const identificacion = normalizarCuit(cuitPrueba || usuario.cuil);
  const mios = localesConEstado.filter((l) =>
    l.titularCuil
      ? normalizarCuit(l.titularCuil) === identificacion
      : Boolean(identificacion) && normalizarCuit(l.cuit) === identificacion,
  );

  /* El historial de cada local propio: de ahí sale por qué la oficina rechazó
     una presentación (la presentación rechazada se da de baja y deja de estar
     entre las actuaciones). Sin la tabla `auditoria` no llega nada y la
     pantalla queda como antes. */
  const idsMios = mios.map((l) => l.id).join(',');
  useEffect(() => {
    idsMios
      .split(',')
      .filter(Boolean)
      .forEach((id) => cargarAuditoria(Number(id)));
  }, [idsMios, versionDatos, cargarAuditoria]);

  const puedePedirProrroga = (l) =>
    ['NOTIF2_ENTREGADA', 'NOTIF2_SIN_FIRMA', 'NOTIF2_FIJADA', 'GENERAR_EXPEDIENTE'].includes(l.estado);

  return (
    <>
      <PageHeader
        etiqueta="PORTAL DEL TITULAR"
        titulo={`Hola, ${usuario.nombre}`}
        subtitulo={`CUIL ${cuitPrueba || usuario.cuil || 'no informado'}`}
      />

      <div className="selector-rol portal-prueba">
        <span className="selector-rol-aviso" title="Herramienta de prueba: se elimina cuando haya CiDiTuc">
          PRUEBA
        </span>
        <input
          className="selector-rol-select"
          placeholder="Ver como el titular del CUIT…"
          value={cuitPrueba}
          onChange={(e) => setCuitPrueba(e.target.value)}
          aria-label="Ver el portal como el titular de un CUIT (prueba)"
        />
      </div>

      {mios.length === 0 ? (
        <Vacio titulo="No hay locales asociados a tu CUIL">
          Si tenés un establecimiento a tu nombre y no aparece acá, comunicate con la Dirección de Ambiente.
        </Vacio>
      ) : (
        mios.map((l) => {
          const actuaciones = actuacionesDeLocal(l.id);
          const documentos = actuaciones.filter((a) => ['DDJJ', 'DDJJ_RECICLAJE', 'CONTRATO'].includes(a.tipo));
          const expedientesMulta = actuaciones.filter((a) => a.tipo === 'EXPEDIENTE');
          const enValidacion = documentos.filter((d) => d.validado === false);
          const historial = auditoriaDeLocal(l.id);
          const rechazos = historial.filter((h) => h.accion === 'rechazar-presentacion');
          const ultimoRechazo = rechazos.at(-1);
          const ultimaAprobacion = historial.filter((h) => h.accion === 'aprobar-presentacion').at(-1);
          // Se avisa solo si es lo último que pasó: si después presentó otra
          // o se la aprobaron, el rechazo queda en la lista de abajo.
          const rechazoSinResolver =
            ultimoRechazo && enValidacion.length === 0 && (!ultimaAprobacion || ultimaAprobacion.id < ultimoRechazo.id);

          return (
            <section key={l.id} className="portal-local">
              <div className="accesos-header">
                <span>{l.nombreLocal}</span>
              </div>

              <div className="ficha-situacion">
                <div className="ficha-estado">
                  <BadgeEstado codigo={l.estado} />
                </div>
                {l.plazo && (
                  <div className={`ficha-plazo ${l.plazo.vencido ? 'ficha-plazo-vencido' : ''}`}>
                    <strong>Tenés un plazo en curso</strong>
                    <span>
                      Vence el {fmtFecha(l.plazo.vencimiento)} ·{' '}
                      {/* Son días corridos hasta el vencimiento (el vencimiento
                          sí se calcula en días hábiles). */}
                      {l.plazo.vencido ? 'YA VENCIÓ' : `te quedan ${l.diasRestantes} día(s)`}
                    </span>
                  </div>
                )}
              </div>

              <p className="texto-chico">
                {l.razonSocial} · CUIT {l.cuit} · {l.direccion}
              </p>

              {/* ---------- Qué significa su estado, en castellano ----------
                  El titular no tiene por qué entender "NOTIF2_PENDIENTE". */}
              {l.estadoGrupo === 'documental' && (
                <Aviso tipo="ok" titulo="Estás al día">
                  Tenés documentación vigente registrada. Cuando venza, el sistema te va a volver a intimar, así que conviene
                  renovarla antes.
                </Aviso>
              )}
              {['cola_emision', 'entrega', 'en_tramite'].includes(l.estadoGrupo) && (
                <Aviso tipo="alerta" titulo="Tenés que acreditar la gestión de tus residuos">
                  Podés hacerlo con un contrato vigente con un prestador habilitado, con una Declaración Jurada, o con una DDJJ de
                  Separación de Residuos si separás y reciclás. Las declaraciones juradas tienen un año de vigencia.
                </Aviso>
              )}
              {l.estado === 'GENERAR_EXPEDIENTE' && (
                <Aviso tipo="bloqueo" titulo="Se agotaron las instancias de intimación">
                  Corresponde iniciar un expediente de multa. Todavía podés presentar documentación o solicitar una prórroga.
                </Aviso>
              )}
              {l.estado === 'EXENTO_CONFIRMADO' && (
                <Aviso tipo="ok" titulo="Tu local quedó exento">
                  Fue relevado como Generador Menor y la exención está confirmada. No tenés que presentar nada.
                </Aviso>
              )}

              {rechazoSinResolver && (
                <Aviso tipo="bloqueo" titulo={`La oficina rechazó tu presentación el ${fmtFechaHora(ultimoRechazo.momento)}`}>
                  {ultimoRechazo.motivo}. Podés presentarla de nuevo.
                </Aviso>
              )}

              {l.solicitudProrroga && (
                <Aviso tipo="info" titulo={`Pediste una prórroga el ${fmtFechaHora(l.solicitudProrroga.momento)}`}>
                  La oficina la está evaluando. Mientras tanto, tu plazo sigue corriendo.
                </Aviso>
              )}

              {enValidacion.length > 0 && (
                <Aviso tipo="alerta" titulo="Tu presentación está en revisión">
                  {enValidacion.map((d) => `${ETIQUETA_DOCUMENTO[d.tipo]} N° ${d.numero}`).join(' · ')}. Ojo: el plazo sigue
                  corriendo hasta que la oficina la apruebe.
                </Aviso>
              )}

              {/* ---------- Acciones del titular ---------- */}
              <div className="acciones-local">
                {l.estado !== 'EXENTO_CONFIRMADO' && (
                  <button type="button" className="btn-primario" onClick={() => setPresentando(l)}>
                    Presentar documentación
                  </button>
                )}
                {puedePedirProrroga(l) && (
                  <button
                    type="button"
                    className="btn-secundario"
                    onClick={() => {
                      setSolicitud({ dias: '', motivo: '' });
                      setPidiendoProrroga(l);
                    }}
                  >
                    {l.solicitudProrroga ? 'Cambiar el pedido de prórroga' : 'Solicitar prórroga'}
                  </button>
                )}
              </div>

              {/* ---------- Sus expedientes ----------
                  Los DOS tipos, separados y etiquetados: uno acredita
                  cumplimiento, el otro inicia una sanción. */}
              <div className="portal-expedientes">
                <div>
                  <strong>Expedientes de tus presentaciones</strong>
                  {documentos.length === 0 && rechazos.length === 0 ? (
                    <p className="texto-gris">Todavía no presentaste documentación.</p>
                  ) : (
                    <ul className="lista-simple">
                      {rechazos.map((r) => (
                        <li key={`rechazo-${r.id}`}>
                          {r.motivo} <Badge color="rojo">Rechazada el {fmtFecha(String(r.momento).slice(0, 10))}</Badge>
                        </li>
                      ))}
                      {documentos.map((d) => (
                        <li key={d.id}>
                          {ETIQUETA_DOCUMENTO[d.tipo]} N° {d.numero} — expediente{' '}
                          <strong>
                            {parametros?.portalMuestraNumerosExpediente
                              ? (d.expedienteTramite ?? 'no registrado')
                              : d.expedienteTramite
                                ? 'registrado'
                                : 'no registrado'}
                          </strong>
                          {d.validado === false ? (
                            <Badge color="amarillo">En revisión</Badge>
                          ) : (
                            <Badge color="gris">Vence el {fmtFecha(d.fechaVencimiento)}</Badge>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <strong>Expediente de multa</strong>
                  {expedientesMulta.length === 0 ? (
                    <p className="texto-gris">No tenés expedientes de multa.</p>
                  ) : (
                    <ul className="lista-simple">
                      {expedientesMulta.map((e) => {
                        /* El titular ve el estado y las novedades PÚBLICAS: el
                           backend ya le filtra lo interno de la oficina. */
                        const situacion = SITUACION_PORTAL[e.idEstado] ?? 'Iniciado';
                        const propias = (novedadesExpedientes ?? []).filter((n) => n.idTramite === e.id);
                        return (
                          <li key={e.id}>
                            {/* El número se muestra solo si la Dirección lo decidió
                                (PENDIENTE): por defecto, estado y desde cuándo. */}
                            {parametros?.portalMuestraNumerosExpediente ? (
                              <>
                                N° <strong>{e.numeroExpediente || 'sin número todavía'}</strong> —{' '}
                              </>
                            ) : (
                              <>Expediente de multa — </>
                            )}
                            <strong>{situacion.toLowerCase()}</strong> · {fmtFecha(e.fecha)}
                            {propias.length > 0 && (
                              <ul className="lista-simple">
                                {propias.map((n) => (
                                  <li key={n.id} className="texto-chico">
                                    {fmtFecha(String(n.momento).slice(0, 10))}: {n.detalle}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>

              <details className="portal-historial">
                <summary>Ver el historial completo de tu local</summary>
                {/* El titular puede ver sus cédulas, no imprimirlas: la impresión es la constancia de la oficina. */}
                <HistorialActuaciones actuaciones={actuaciones} usuarios={usuarios} local={l} cedulaSoloLectura />
              </details>
            </section>
          );
        })
      )}

      {/* ---------- Presentar documentación ---------- */}
      {presentando && (
        <Modal abierto etiqueta="PRESENTACIÓN" titulo="Presentar documentación" ancho="ancho" onCerrar={() => setPresentando(null)}>
          <FormDocumento
            local={presentando}
            desdePortal
            onGuardar={async (d) => {
              if (await registrarDocumento(presentando.id, d)) setPresentando(null);
            }}
            onCancelar={() => setPresentando(null)}
          />
        </Modal>
      )}

      {/* ---------- Solicitar prórroga ----------
          El titular SOLICITA y coordinación OTORGA: son dos actos distintos y
          la cantidad de días la decide la oficina, no el titular. La solicitud
          queda en el historial del local. */}
      {pidiendoProrroga && (
        <Modal abierto etiqueta="PRÓRROGA" titulo="Solicitar una prórroga" onCerrar={() => setPidiendoProrroga(null)}>
          <div className="formulario formulario-modal">
            <Aviso tipo="info" titulo="La prórroga la otorga la oficina">
              Tu solicitud queda registrada. La cantidad de días la define coordinación según el caso: no hay un plazo automático.
            </Aviso>
            <Campo
              id="por-dias"
              etiqueta="Días que solicitás"
              tipo="number"
              min={1}
              valor={solicitud.dias}
              onChange={(v) => setSolicitud({ ...solicitud, dias: v })}
            />
            <CampoTexto
              id="por-motivo"
              etiqueta="Motivo de la solicitud"
              valor={solicitud.motivo}
              onChange={(v) => setSolicitud({ ...solicitud, motivo: v })}
              ayuda="Contá por qué necesitás más tiempo."
            />
            <div className="form-acciones">
              <button
                type="button"
                className="btn-primario"
                disabled={!solicitud.dias || !solicitud.motivo.trim()}
                onClick={async () => {
                  const r = await solicitarProrroga(pidiendoProrroga.id, {
                    dias: Number(solicitud.dias),
                    motivo: solicitud.motivo.trim(),
                  });
                  if (r) setPidiendoProrroga(null);
                }}
              >
                Enviar solicitud
              </button>
              <button type="button" className="btn-secundario" onClick={() => setPidiendoProrroga(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

export default Portal;
