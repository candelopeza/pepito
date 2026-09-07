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
   Mientras no se defina, esta pantalla usa lo último: el campo `titularCuil`
   del local, que se carga desde el padrón.

   EL TIMBRADO también está pendiente (sección 4.5): si el portal gestiona el
   pago o si el trámite se constituye íntegramente en CiDiTuc y el sistema solo
   registra el número. Esta pantalla asume lo segundo.
   ============================================================================ */

import { useState } from 'react';
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
import { fmtFecha } from '../dominio/fechas';

function Portal() {
  const { usuario } = useRol();
  const { localesConEstado, actuacionesDeLocal, usuarios, registrarDocumento, otorgarProrroga } = useDatos();

  const [presentando, setPresentando] = useState(null);
  const [pidiendoProrroga, setPidiendoProrroga] = useState(null);
  const [solicitud, setSolicitud] = useState({ dias: '', motivo: '' });

  /* Los locales de esta persona. Es el punto que hay que reemplazar cuando se
     defina la vinculación con CiDiTuc: hoy compara el CUIL del usuario contra
     el campo `titularCuil` que carga la oficina. */
  const mios = localesConEstado.filter((l) => l.titularCuil && usuario.cuil && l.titularCuil === usuario.cuil);

  const puedePedirProrroga = (l) =>
    ['NOTIF2_ENTREGADA', 'NOTIF2_SIN_FIRMA', 'NOTIF2_FIJADA', 'GENERAR_EXPEDIENTE'].includes(l.estado);

  return (
    <>
      <PageHeader
        etiqueta="PORTAL DEL TITULAR"
        titulo={`Hola, ${usuario.nombre}`}
        subtitulo={`Ingresaste con Ciudadano Digital · CUIL ${usuario.cuil ?? 'no informado'}`}
      />

      {mios.length === 0 ? (
        <Vacio titulo="No hay locales asociados a tu CUIL">
          Si tenés un establecimiento a tu nombre y no aparece acá, la habilitación la carga la oficina. Comunicate con la
          Dirección de Ambiente. (La vinculación automática entre tu identidad de CiDiTuc y tus locales está pendiente de
          definición: ver sección 8.2 del pliego.)
        </Vacio>
      ) : (
        mios.map((l) => {
          const actuaciones = actuacionesDeLocal(l.id);
          const documentos = actuaciones.filter((a) => ['DDJJ', 'DDJJ_RECICLAJE', 'CONTRATO'].includes(a.tipo));
          const expedientesMulta = actuaciones.filter((a) => a.tipo === 'EXPEDIENTE');
          const enValidacion = documentos.filter((d) => d.validado === false);

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
                      {l.plazo.vencido ? 'YA VENCIÓ' : `te quedan ${l.diasRestantes} día(s) hábiles`}
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
                    Solicitar prórroga
                  </button>
                )}
              </div>

              {/* ---------- Sus expedientes ----------
                  Los DOS tipos, separados y etiquetados: uno acredita
                  cumplimiento, el otro inicia una sanción. */}
              <div className="portal-expedientes">
                <div>
                  <strong>Expedientes de tus presentaciones</strong>
                  {documentos.length === 0 ? (
                    <p className="texto-gris">Todavía no presentaste documentación.</p>
                  ) : (
                    <ul className="lista-simple">
                      {documentos.map((d) => (
                        <li key={d.id}>
                          {ETIQUETA_DOCUMENTO[d.tipo]} N° {d.numero} — expediente{' '}
                          <strong>{d.expedienteTramite ?? 'no registrado'}</strong>
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
                      {expedientesMulta.map((e) => (
                        <li key={e.id}>
                          N° <strong>{e.numeroExpediente}</strong> — iniciado el {fmtFecha(e.fecha)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <details className="portal-historial">
                <summary>Ver el historial completo de tu local</summary>
                <HistorialActuaciones actuaciones={actuaciones} usuarios={usuarios} />
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
            onGuardar={(d) => {
              registrarDocumento(presentando.id, d);
              setPresentando(null);
            }}
            onCancelar={() => setPresentando(null)}
          />
        </Modal>
      )}

      {/* ---------- Solicitar prórroga ----------
          MAQUETA: acá la solicitud se otorga directo para poder mostrar el
          flujo. En el sistema real el titular SOLICITA y coordinación OTORGA:
          son dos actos distintos y la cantidad de días la decide la oficina,
          no el titular. Es el punto a cambiar cuando exista el backend. */}
      {pidiendoProrroga && (
        <Modal abierto etiqueta="PRÓRROGA" titulo="Solicitar una prórroga" onCerrar={() => setPidiendoProrroga(null)}>
          <div className="formulario formulario-modal">
            <Aviso tipo="info" titulo="La prórroga la otorga la Dirección">
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
                onClick={() => {
                  otorgarProrroga(pidiendoProrroga.id, {
                    dias: solicitud.dias,
                    motivo: `Solicitada por el titular desde el portal: ${solicitud.motivo}`,
                  });
                  setPidiendoProrroga(null);
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
