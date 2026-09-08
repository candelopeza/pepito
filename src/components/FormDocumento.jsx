/* ============================================================================
   FormDocumento.jsx  —  REGISTRAR DDJJ / DDJJ DE RECICLAJE / CONTRATO
   ----------------------------------------------------------------------------
   Lo usan tres pantallas: Documentación, la ficha del local y el portal del
   titular. Es el mismo acto administrativo en los tres casos, así que tiene
   que pedir lo mismo y calcular lo mismo.

   DOS COSAS QUE ESTE FORMULARIO HACE Y EL SISTEMA VIEJO NO

   1. PIDE EL NÚMERO DEL EXPEDIENTE DE TRÁMITE (sección 4.5).
      Toda presentación es un trámite formal: se inicia en CiDiTuc, recibe su
      propio número de expediente y paga un timbrado. El sistema viejo guarda
      el número de la DDJJ pero no el del expediente que le dio curso, así que
      hoy no se puede reconstruir el trámite que respalda una acreditación.
      >>> NO CONFUNDIR CON EL EXPEDIENTE DE MULTA <<<
      Uno acredita cumplimiento, el otro inicia una sanción. Son campos
      distintos y tipos de actuación distintos, a propósito.

   2. MUESTRA EL VENCIMIENTO ANTES DE GUARDAR.
      La DDJJ vence al año calendario exacto, y ese día ya no está vigente. Se
      calcula acá con la misma función que usa el motor de estados, así lo que
      ve el usuario es exactamente lo que se va a guardar.

   PENDIENTE con la Dirección Técnica (sección 4.5): el TIMBRADO. Falta definir
   si el portal gestiona el pago o si el trámite se constituye íntegramente en
   CiDiTuc y el sistema solo registra el número resultante. Este formulario
   asume lo segundo, que es el escenario de menor acoplamiento.
   ============================================================================ */

import { useState } from 'react';
import Campo, { CampoSelect, CampoTexto } from './ui/Campo';
import Aviso from './ui/Aviso';
import { useDatos } from '../datos/datosContexto';
import { ETIQUETA_DOCUMENTO, TIPOS_DOCUMENTO } from '../dominio/actuaciones';
import { fmtFecha, hoyISO } from '../dominio/fechas';
import { vencimientoAnual } from '../dominio/vigencias';

function FormDocumento({ local, onGuardar, onCancelar, desdePortal = false }) {
  const { parametros } = useDatos();

  const [datos, setDatos] = useState({
    tipo: 'DDJJ',
    numero: '',
    fechaEmision: hoyISO(),
    fechaVencimiento: '',
    expedienteTramite: '',
    observaciones: '',
    archivo: '',
  });
  const [errores, setErrores] = useState({});

  const cambiar = (campo, valor) => setDatos((p) => ({ ...p, [campo]: valor }));

  const esContrato = datos.tipo === 'CONTRATO';

  // El contrato trae su fecha; la DDJJ la calcula el sistema.
  const vencimientoCalculado = esContrato
    ? datos.fechaVencimiento
    : vencimientoAnual(datos.fechaEmision, parametros.modoBisiesto);

  function validar() {
    const e = {};
    if (!datos.numero.trim()) e.numero = 'El número del documento es obligatorio.';
    if (!datos.fechaEmision) e.fechaEmision = 'La fecha de emisión es obligatoria.';
    if (esContrato && !datos.fechaVencimiento) {
      e.fechaVencimiento = 'El contrato tiene que declarar su fecha de vencimiento.';
    }
    if (esContrato && datos.fechaVencimiento && datos.fechaVencimiento <= datos.fechaEmision) {
      e.fechaVencimiento = 'El vencimiento tiene que ser posterior a la emisión.';
    }
    if (!datos.expedienteTramite.trim()) {
      e.expedienteTramite = 'Sin el número de expediente no se puede reconstruir el trámite que respalda la presentación.';
    }
    if (!datos.archivo.trim()) e.archivo = 'Adjuntá el documento respaldatorio.';
    return e;
  }

  function enviar(ev) {
    ev.preventDefault();
    const encontrados = validar();
    setErrores(encontrados);
    if (Object.keys(encontrados).length) return;

    onGuardar({
      ...datos,
      numero: datos.numero.trim(),
      expedienteTramite: datos.expedienteTramite.trim(),
      // Lo que entra por el portal NO cuenta hasta que un agente lo apruebe.
      validado: !desdePortal,
      origen: 'PRESENTADO_TITULAR',
    });
  }

  return (
    <form className="formulario formulario-modal" onSubmit={enviar} noValidate autoComplete="off">
      <div className="bloque-info">
        <strong>{local.nombreLocal}</strong>
        <span>
          {local.razonSocial || 'Sin razón social'} · {local.direccion}
        </span>
      </div>

      {desdePortal && (
        <Aviso tipo="info" titulo="La presentación entra en una bandeja de validación">
          El estado del local no cambia hasta que un agente de la oficina apruebe la documentación. El plazo en curso sigue
          corriendo mientras eso pasa.
        </Aviso>
      )}

      <div className="form-grilla">
        <CampoSelect
          id="doc-tipo"
          etiqueta="Tipo de documentación"
          valor={datos.tipo}
          onChange={(v) => cambiar('tipo', v)}
          opciones={TIPOS_DOCUMENTO.map((t) => ({ id: t, etiqueta: ETIQUETA_DOCUMENTO[t] }))}
          vacio={null}
          ancho={2}
        />

        <Campo
          id="doc-numero"
          etiqueta="Número del documento"
          valor={datos.numero}
          onChange={(v) => cambiar('numero', v)}
          error={errores.numero}
          ayuda={esContrato ? 'Número de contrato con el prestador.' : 'Número de la declaración jurada.'}
        />

        <Campo
          id="doc-expediente"
          etiqueta="N° de expediente del trámite"
          valor={datos.expedienteTramite}
          onChange={(v) => cambiar('expedienteTramite', v)}
          error={errores.expedienteTramite}
          ayuda="El que asignó CiDiTuc a esta presentación. NO es el expediente de multa."
        />

        <Campo
          id="doc-emision"
          etiqueta="Fecha de emisión"
          tipo="date"
          valor={datos.fechaEmision}
          onChange={(v) => cambiar('fechaEmision', v)}
          error={errores.fechaEmision}
        />

        {esContrato ? (
          <Campo
            id="doc-vencimiento"
            etiqueta="Vencimiento del contrato"
            tipo="date"
            valor={datos.fechaVencimiento}
            onChange={(v) => cambiar('fechaVencimiento', v)}
            error={errores.fechaVencimiento}
            ayuda="La fecha que declara el propio contrato."
          />
        ) : (
          <Campo
            id="doc-vencimiento-calc"
            etiqueta="Vence el"
            valor={fmtFecha(vencimientoCalculado)}
            onChange={() => {}}
            soloLectura
            ayuda="Un año calendario exacto. Ese día ya no está vigente."
          />
        )}

        {/* MAQUETA: no hay subida real de archivos, se escribe el nombre.
            Cuando exista el backend acá va un <input type="file"> y el archivo
            se guarda con su hash, para poder probar que no se cambió. */}
        <Campo
          id="doc-archivo"
          etiqueta="Documento respaldatorio"
          valor={datos.archivo}
          onChange={(v) => cambiar('archivo', v)}
          error={errores.archivo}
          ayuda="Maqueta: escribí el nombre del archivo. Todavía no hay subida real."
          ancho={2}
        />

        <CampoTexto
          id="doc-obs"
          etiqueta="Observaciones"
          valor={datos.observaciones}
          onChange={(v) => cambiar('observaciones', v)}
          ancho={2}
        />
      </div>

      {vencimientoCalculado && (
        <Aviso tipo="ok" titulo={`Al registrarse, el local sale del circuito sancionatorio hasta el ${fmtFecha(vencimientoCalculado)}`}>
          La documentación vigente tiene prioridad sobre cualquier notificación en curso. Cuando venza, el local reingresa solo a
          primera notificación pendiente.
        </Aviso>
      )}

      <div className="form-acciones">
        <button type="submit" className="btn-primario">
          {desdePortal ? 'Presentar documentación' : 'Registrar documentación'}
        </button>
        <button type="button" className="btn-secundario" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export default FormDocumento;
