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

   >>> MODO CORRECCIÓN (`correccion`) <<<
   Para arreglar una entrega mal cargada (sección 6.2). Arranca con lo que
   está registrado y no vuelve a pedir el número del papel. Con `pideMotivo`
   (la oficina) el motivo es obligatorio: queda en el historial del local.
   ============================================================================ */

import { useState } from 'react';
import Campo, { CampoFoto, CampoSelect, CampoTexto } from './ui/Campo';
import Aviso from './ui/Aviso';
import { useDatos } from '../datos/datosContexto';
import {
  DIGITOS_CEDULA,
  RESULTADOS_ENTREGA,
  armarNumeroCedula,
  digitosCedula,
  mismoNumeroCedula,
} from '../dominio/actuaciones';
import { fmtFecha, hoyISO, vencimientoHabil } from '../dominio/fechas';

/* La foto de la entrega se saca en el momento, con la cámara: cuando la entrega
   no se concreta es la única prueba de que el notificador estuvo en el
   domicilio, y una foto vieja de la galería no prueba nada (decidido con
   DITEC, 15/10/2026). No rige al corregir una entrega desde la oficina. En
   false vuelve a dejar elegir de la galería. */
const FOTO_SOLO_CAMARA = true;

function FormEntrega({ cedula, local, onGuardar, onCancelar, correccion = false, pideMotivo = false }) {
  const { feriados, parametros, capacidades } = useDatos();
  // La foto se guarda si la base tiene la tabla `archivo` (backend/sql/08).
  // Sin ella no hay dónde guardarla, y no se puede exigir.
  const fotoSeGuarda = Boolean(capacidades?.archivos);

  const [datos, setDatos] = useState({
    // Al corregir, el número ya se confirmó cuando se registró.
    numeroConfirmado: correccion ? digitosCedula(cedula.numeroCedula ?? '') : '',
    resultado: correccion ? (cedula.resultado ?? '') : '',
    fechaEntrega: correccion ? (cedula.fechaEntrega ?? hoyISO()) : hoyISO(),
    observaciones: correccion ? (cedula.observaciones ?? '') : '',
    evidencia: '',
    evidenciaNombre: '',
    motivo: '',
  });
  const [errores, setErrores] = useState({});

  const cambiar = (campo, valor) => setDatos((p) => ({ ...p, [campo]: valor }));

  const noEntregada = datos.resultado === 'NO_ENTREGADA';

  // Cómo queda el número una vez completado, con el formato de la cédula
  // asignada ('675' -> '0001-675'). Se muestra debajo del campo y es también
  // lo que se valida.
  const numeroArmado = armarNumeroCedula(datos.numeroConfirmado, cedula.numeroCedula);
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
    // Al corregir, el número ya se confirmó cuando se registró la entrega: el
    // campo no se muestra y no se vuelve a validar (si no, el error quedaba
    // en un campo oculto y no se podía guardar).
    if (correccion) {
      // nada que controlar
    } else if (!numeroArmado) {
      e.numeroConfirmado = 'Escribí el número que figura en la cédula entregada.';
    } else if (!mismoNumeroCedula(numeroArmado, cedula.numeroCedula)) {
      // Los ceros no cuentan: 1275 y 001275 son la misma cédula. Lo que no
      // puede pasar es que sea OTRO número.
      e.numeroConfirmado = `${numeroArmado} no coincide con la cédula asignada (${cedula.numeroCedula}). Revisá el documento.`;
    }
    if (noEntregada && fotoSeGuarda && !datos.evidencia) {
      e.evidencia = 'La fotografía es obligatoria cuando la entrega no se concreta.';
    }
    if (pideMotivo && !datos.motivo.trim()) e.motivo = 'Escribí por qué se corrige: queda en el historial del local.';
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
      // La foto va solo si se puede guardar: si no, el servidor la ignoraría
      // y en la cola sin conexión ocuparía lugar para nada.
      evidencia: fotoSeGuarda ? datos.evidencia || null : null,
      evidenciaNombre: datos.evidenciaNombre || null,
      ...(correccion ? { motivo: datos.motivo.trim() } : {}),
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
        {!correccion && (
          <Campo
            id="ent-numero"
            etiqueta="N° de cédula entregada"
            teclado="numeric"
            largoMaximo={DIGITOS_CEDULA}
            valor={datos.numeroConfirmado}
            onChange={(v) => cambiar('numeroConfirmado', digitosCedula(v))}
            error={errores.numeroConfirmado}
            ayuda={numeroArmado || undefined}
            ancho={2}
          />
        )}

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
          />
        )}

        <CampoFoto
          id="ent-foto"
          etiqueta={noEntregada && fotoSeGuarda ? 'Fotografía (obligatoria)' : 'Fotografía del local'}
          soloCamara={FOTO_SOLO_CAMARA && !correccion}
          valor={datos.evidencia}
          onChange={(imagen, nombre) => setDatos((p) => ({ ...p, evidencia: imagen, evidenciaNombre: nombre }))}
          error={errores.evidencia}
          ayuda={fotoSeGuarda ? undefined : 'Esta base todavía no guarda fotos.'}
        />

        <CampoTexto
          id="ent-obs"
          etiqueta="Observaciones"
          valor={datos.observaciones}
          onChange={(v) => cambiar('observaciones', v)}
          ayuda={noEntregada ? 'Contá por qué no se pudo entregar: sirve para el expediente.' : undefined}
          ancho={2}
        />

        {correccion && (
          <CampoTexto
            id="ent-motivo"
            etiqueta={pideMotivo ? 'Motivo de la corrección (obligatorio)' : 'Motivo de la corrección'}
            valor={datos.motivo}
            onChange={(v) => cambiar('motivo', v)}
            error={errores.motivo}
            ancho={2}
          />
        )}
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
          {correccion ? 'Guardar corrección' : 'Registrar entrega'}
        </button>
        <button type="button" className="btn-secundario" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export default FormEntrega;
