/* ============================================================================
   FormEntrega.jsx  —  RESULTADO DE LA ENTREGA DE UNA CÉDULA
   ----------------------------------------------------------------------------
   Lo usan la app de campo (Mis entregas) y la ficha del local.

   >>> ESTE ES EL FORMULARIO MÁS IMPORTANTE DEL SISTEMA <<<
   Es el que hace correr el plazo. Todo lo que viene después —la segunda
   notificación, el expediente de multa— depende de la fecha que se cargue acá.

   TRES REGLAS QUE ESTÁN IMPLEMENTADAS EN ESTE ARCHIVO

   1. EL PLAZO ARRANCA EN LA ENTREGA, NO EN LA EMISIÓN (sección 4.1).
      Por eso se pide la fecha de entrega y no se usa la fecha de hoy: el
      notificador puede estar cargando ayer a la mañana.

   2. "NO ENTREGADA" NO HACE CORRER NINGÚN PLAZO.
      El circuito se detiene entero hasta que la entrega se concrete. Es la
      garantía de debido proceso: sin notificación fehaciente no hay avance.
      Al elegir esa opción el formulario deja de mostrar vencimiento, porque no
      hay vencimiento que mostrar.

   3. LA FOTO ES OBLIGATORIA CUANDO LA ENTREGA NO SE CONCRETA (sección 6.2).
      Es la única evidencia de que el notificador estuvo en el domicilio.

   Además pide el NÚMERO DE CÉDULA que figura en el papel entregado, y lo
   compara con el de la asignación: si el notificador entregó otra cédula, hay
   que detectarlo acá y no tres meses después, cuando el titular impugne.

   >>> DEL NÚMERO SE ESCRIBE SOLO EL NÚMERO <<<
   El campo acepta únicamente dígitos y el sistema completa el prefijo y los
   ceros: para la cédula CED-001275 alcanza con teclear 1275. Debajo del campo
   se muestra cómo quedó armado, así el notificador confirma contra el papel
   antes de guardar. La conversión y la comparación están en
   dominio/actuaciones.js (completarNumeroCedula / mismoNumeroCedula), no acá:
   si algún día el formato cambia, cambia en un solo lugar.
   ============================================================================ */

import { useState } from 'react';
import Campo, { CampoSelect, CampoTexto } from './ui/Campo';
import Aviso from './ui/Aviso';
import { useDatos } from '../datos/datosContexto';
import {
  DIGITOS_CEDULA,
  RESULTADOS_ENTREGA,
  completarNumeroCedula,
  digitosCedula,
  mismoNumeroCedula,
} from '../dominio/actuaciones';
import { fmtFecha, hoyISO, vencimientoHabil } from '../dominio/fechas';

function FormEntrega({ cedula, local, onGuardar, onCancelar }) {
  const { feriados, parametros } = useDatos();

  const [datos, setDatos] = useState({
    numeroConfirmado: '',
    resultado: '',
    fechaEntrega: hoyISO(),
    observaciones: '',
    evidencia: '',
  });
  const [errores, setErrores] = useState({});

  const cambiar = (campo, valor) => setDatos((p) => ({ ...p, [campo]: valor }));

  const noEntregada = datos.resultado === 'NO_ENTREGADA';

  // Cómo queda el número una vez completado ('1275' -> 'CED-001275'). Se
  // muestra debajo del campo y es también lo que se valida.
  const numeroArmado = completarNumeroCedula(datos.numeroConfirmado);
  const plazoDias = cedula.instancia === 1 ? parametros.plazoNotif1 : parametros.plazoNotif2;

  // Vista previa del vencimiento, calculada con la misma función que usa el
  // sistema al guardar. Días hábiles, descontando feriados.
  const vencimiento =
    datos.resultado && !noEntregada && datos.fechaEntrega
      ? vencimientoHabil(datos.fechaEntrega, plazoDias, feriados, parametros.contarDiaEntrega)
      : '';

  function validar() {
    const e = {};
    if (!datos.resultado) e.resultado = 'Indicá qué pasó con la entrega.';
    if (!noEntregada && !datos.fechaEntrega) e.fechaEntrega = 'La fecha de entrega es obligatoria: es la que hace correr el plazo.';
    if (datos.fechaEntrega > hoyISO()) e.fechaEntrega = 'No se puede registrar una entrega con fecha futura.';
    if (!numeroArmado) {
      e.numeroConfirmado = 'Escribí el número que figura en la cédula entregada.';
    } else if (!mismoNumeroCedula(numeroArmado, cedula.numeroCedula)) {
      // Los ceros no cuentan: 1275 y 001275 son la misma cédula. Lo que no
      // puede pasar es que sea OTRO número.
      e.numeroConfirmado = `${numeroArmado} no coincide con la cédula asignada (${cedula.numeroCedula}). Revisá el documento.`;
    }
    if (noEntregada && !datos.evidencia.trim()) {
      e.evidencia = 'La fotografía es obligatoria cuando la entrega no se concreta.';
    }
    return e;
  }

  function enviar(ev) {
    ev.preventDefault();
    const encontrados = validar();
    setErrores(encontrados);
    if (Object.keys(encontrados).length) return;

    onGuardar({
      resultado: datos.resultado,
      fechaEntrega: datos.fechaEntrega,
      observaciones: datos.observaciones,
      evidencia: datos.evidencia || null,
    });
  }

  return (
    <form className="formulario formulario-modal" onSubmit={enviar} noValidate autoComplete="off">
      <div className="bloque-info">
        <strong>{local?.nombreLocal ?? 'Local'}</strong>
        <span>{local?.direccion}</span>
        <span>
          Cédula {cedula.numeroCedula} · {cedula.instancia === 1 ? 'Primera' : 'Segunda'} notificación · plazo de {plazoDias} días
          hábiles
        </span>
      </div>

      <div className="form-grilla">
        {/* Solo dígitos: cualquier otra tecla no entra. Los ceros de adelante
            y el 'CED-' los pone el sistema, por eso el `ayuda` de abajo
            cambia y muestra el número ya armado. */}
        <Campo
          id="ent-numero"
          etiqueta="N° de cédula entregada"
          teclado="numeric"
          largoMaximo={DIGITOS_CEDULA}
          valor={datos.numeroConfirmado}
          onChange={(v) => cambiar('numeroConfirmado', digitosCedula(v))}
          error={errores.numeroConfirmado}
          ayuda={
            numeroArmado
              ? `Se va a registrar como ${numeroArmado}. Compará contra el papel que entregaste.`
              : 'Escribí solo el número del papel que entregaste: para CED-001275 alcanza con 1275.'
          }
          ancho={2}
        />

        <CampoSelect
          id="ent-resultado"
          etiqueta="Resultado de la entrega"
          valor={datos.resultado}
          onChange={(v) => cambiar('resultado', v)}
          opciones={RESULTADOS_ENTREGA.map((r) => ({ id: r.id, etiqueta: r.etiqueta }))}
          error={errores.resultado}
          ancho={2}
        />

        {!noEntregada && (
          <Campo
            id="ent-fecha"
            etiqueta="Fecha de entrega efectiva"
            tipo="date"
            valor={datos.fechaEntrega}
            onChange={(v) => cambiar('fechaEntrega', v)}
            error={errores.fechaEntrega}
            max={hoyISO()}
            ayuda="Desde acá corre el plazo. No es la fecha de emisión de la cédula."
          />
        )}

        <Campo
          id="ent-foto"
          etiqueta={noEntregada ? 'Fotografía (obligatoria)' : 'Fotografía del local'}
          valor={datos.evidencia}
          onChange={(v) => cambiar('evidencia', v)}
          error={errores.evidencia}
          ayuda="Maqueta: escribí el nombre del archivo."
        />

        <CampoTexto
          id="ent-obs"
          etiqueta="Observaciones"
          valor={datos.observaciones}
          onChange={(v) => cambiar('observaciones', v)}
          ayuda={noEntregada ? 'Contá por qué no se pudo entregar: sirve para el expediente.' : undefined}
          ancho={2}
        />
      </div>

      {/* ---------- Lo que va a pasar al guardar ----------
          Que el notificador vea la consecuencia antes de confirmar. */}
      {vencimiento && (
        <Aviso tipo="alerta" titulo={`El plazo vence el ${fmtFecha(vencimiento)}`}>
          {plazoDias} días hábiles desde la entrega, descontando sábados, domingos y feriados del calendario cargado.
        </Aviso>
      )}

      {noEntregada && (
        <Aviso tipo="bloqueo" titulo="El circuito se detiene">
          Una cédula que consta como no entregada no hace correr ningún plazo y el local no avanza a la instancia siguiente hasta
          que la entrega se concrete. Sin notificación fehaciente no hay avance.
        </Aviso>
      )}

      <div className="form-acciones">
        <button type="submit" className="btn-primario">
          Registrar entrega
        </button>
        <button type="button" className="btn-secundario" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export default FormEntrega;
