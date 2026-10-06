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

   NOMBRES DE LOS ESTADOS (sección 3.1: "una etiqueta de presentación
   editable"). Plegado al final: se cambia el texto que ven todas las
   pantallas, nunca el código. Vacío = el nombre original.
   ============================================================================ */

import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import Campo, { CampoSelect } from '../../components/ui/Campo';
import Confirmar from '../../components/ui/Confirmar';
import { useDatos } from '../../datos/datosContexto';
import { fmtFecha, hoyISO, vencimientoHabil } from '../../dominio/fechas';
import { LISTA_ESTADOS, etiquetaOriginal } from '../../dominio/estados';

/* Los nombres de los estados. Guarda solo los que cambiaron. */
/* OCULTOS HASTA QUE SE DECIDAN (pedido del equipo, 6/10/2026). Los plazos, las
   decisiones pendientes del Anexo B.2 y los nombres de los estados no se
   muestran todavía: rigen los valores de backend/parametros-sistema.js (o los
   ya guardados en la tabla `parametro`). No se borró nada: para volver a
   mostrarlos alcanza con poner estas constantes en true. */
const MOSTRAR_PLAZOS_Y_DECISIONES = false;
const MOSTRAR_NOMBRES_ESTADOS = false;

function NombresEstados({ guardados, sePuedeGuardar, guardarParametros }) {
  const [nombres, setNombres] = useState(() => ({ ...(guardados ?? {}) }));
  const [guardado, setGuardado] = useState(false);
  const cambiados = Object.keys(nombres).filter(
    (c) => nombres[c]?.trim() && nombres[c].trim() !== etiquetaOriginal(c),
  ).length;

  async function guardar() {
    const mapa = {};
    LISTA_ESTADOS.forEach(({ codigo }) => {
      const texto = nombres[codigo]?.trim();
      if (texto && texto !== etiquetaOriginal(codigo)) mapa[codigo] = texto;
    });
    setGuardado(Boolean(await guardarParametros({ etiquetasEstado: mapa })));
  }

  return (
    <details className="portal-historial">
      <summary>
        Nombres de los estados{cambiados ? ` (${cambiados} cambiado${cambiados === 1 ? '' : 's'})` : ''}
      </summary>
      <div className="formulario">
        <div className="form-grilla">
          {LISTA_ESTADOS.map(({ codigo }) => (
            <Campo
              key={codigo}
              id={`estado-${codigo}`}
              etiqueta={etiquetaOriginal(codigo)}
              valor={nombres[codigo] ?? ''}
              onChange={(v) => {
                setNombres((n) => ({ ...n, [codigo]: v }));
                setGuardado(false);
              }}
              largoMaximo={80}
              ayuda={codigo}
            />
          ))}
        </div>
        <div className="form-acciones">
          <button type="button" className="btn-primario" onClick={guardar} disabled={!sePuedeGuardar}>
            Guardar nombres
          </button>
          {guardado && <span className="texto-ok">Guardado.</span>}
        </div>
      </div>
    </details>
  );
}

function Parametros() {
  const { parametros, feriados, guardarParametros, reiniciarDemo, capacidades, recalcularEstados } = useDatos();
  // Se guardan si la base tiene la tabla opcional `parametro` (backend/sql/06).
  const sePuedeGuardar = Boolean(capacidades?.parametros);
  const [form, setForm] = useState(parametros);
  const [reiniciar, setReiniciar] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const cambiar = (campo, valor) => {
    setForm((p) => ({ ...p, [campo]: valor }));
    setGuardado(false);
  };

  async function guardar() {
    // Los nombres de estado y la plantilla se guardan desde su propia sección:
    // si viajaran acá, un formulario abierto desde antes los pisaría.
    const { etiquetasEstado: _nombres, plantillaCedula: _plantilla, ...resto } = form;
    const r = await guardarParametros({
      ...resto,
      plazoNotif1: Number(form.plazoNotif1),
      plazoNotif2: Number(form.plazoNotif2),
      topeProrrogaDias: Number(form.topeProrrogaDias),
      maxProrrogasPorLocal: Number(form.maxProrrogasPorLocal),
    });
    // "Guardado." solo si el servidor lo guardó. Antes aparecía siempre.
    setGuardado(Boolean(r));
  }

  // Vista previa con los valores del formulario, antes de guardar.
  const preview1 = vencimientoHabil(hoyISO(), Number(form.plazoNotif1) || 0, feriados, form.contarDiaEntrega);
  const preview2 = vencimientoHabil(hoyISO(), Number(form.plazoNotif2) || 0, feriados, form.contarDiaEntrega);

  return (
    <>
      <PageHeader etiqueta="CONFIGURACIÓN" titulo="PARÁMETROS DEL SISTEMA" botonVolver />
      {MOSTRAR_PLAZOS_Y_DECISIONES && (
        <>
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
                Primera: <strong>{fmtFecha(preview1)}</strong> · Segunda: <strong>{fmtFecha(preview2)}</strong>{' '}
                (descontando sábados, domingos y los {feriados.length} feriados cargados).
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
              ayuda="PENDIENTE con la Dirección de Ambiente (sección 9.6). La automática emite toda la cola los días hábiles a las 7."
            />

            {/* Solo tiene sentido con la emisión manual. */}
            {!form.emisionAutomatica && (
              <CampoSelect
                id="par-respaldo"
                etiqueta="Si a las 12 la cola sigue sin emitir"
                valor={String(Boolean(form.emisionRespaldo))}
                onChange={(v) => cambiar('emisionRespaldo', v === 'true')}
                opciones={[
                  { id: 'false', etiqueta: 'Queda esperando a que alguien la emita' },
                  { id: 'true', etiqueta: 'La emite el sistema (queda como emisión automática en el historial)' },
                ]}
                vacio={null}
              />
            )}

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
              <button type="button" className="btn-primario" onClick={guardar} disabled={!sePuedeGuardar}>
                Guardar parámetros
              </button>
              {guardado && <span className="texto-ok">Guardado.</span>}
              {!sePuedeGuardar && (
                <span className="texto-gris">Esta base todavía no permite cambiarlos desde acá.</span>
              )}
            </div>
          </div>
        </>
      )}

      {MOSTRAR_NOMBRES_ESTADOS && (
        <NombresEstados
          guardados={parametros.etiquetasEstado}
          sePuedeGuardar={sePuedeGuardar}
          guardarParametros={guardarParametros}
        />
      )}

      {/* ================= DATOS DEL SERVIDOR =================
          Antes era "Reiniciar datos de demostración" de la maqueta con
          localStorage. Con la base del área no hay demo que reiniciar: el botón
          vuelve a pedir los datos al servidor y no borra nada. */}
      <div className="accesos-header">
        <span>Datos</span>
      </div>
      <div className="barra-lote">
        <button type="button" className="btn-secundario" onClick={() => setReiniciar(true)}>
          Recargar datos del servidor
        </button>
        {capacidades?.auditoria && (
          <button type="button" className="btn-secundario" onClick={() => recalcularEstados()}>
            Revisar vencimientos ahora
          </button>
        )}
      </div>

      <Confirmar
        abierto={reiniciar}
        titulo="Recargar los datos"
        textoConfirmar="Recargar"
        onCancelar={() => setReiniciar(false)}
        onConfirmar={() => {
          reiniciarDemo();
          setReiniciar(false);
        }}
      >
        <p>Se vuelven a pedir los datos al servidor. No se borra nada.</p>
      </Confirmar>
    </>
  );
}

export default Parametros;
