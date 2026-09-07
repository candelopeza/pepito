/* ============================================================================
   pages/config/Parametros.jsx  —  (URL: /#/config/parametros)
   ----------------------------------------------------------------------------
   >>> ESTA PANTALLA ES SOLO DE LA DIRECCIÓN, Y HAY UN MOTIVO <<<
   Sección 4.1: "Los plazos de notificación son fijos: cinco y tres días
   hábiles, establecidos por la Dirección. No se cargan por actuación y la
   coordinación no puede modificarlos. Deben implementarse como parámetros del
   sistema editables únicamente desde el rol Dirección, de modo que un cambio
   de criterio no requiera desarrollo, pero tampoco quede al alcance del uso
   diario."

   O sea: no es que la Dirección "también" puede; es que NADIE MÁS puede.

   ---------------------------------------------------------------------------
   LOS CUATRO PARÁMETROS DEL MEDIO SON DECISIONES PENDIENTES DEL ANEXO B.2.
   Están acá, y no escritos en el código, precisamente porque falta definirlos:
   cuando el área legal se pronuncie, se cambia el valor y listo. Cada uno dice
   con quién hay que definirlo.
   ---------------------------------------------------------------------------

   OJO: modificar un plazo NO recalcula los vencimientos ya guardados, y está
   bien que sea así. Los vencimientos se materializan al registrar la actuación
   (sección 5.2): queda constancia de qué plazo se aplicó, aunque la regla
   cambie después. Un cambio de criterio no puede alterar retroactivamente un
   acto administrativo ya notificado.
   ============================================================================ */

import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import Campo, { CampoSelect } from '../../components/ui/Campo';
import Aviso from '../../components/ui/Aviso';
import Confirmar from '../../components/ui/Confirmar';
import { useDatos } from '../../datos/datosContexto';
import { fmtFecha, hoyISO, vencimientoHabil } from '../../dominio/fechas';

function Parametros() {
  const { parametros, feriados, guardarParametros, reiniciarDemo } = useDatos();
  const [form, setForm] = useState(parametros);
  const [reiniciar, setReiniciar] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const cambiar = (campo, valor) => {
    setForm((p) => ({ ...p, [campo]: valor }));
    setGuardado(false);
  };

  function guardar() {
    guardarParametros({
      ...form,
      plazoNotif1: Number(form.plazoNotif1),
      plazoNotif2: Number(form.plazoNotif2),
      topeProrrogaDias: Number(form.topeProrrogaDias),
      maxProrrogasPorLocal: Number(form.maxProrrogasPorLocal),
    });
    setGuardado(true);
  }

  // Vista previa con los valores del formulario, antes de guardar.
  const preview1 = vencimientoHabil(hoyISO(), Number(form.plazoNotif1) || 0, feriados, form.contarDiaEntrega);
  const preview2 = vencimientoHabil(hoyISO(), Number(form.plazoNotif2) || 0, feriados, form.contarDiaEntrega);

  return (
    <>
      <PageHeader etiqueta="CONFIGURACIÓN" titulo="PARÁMETROS DEL SISTEMA" botonVolver />

      <Aviso tipo="alerta" titulo="Cambiar esto cambia cómo se computan los plazos de acá en adelante">
        Los vencimientos ya registrados NO se recalculan: quedan con el plazo que se les aplicó al momento del acto. Un cambio de
        criterio no puede alterar retroactivamente una notificación ya entregada.
      </Aviso>

      {/* ================= PLAZOS ================= */}
      <div className="accesos-header">
        <span>Plazos de notificación</span>
      </div>
      <div className="formulario">
        <div className="form-grilla">
          <Campo
            id="par-p1"
            etiqueta="Primera notificación (días hábiles)"
            tipo="number"
            min={1}
            valor={form.plazoNotif1}
            onChange={(v) => cambiar('plazoNotif1', v)}
            ayuda="Fijado por la Dirección. Hoy: 5 días hábiles."
          />
          <Campo
            id="par-p2"
            etiqueta="Segunda notificación (días hábiles)"
            tipo="number"
            min={1}
            valor={form.plazoNotif2}
            onChange={(v) => cambiar('plazoNotif2', v)}
            ayuda="Fijado por la Dirección. Hoy: 3 días hábiles."
          />
        </div>

        <div className="bloque-info">
          <strong>Con estos valores, una cédula entregada hoy vencería</strong>
          <span>
            Primera: <strong>{fmtFecha(preview1)}</strong> · Segunda: <strong>{fmtFecha(preview2)}</strong> (descontando sábados,
            domingos y los {feriados.length} feriados cargados).
          </span>
        </div>
      </div>

      {/* ================= DECISIONES PENDIENTES ================= */}
      <div className="accesos-header">
        <span>Decisiones pendientes (Anexo B.2)</span>
      </div>
      <div className="formulario">
        <CampoSelect
          id="par-diaentrega"
          etiqueta="¿El día de la entrega cuenta como día uno?"
          valor={String(form.contarDiaEntrega)}
          onChange={(v) => cambiar('contarDiaEntrega', v === 'true')}
          opciones={[
            { id: 'false', etiqueta: 'No: el plazo empieza al día siguiente' },
            { id: 'true', etiqueta: 'Sí: el día de la entrega es el día 1' },
          ]}
          vacio={null}
          ayuda="PENDIENTE de confirmar con el área legal del municipio."
        />

        <CampoSelect
          id="par-bisiesto"
          etiqueta="Una DDJJ emitida un 29 de febrero, ¿cuándo vence?"
          valor={form.modoBisiesto}
          onChange={(v) => cambiar('modoBisiesto', v)}
          opciones={[
            { id: '01-mar', etiqueta: 'El 1 de marzo del año siguiente' },
            { id: '28-feb', etiqueta: 'El 28 de febrero del año siguiente' },
          ]}
          vacio={null}
          ayuda="PENDIENTE con el área legal. El sistema viejo produce una fecha inválida que el motor de fechas corrige solo, de forma impredecible."
        />

        <CampoSelect
          id="par-datos"
          etiqueta="¿Exigir CUIT, razón social y rubro antes del expediente y de la reentrada?"
          valor={String(form.exigirDatosSiempre)}
          onChange={(v) => cambiar('exigirDatosSiempre', v === 'true')}
          opciones={[
            { id: 'true', etiqueta: 'Sí: también antes del expediente y de la reentrada' },
            { id: 'false', etiqueta: 'No: solo antes de la segunda notificación (como el sistema viejo)' },
          ]}
          vacio={null}
          ayuda="PENDIENTE con la Dirección de Ambiente y el área legal. Un expediente de multa contra un local sin CUIT ni razón social es tan impugnable como una notificación."
        />

        <CampoSelect
          id="par-emision"
          etiqueta="¿Cómo se dispara la emisión de cédulas?"
          valor={String(form.emisionAutomatica)}
          onChange={(v) => cambiar('emisionAutomatica', v === 'true')}
          opciones={[
            { id: 'false', etiqueta: 'Manual, con control previo de coordinación' },
            { id: 'true', etiqueta: 'Automática diaria, con verificación posterior' },
          ]}
          vacio={null}
          ayuda="PENDIENTE con la Dirección de Ambiente (sección 9.6). Si se opta por manual, conviene prever una ejecución automática de respaldo al final de la mañana, identificada como tal en la auditoría."
        />

        <div className="form-grilla">
          <Campo
            id="par-tope"
            etiqueta="Tope de días por prórroga (0 = sin tope)"
            tipo="number"
            min={0}
            valor={form.topeProrrogaDias}
            onChange={(v) => cambiar('topeProrrogaDias', v)}
            ayuda="PENDIENTE con el área legal."
          />
          <Campo
            id="par-max"
            etiqueta="Máximo de prórrogas por local (0 = sin máximo)"
            tipo="number"
            min={0}
            valor={form.maxProrrogasPorLocal}
            onChange={(v) => cambiar('maxProrrogasPorLocal', v)}
            ayuda="PENDIENTE con el área legal. Hoy solo avisa, no bloquea."
          />
        </div>

        <div className="form-acciones">
          <button type="button" className="btn-primario" onClick={guardar}>
            Guardar parámetros
          </button>
          {guardado && <span className="texto-ok">Guardado.</span>}
        </div>
      </div>

      {/* ================= DATOS DE LA MAQUETA ================= */}
      <div className="accesos-header">
        <span>Datos de demostración</span>
      </div>
      <Aviso tipo="info" titulo="Todavía no hay backend">
        Los datos viven en el almacenamiento de tu navegador, así que sobreviven a un F5 pero no se comparten con nadie. Si la demo
        quedó en un estado raro, reiniciala: vuelve a la carga original, con un local en cada estado del circuito.
      </Aviso>
      <div className="barra-lote">
        <button type="button" className="btn-peligro" onClick={() => setReiniciar(true)}>
          Reiniciar datos de demostración
        </button>
      </div>

      <Confirmar
        abierto={reiniciar}
        titulo="Reiniciar la demostración"
        textoConfirmar="Reiniciar"
        peligro
        onCancelar={() => setReiniciar(false)}
        onConfirmar={() => {
          reiniciarDemo();
          setReiniciar(false);
        }}
      >
        <p>Se descarta todo lo que cargaste y se vuelve a los datos iniciales.</p>
      </Confirmar>
    </>
  );
}

export default Parametros;
