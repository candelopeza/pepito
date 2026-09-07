/* ============================================================================
   pages/Validaciones.jsx  —  BANDEJA DE VALIDACIÓN  (URL: /#/validaciones)
   ----------------------------------------------------------------------------
   Sección 6.3 del pliego. Lo que el titular presentó por el portal y espera
   que un agente de la oficina lo apruebe.

   >>> LA REGLA QUE ESTA PANTALLA PROTEGE <<<
   "La documentación presentada por el titular NO cambia el estado del local
   hasta que un agente la aprueba: el sistema no debe permitir que una carga
   externa suspenda un plazo de forma automática."

   O sea: mientras un documento está acá, el plazo del local SIGUE CORRIENDO.
   Si un local está a dos días del expediente y el titular sube una DDJJ, el
   expediente se sigue acercando hasta que alguien la apruebe. Por eso la
   columna "plazo del local" muestra cuánto falta: son las validaciones que hay
   que mirar primero.

   El aprobar/rechazar está implementado en el store (validarPresentacion) y no
   acá: aprobar hace que el documento empiece a contar como vigente, y eso
   cambia el estado del local por la vía normal del motor de reglas.
   ============================================================================ */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import Badge, { BadgeEstado } from '../components/ui/Badge';
import Aviso, { Vacio } from '../components/ui/Aviso';
import Confirmar from '../components/ui/Confirmar';
import { useDatos } from '../datos/datosContexto';
import { ETIQUETA_DOCUMENTO } from '../dominio/actuaciones';
import { fmtFecha } from '../dominio/fechas';

function Validaciones() {
  const { presentacionesPendientes, localPorId, validarPresentacion } = useDatos();
  const [decision, setDecision] = useState(null);

  const pendientes = presentacionesPendientes();

  return (
    <>
      <PageHeader
        etiqueta="PORTAL"
        titulo="VALIDAR PRESENTACIONES"
        subtitulo={`${pendientes.length} presentación(es) esperando aprobación`}
        botonVolver
      />

      {pendientes.length === 0 ? (
        <Vacio titulo="No hay nada para validar">
          Cuando un titular presente documentación desde el portal, va a aparecer acá antes de tener efecto sobre el estado de su
          local.
        </Vacio>
      ) : (
        <>
          <Aviso tipo="alerta" titulo="Mientras están acá, los plazos siguen corriendo">
            Una presentación sin validar no suspende nada. Si el local está por vencer, resolvé esta validación primero.
          </Aviso>

          <table className="tabla-datos">
            <thead>
              <tr>
                <th>Local</th>
                <th>Documento</th>
                <th>Expediente de trámite</th>
                <th>Vigencia propuesta</th>
                <th>Estado del local</th>
                <th>Plazo del local</th>
                <th>Decisión</th>
              </tr>
            </thead>
            <tbody>
              {pendientes.map((p) => {
                const local = localPorId(p.localId);
                return (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/locales/${p.localId}`} className="link-local">
                        {local?.nombreLocal ?? `Local ${p.localId}`}
                      </Link>
                      <small className="celda-sub">{local?.razonSocial}</small>
                    </td>
                    <td>
                      {ETIQUETA_DOCUMENTO[p.tipo]}
                      <small className="celda-sub">
                        N° {p.numero} · {p.archivo ?? 'sin archivo'}
                      </small>
                    </td>
                    <td>{p.expedienteTramite ?? <Badge color="rojo">No registrado</Badge>}</td>
                    <td>
                      {fmtFecha(p.fechaEmision)} → {fmtFecha(p.fechaVencimiento)}
                    </td>
                    <td>
                      <BadgeEstado codigo={local?.estado} />
                    </td>
                    <td>
                      {local?.plazo ? (
                        <span className={local.plazo.vencido ? 'texto-vencido' : ''}>
                          {local.plazo.vencido ? 'vencido' : `${local.diasRestantes} día(s)`}
                        </span>
                      ) : (
                        <span className="texto-gris">—</span>
                      )}
                    </td>
                    <td className="celda-acciones">
                      <button type="button" className="btn-tabla" onClick={() => setDecision({ p, local, aprobar: true })}>
                        Aprobar
                      </button>
                      <button type="button" className="btn-tabla" onClick={() => setDecision({ p, local, aprobar: false })}>
                        Rechazar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      <Confirmar
        abierto={Boolean(decision)}
        titulo={decision?.aprobar ? 'Aprobar la presentación' : 'Rechazar la presentación'}
        textoConfirmar={decision?.aprobar ? 'Aprobar' : 'Rechazar'}
        peligro={!decision?.aprobar}
        onCancelar={() => setDecision(null)}
        onConfirmar={() => {
          validarPresentacion(decision.p.id, decision.aprobar);
          setDecision(null);
        }}
      >
        {decision?.aprobar ? (
          <p>
            La {ETIQUETA_DOCUMENTO[decision.p.tipo]} N° {decision.p.numero} pasa a contar como documentación vigente hasta el{' '}
            {fmtFecha(decision.p.fechaVencimiento)}. <strong>{decision.local?.nombreLocal}</strong> sale del circuito sancionatorio
            y su notificación en curso queda sin efecto.
          </p>
        ) : (
          <p>
            Se descarta la presentación. El local sigue en <strong>{decision?.local?.estadoEtiqueta}</strong> y su plazo sigue
            corriendo. Avisale al titular por qué se rechazó: desde el portal solo va a ver que ya no está.
          </p>
        )}
      </Confirmar>
    </>
  );
}

export default Validaciones;
