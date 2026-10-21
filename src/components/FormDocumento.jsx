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
import Campo, { CampoArchivo, CampoSelect, CampoTexto } from './ui/Campo';
import Aviso from './ui/Aviso';
import { useDatos } from '../datos/datosContexto';
import { ETIQUETA_DOCUMENTO, TIPOS_DOCUMENTO } from '../dominio/actuaciones';
import { fmtFecha, hoyISO } from '../dominio/fechas';
import { vencimientoAnual } from '../dominio/vigencias';

function FormDocumento({ local, onGuardar, onCancelar, desdePortal = false }) {
  const { parametros, capacidades } = useDatos();
  // Con la tabla `archivo` (backend/sql/08) el documento se adjunta de verdad
  // (PDF o foto) y la oficina lo puede ver al validar. Sin ella, se escribe el
  // nombre del archivo como antes.
  const adjuntaArchivo = Boolean(capacidades?.archivos);

  const [datos, setDatos] = useState({
    tipo: 'DDJJ',
    numero: '',
    fechaEmision: hoyISO(),
    fechaVencimiento: '',
    expedienteTramite: '',
    observaciones: '',
    archivo: '',
    adjunto: '',
    adjuntoNombre: '',
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
    // El expediente del trámite es OBLIGATORIO: sin él no se puede reconstruir
    // qué trámite respalda la acreditación. Acá no hay excepción: la marca
    // "sin expediente registrado" es SOLO para documentos que ya existían de
    // antes, nunca para una carga nueva (sería la puerta para saltearse la
    // obligatoriedad tildando y guardando sin número).
    if (!datos.expedienteTramite.trim()) {
      e.expedienteTramite = desdePortal
        ? 'Indicá el número de expediente de tu trámite: te lo dieron al iniciarlo.'
        : 'Es el número del trámite que inició la presentación. Toda presentación nueva lo tiene.';
    }
    if (!datos.fechaEmision) e.fechaEmision = 'La fecha de emisión es obligatoria.';
    // Una emisión futura es imposible: el documento ya existe cuando se carga.
    // El servidor también lo rechaza; acá se avisa antes de enviar.
    if (datos.fechaEmision && datos.fechaEmision > hoyISO()) {
      e.fechaEmision = 'La fecha de emisión no puede ser futura: el documento ya fue emitido.';
    }
    if (esContrato && !datos.fechaVencimiento) {
      e.fechaVencimiento = 'El contrato tiene que declarar su fecha de vencimiento.';
    }
    if (esContrato && datos.fechaVencimiento && datos.fechaVencimiento <= datos.fechaEmision) {
      e.fechaVencimiento = 'El vencimiento tiene que ser posterior a la emisión.';
    }
    if (adjuntaArchivo) {
      if (!datos.adjunto) e.adjunto = 'Adjuntá el documento respaldatorio.';
    } else if (!datos.archivo.trim()) {
      e.archivo = 'Adjuntá el documento respaldatorio.';
    }
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
        />

        {/* >>> EL EXPEDIENTE DEL TRÁMITE ES OBLIGATORIO Y NO SE INVENTA <<<
            Presentar inicia un trámite POR FUERA del sistema, y ese trámite
            tiene su número: es el respaldo administrativo de la acreditación.
            El sistema NO lo autogenera (un número inventado para poder guardar
            es un dato sin sentido). PENDIENTE con la Dirección: el pliego decía
            que lo asignaba CiDiTuc y no es así; falta confirmar quién lo asigna
            y dónde se abona el timbrado. */}
        <Campo
          id="doc-expediente"
          etiqueta="N° de expediente del trámite"
          valor={datos.expedienteTramite}
          onChange={(v) => cambiar('expedienteTramite', v)}
          error={errores.expedienteTramite}
          ayuda={
            desdePortal
              ? 'Es el número que te dieron al iniciar el trámite de tu presentación en el municipio.'
              : 'El número que recibió el titular al iniciar el trámite de la presentación. NO es el expediente de multa.'
          }
        />

        <Campo
          id="doc-emision"
          etiqueta="Fecha de emisión"
          tipo="date"
          valor={datos.fechaEmision}
          onChange={(v) => cambiar('fechaEmision', v)}
          max={hoyISO()}
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
            ayuda="Ese día ya no está vigente."
          />
        )}

        {/* MAQUETA: no hay subida real de archivos, se escribe el nombre.
            Cuando exista el backend acá va un <input type="file"> y el archivo
            se guarda con su hash, para poder probar que no se cambió. */}
        {adjuntaArchivo ? (
          <CampoArchivo
            id="doc-adjunto"
            etiqueta="Documento respaldatorio"
            valor={datos.adjunto}
            nombre={datos.adjuntoNombre}
            onChange={(contenido, nombre) => setDatos((p) => ({ ...p, adjunto: contenido, adjuntoNombre: nombre, archivo: nombre }))}
            error={errores.adjunto}
            ayuda="PDF o foto del documento."
            ancho={2}
          />
        ) : (
          <Campo
            id="doc-archivo"
            etiqueta="Documento respaldatorio"
            valor={datos.archivo}
            onChange={(v) => cambiar('archivo', v)}
            error={errores.archivo}
            ayuda="Escribi el nombre del archivo."
            ancho={2}
          />
        )}

        <CampoTexto
          id="doc-obs"
          etiqueta="Observaciones"
          valor={datos.observaciones}
          onChange={(v) => cambiar('observaciones', v)}
          ancho={2}
        />
      </div>

      {vencimientoCalculado && !desdePortal && (
        <Aviso tipo="ok" titulo={`Al registrarse, el local sale del circuito sancionatorio hasta el ${fmtFecha(vencimientoCalculado)}`}>
          La documentación vigente tiene prioridad sobre cualquier notificación en curso.
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
