/* ============================================================================
   HistorialActuaciones.jsx  —  LA LÍNEA DE TIEMPO DEL LOCAL
   ----------------------------------------------------------------------------
   Todas las actuaciones de un local, en orden cronológico y en una sola lista:
   notificaciones, documentación, prórrogas y expedientes mezclados.

   >>> ESTO ES LO QUE JUSTIFICABA LA TABLA DE 44 COLUMNAS <<<
   El sistema viejo guarda todas las actuaciones en una única tabla donde cada
   tipo de acto ocupa su propio bloque y deja el resto vacío. Esa decisión se
   tomó para que el personal pudiera ver todo el historial de un local en una
   sola vista, y el objetivo es VÁLIDO. Lo que estaba mal era resolverlo en el
   almacenamiento.

   Se resuelve acá, en la capa de presentación: los datos están normalizados
   (una tabla por tipo de acto) y la vista unificada se arma al dibujar. El
   objetivo del área se cumple igual y la base deja de tener 38 columnas vacías
   por fila.

   Cada tipo de actuación muestra sus propios datos, porque no son lo mismo:
   una notificación tiene plazo y resultado de entrega, un documento tiene
   vigencia y expediente de trámite.
   ============================================================================ */

import { useState } from 'react';
import Badge from './ui/Badge';
import { Vacio } from './ui/Aviso';
import Modal from './ui/Modal';
import { CampoTexto, Dato } from './ui/Campo';
import { useDatos } from '../datos/datosContexto';
import { useRol } from '../auth/rolContexto';
import ArchivoGuardado from './ArchivoGuardado';
import VistaCedula from './VistaCedula';
import { ETIQUETA_DOCUMENTO, TIPOS_ACTUACION, resultadoEntrega } from '../dominio/actuaciones';
import { fmtFecha, fmtFechaHora, plazoVencido } from '../dominio/fechas';

/* Quiénes corrigen observaciones: lo mismo que exige el servidor
   (PUT /actuaciones/:id/observaciones). */
const ROLES_EDITAN_OBSERVACIONES = ['coordinacion', 'administrador'];
import { estaVigente } from '../dominio/vigencias';

/* El detalle propio de cada tipo. Es un switch a propósito: son seis actos
   administrativos distintos y cada uno tiene que mostrar lo suyo.

   Cada dato se muestra con el mismo componente `Dato` que usa "Datos del
   padrón" en la ficha: etiqueta chica arriba, valor abajo, en grilla. Antes
   era texto corrido separado por espacios y no se distinguía qué era cada
   cosa; ahora el historial se lee igual que el resto de la ficha. */
function Detalle({ a, usuarios, conImpresion, onVerCedula }) {
  if (a.tipo === 'NOTIFICACION') {
    const res = resultadoEntrega(a.resultado);
    const notificador = usuarios.find((u) => u.id === a.notificadorId);
    const vencido = a.fechaVencimiento && plazoVencido(a.fechaVencimiento);
    return (
      <>
        {/* Cada dato va con el componente Dato: la etiqueta arriba y el valor debajo, no a la par. */}
        <Dato etiqueta="Cédula">
          {a.numeroCedula ?? <span className="hist-pendiente">Pendiente de emisión</span>}
          {/* Toda cédula emitida se puede abrir desde la ficha (sección 9.6). */}
          {a.numeroCedula && onVerCedula && (
            <>
              {' '}
              <button type="button" className="btn-tabla" onClick={() => onVerCedula(a)}>
                Ver
              </button>
            </>
          )}
        </Dato>
        <Dato etiqueta="Instancia">{a.instancia === 1 ? 'Primera notificación' : 'Segunda notificación'}</Dato>
        {/* Una notificación todavía sin emitir no tiene plazo: se fija al emitirla. */}
        <Dato etiqueta="Plazo">{a.plazoDias ? `${a.plazoDias} días hábiles` : 'Se fija al emitir la cédula'}</Dato>
        <Dato etiqueta="Notificador">{notificador?.nombre ?? 'sin asignar'}</Dato>
        {/* Solo si la base guarda la constancia (backend/sql/04): si no, no se sabe. */}
        {conImpresion && a.numeroCedula && (
          <Dato etiqueta="Impresión">
            {a.impresaEn ? `Impresa por ${a.impresaPor}` : <span className="hist-pendiente">Sin imprimir</span>}
          </Dato>
        )}
        <Dato etiqueta="Resultado de entrega">
          {a.resultado ? (
            <Badge color={res?.color ?? 'gris'}>{res?.etiqueta ?? a.resultado}</Badge>
          ) : (
            <Badge color="azul">Pendiente de entrega</Badge>
          )}
        </Dato>
        {a.resultado ? (
          <>
            <Dato etiqueta="Fecha de entrega">{a.fechaEntrega ? fmtFecha(a.fechaEntrega) : '—'}</Dato>
            <Dato etiqueta="Vencimiento del plazo">
              {a.fechaVencimiento ? (
                <span className={vencido ? 'hist-vencido' : ''}>
                  {fmtFecha(a.fechaVencimiento)}
                  {vencido ? ' (vencido)' : ''}
                </span>
              ) : (
                '—'
              )}
            </Dato>
          </>
        ) : (
          /* Que quede claro en el historial, no solo en el estado. */
          <Dato etiqueta="Vencimiento del plazo">El plazo todavía no corre.</Dato>
        )}
        {a.evidencia && (
          <Dato etiqueta="Evidencia" ancho={2}>
            {/* Una foto guardada llega como { id, nombre }. Un texto viejo, tal cual. */}
            {typeof a.evidencia === 'object' ? (
              <ArchivoGuardado archivo={a.evidencia} etiqueta="Ver foto" />
            ) : (
              a.evidencia
            )}
          </Dato>
        )}
      </>
    );
  }

  if (['DDJJ', 'DDJJ_RECICLAJE', 'CONTRATO'].includes(a.tipo)) {
    const vigente = estaVigente(a.fechaVencimiento);
    return (
      <>
        <Dato etiqueta="Documento">
          {ETIQUETA_DOCUMENTO[a.tipo]} N° {a.numero}
        </Dato>
        <Dato etiqueta="Vigencia">
          <Badge color={a.validado === false ? 'amarillo' : vigente ? 'verde' : 'gris'}>
            {a.validado === false ? 'Pendiente de validación' : vigente ? 'Vigente' : 'Vencida'}
          </Badge>
        </Dato>
        <Dato etiqueta="Fecha de emisión">{fmtFecha(a.fechaEmision)}</Dato>
        <Dato etiqueta="Fecha de vencimiento">{fmtFecha(a.fechaVencimiento)}</Dato>
        {/* El dato que el sistema viejo no guardaba (sección 4.5). */}
        <Dato etiqueta="Expediente de trámite">
          {a.expedienteTramite ??
            (a.origen === 'INFORME_9DJ' ? 'no aplica (informe de la prestataria)' : 'NO REGISTRADO')}
        </Dato>
        {a.origen === 'INFORME_9DJ' && (
          <Dato etiqueta="Origen">
            <Badge color="azul">Informado por 9 de Julio</Badge>
            <span className="hist-nota">Su vigencia solo se modifica por esa misma vía.</span>
          </Dato>
        )}
        {a.archivo && (
          <Dato etiqueta="Documento respaldatorio">
            {/* Guardado en el servidor llega como { id, nombre }; un nombre escrito a mano, tal cual. */}
            {typeof a.archivo === 'object' ? (
              <ArchivoGuardado archivo={a.archivo} etiqueta="Ver documento" />
            ) : (
              a.archivo
            )}
          </Dato>
        )}
      </>
    );
  }

  if (a.tipo === 'PRORROGA') {
    const vigente = estaVigente(a.fechaVencimiento);
    return (
      <>
        <Dato etiqueta="Plazo concedido">{a.diasOtorgados} días corridos</Dato>
        <Dato etiqueta="Estado">
          <Badge color={vigente ? 'amarillo' : 'gris'}>{vigente ? 'Vigente' : 'Vencida'}</Badge>
        </Dato>
        <Dato etiqueta="Vence el">{fmtFecha(a.fechaVencimiento)}</Dato>
        {a.motivo && (
          <Dato etiqueta="Motivo" ancho={2}>
            {a.motivo}
          </Dato>
        )}
      </>
    );
  }

  if (a.tipo === 'EXPEDIENTE') {
    return <Dato etiqueta="Expediente de multa">N° {a.numeroExpediente}</Dato>;
  }

  if (a.tipo === 'REINGRESO') {
    return (
      <Dato etiqueta="Reingreso al circuito" ancho={2}>
        Coordinación reingresó el local al circuito. La intimación arranca de cero.
      </Dato>
    );
  }

  return null;
}

/* PROPS
     actuaciones, usuarios
     local        (opcional) el local: con él, cada cédula emitida tiene su
                  botón "Ver" (la cédula tal como se imprime)
     cedulaSoloLectura  (opcional) se ve la cédula pero no se imprime: el portal
     ediciones    (opcional) las filas del historial de estados con
                  accion 'editar-observaciones'. Con ellas, cada actuación
                  editada muestra quién la editó y cuándo; y quien puede,
                  ve el botón "Editar observaciones". Lo pasa la ficha. */
function HistorialActuaciones({ actuaciones, usuarios = [], local = null, cedulaSoloLectura = false, ediciones = null }) {
  const { capacidades, editarObservaciones } = useDatos();
  const { rol } = useRol();
  const conImpresion = Boolean(capacidades?.impresion);
  const [viendo, setViendo] = useState(null);
  const [editando, setEditando] = useState(null);
  const [texto, setTexto] = useState('');
  // Con el historial (sql/05) queda qué decían antes. Sin él se ofrece igual,
  // salvo que el backend lo exija (EXIGIR_HISTORIAL_OBSERVACIONES=si).
  const conHistorial = Boolean(capacidades?.auditoria);
  const puedeEditar =
    Boolean(ediciones) &&
    (conHistorial || !capacidades?.exigeHistorialObservaciones) &&
    ROLES_EDITAN_OBSERVACIONES.includes(rol);
  if (!actuaciones.length) {
    return <Vacio titulo="Sin actuaciones">Este local todavía no tiene ningún acto administrativo registrado.</Vacio>;
  }

  // Más reciente arriba: es lo que se quiere ver al abrir la ficha.
  const orden = [...actuaciones].reverse();

  return (
    <>
      <ol className="historial">
        {orden.map((a) => {
          const tipo = TIPOS_ACTUACION[a.tipo] ?? { etiqueta: a.tipo, color: 'gris' };
          return (
            <li key={a.id} className={`historial-fila historial-${tipo.color}`}>
              <div className="hist-cabecera">
                <Badge color={tipo.color}>{tipo.etiqueta}</Badge>
                <span className="hist-fecha">{fmtFecha(a.fecha)}</span>
                <span className="hist-usuario">{a.usuario}</span>
              </div>
              <div className="hist-cuerpo">
                <Detalle a={a} usuarios={usuarios} conImpresion={conImpresion} onVerCedula={local ? setViendo : null} />
                {a.observaciones && (
                  <Dato etiqueta="Observaciones" ancho={2}>
                    <span className="hist-obs">{a.observaciones}</span>
                  </Dato>
                )}
                {(() => {
                  const ultima = ediciones?.filter((h) => h.idTramite === a.id).at(-1);
                  return ultima ? (
                    <Dato etiqueta="Observaciones editadas" ancho={2}>
                      <span className="hist-nota">
                        Por {ultima.actor} el {fmtFechaHora(ultima.momento)}.
                      </span>
                    </Dato>
                  ) : null;
                })()}
                {puedeEditar && a.origen !== 'INFORME_9DJ' && (
                  <div className="hist-editar">
                    <button
                      type="button"
                      className="btn-tabla"
                      onClick={() => {
                        setTexto(a.observaciones ?? '');
                        setEditando(a);
                      }}
                    >
                      {a.observaciones ? 'Editar observaciones' : 'Agregar observaciones'}
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {editando && (
        <Modal abierto etiqueta="ACTUACIÓN" titulo="Observaciones" onCerrar={() => setEditando(null)}>
          <div className="formulario formulario-modal">
            <CampoTexto
              id="obs-actuacion"
              etiqueta="Observaciones"
              valor={texto}
              onChange={setTexto}
              ayuda={
                conHistorial
                  ? ''
                  : ''
              }
            />
            <div className="form-acciones">
              <button
                type="button"
                className="btn-primario"
                onClick={async () => {
                  if (await editarObservaciones(editando.id, texto.trim())) setEditando(null);
                }}
              >
                Guardar
              </button>
              <button type="button" className="btn-secundario" onClick={() => setEditando(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </Modal>
      )}
      {local && (
        <VistaCedula
          abierto={Boolean(viendo)}
          cedula={viendo}
          local={local}
          soloLectura={cedulaSoloLectura}
          onCerrar={() => setViendo(null)}
        />
      )}
    </>
  );
}

export default HistorialActuaciones;
