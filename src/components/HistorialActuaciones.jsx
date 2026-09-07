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

import Badge from './ui/Badge';
import { Vacio } from './ui/Aviso';
import { ETIQUETA_DOCUMENTO, TIPOS_ACTUACION, resultadoEntrega } from '../dominio/actuaciones';
import { fmtFecha, plazoVencido } from '../dominio/fechas';
import { estaVigente } from '../dominio/vigencias';

/* El detalle propio de cada tipo. Es un switch a propósito: son seis actos
   administrativos distintos y cada uno tiene que mostrar lo suyo. */
function Detalle({ a, usuarios }) {
  if (a.tipo === 'NOTIFICACION') {
    const res = resultadoEntrega(a.resultado);
    const notificador = usuarios.find((u) => u.id === a.notificadorId);
    return (
      <>
        <div className="hist-linea">
          <span>Cédula {a.numeroCedula}</span>
          <span>{a.instancia === 1 ? 'Primera' : 'Segunda'} notificación</span>
          <span>Plazo: {a.plazoDias} días hábiles</span>
        </div>
        <div className="hist-linea">
          <span>Notificador: {notificador?.nombre ?? 'sin asignar'}</span>
          {a.impresaEn ? <span>Impresa por {a.impresaPor}</span> : <span className="hist-pendiente">Sin imprimir</span>}
        </div>
        {a.resultado ? (
          <div className="hist-linea">
            <Badge color={res?.color ?? 'gris'}>{res?.etiqueta ?? a.resultado}</Badge>
            {a.fechaEntrega && <span>Entregada el {fmtFecha(a.fechaEntrega)}</span>}
            {a.fechaVencimiento && (
              <span className={plazoVencido(a.fechaVencimiento) ? 'hist-vencido' : ''}>
                Vence el {fmtFecha(a.fechaVencimiento)}
                {plazoVencido(a.fechaVencimiento) ? ' (vencido)' : ''}
              </span>
            )}
          </div>
        ) : (
          <div className="hist-linea">
            <Badge color="azul">Pendiente de entrega</Badge>
            {/* Que quede claro en el historial, no solo en el estado. */}
            <span>El plazo todavía no corre.</span>
          </div>
        )}
        {a.evidencia && <div className="hist-linea">Evidencia: {a.evidencia}</div>}
      </>
    );
  }

  if (['DDJJ', 'DDJJ_RECICLAJE', 'CONTRATO'].includes(a.tipo)) {
    const vigente = estaVigente(a.fechaVencimiento);
    return (
      <>
        <div className="hist-linea">
          <span>{ETIQUETA_DOCUMENTO[a.tipo]} N° {a.numero}</span>
          <Badge color={a.validado === false ? 'amarillo' : vigente ? 'verde' : 'gris'}>
            {a.validado === false ? 'Pendiente de validación' : vigente ? 'Vigente' : 'Vencida'}
          </Badge>
        </div>
        <div className="hist-linea">
          <span>Emitida el {fmtFecha(a.fechaEmision)}</span>
          <span>Vence el {fmtFecha(a.fechaVencimiento)}</span>
        </div>
        <div className="hist-linea">
          {/* El dato que el sistema viejo no guardaba (sección 4.5). */}
          <span>
            Expediente de trámite:{' '}
            {a.expedienteTramite ?? (a.origen === 'INFORME_9DJ' ? 'no aplica (informe de la prestataria)' : 'NO REGISTRADO')}
          </span>
        </div>
        {a.origen === 'INFORME_9DJ' && (
          <div className="hist-linea">
            <Badge color="azul">Informado por 9 de Julio</Badge>
            <span>Su vigencia solo se modifica por esa misma vía.</span>
          </div>
        )}
        {a.archivo && <div className="hist-linea">Archivo: {a.archivo}</div>}
      </>
    );
  }

  if (a.tipo === 'PRORROGA') {
    return (
      <>
        <div className="hist-linea">
          <span>{a.diasOtorgados} días corridos</span>
          <Badge color={estaVigente(a.fechaVencimiento) ? 'amarillo' : 'gris'}>
            {estaVigente(a.fechaVencimiento) ? 'Vigente' : 'Vencida'}
          </Badge>
          <span>Vence el {fmtFecha(a.fechaVencimiento)}</span>
        </div>
        {a.motivo && <div className="hist-linea">Motivo: {a.motivo}</div>}
      </>
    );
  }

  if (a.tipo === 'EXPEDIENTE') {
    return (
      <div className="hist-linea">
        <span>Expediente de multa N° {a.numeroExpediente}</span>
      </div>
    );
  }

  if (a.tipo === 'REINGRESO') {
    return (
      <div className="hist-linea">
        <span>Coordinación reingresó el local al circuito. La intimación arranca de cero.</span>
      </div>
    );
  }

  return null;
}

function HistorialActuaciones({ actuaciones, usuarios = [] }) {
  if (!actuaciones.length) {
    return <Vacio titulo="Sin actuaciones">Este local todavía no tiene ningún acto administrativo registrado.</Vacio>;
  }

  // Más reciente arriba: es lo que se quiere ver al abrir la ficha.
  const orden = [...actuaciones].reverse();

  return (
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
              <Detalle a={a} usuarios={usuarios} />
              {a.observaciones && <div className="hist-linea hist-obs">{a.observaciones}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default HistorialActuaciones;
