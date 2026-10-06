/* ============================================================================
   FormLocal.jsx  —  FORMULARIO DEL LOCAL (ver / editar / alta)
   ----------------------------------------------------------------------------
   Es el contenido del modal del padrón. El MISMO formulario sirve para las
   tres cosas, según las props:

     soloLectura = true    botón "Ver": campos bloqueados, sin Guardar
     soloLectura = false   editar o dar de alta
     esNuevo     = true    alta (cambia textos, no el formulario)

   >>> QUÉ CAMPOS TIENE Y POR QUÉ <<<
   Son los del modelo de datos del pliego (sección 5.1). Los tres primeros son
   los DATOS REGISTRALES: sin CUIT, razón social y rubro el local no puede
   avanzar a segunda notificación, porque la cédula no individualizaría bien al
   sujeto obligado. Por eso están juntos y marcados.

   >>> LA COORDENADA NO SE CARGA A MANO <<<
   No hay campos de latitud y longitud, y no es un olvido. La ubicación del
   local se obtiene SIEMPRE geocodificando la dirección declarada (sección 9.2).
   Si cambiás la dirección y guardás, la coordenada se recalcula sola. Si la
   dirección no se puede geocodificar, el local queda sin ubicación y aparece
   en Herramientas → Geocodificación pendiente: no se le pone un valor
   aproximado ni se copia la del relevamiento.

   >>> EL CAMPO "CASA CENTRAL / SUCURSAL" NO ESTÁ <<<
   Existe en el padrón viejo (columna C) pero no participa de ninguna regla ni
   tiene uso operativo. El pliego dice expresamente que no se migre (5.3).
   ============================================================================ */

import { useState } from 'react';
import Campo, { CampoSelect, CampoTexto } from './ui/Campo';
import { useDatos } from '../datos/datosContexto';

/* 11 dígitos, con o sin guiones. No valida el dígito verificador: eso lo tiene
   que hacer el backend contra la constancia de inscripción fiscal, no una
   expresión regular en el navegador. */
const FORMATO_CUIT = /^\d{2}-?\d{8}-?\d$/;

/* El CUIT (y el CUIL) se escribe DE CORRIDO: solo números, y los guiones se
   ponen solos mientras se tipea. '30123456789' se ve como '30-12345678-9'.
   Corta en 11 números, que es lo que tiene un CUIT: dos, ocho y uno. Así no
   hace falta acordarse de dónde van los guiones, y un número de más no entra. */
function formatearCuit(valor) {
  const d = String(valor ?? '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 10) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function FormLocal({ local, soloLectura = false, esNuevo = false, onGuardar, onCancelar }) {
  const { rubros } = useDatos();
  const [datos, setDatos] = useState(local);
  const [errores, setErrores] = useState({});

  function cambiar(campo, valor) {
    setDatos((previo) => ({ ...previo, [campo]: valor }));
  }

  function validar() {
    const nuevos = {};
    if (!datos.nombreLocal?.trim()) nuevos.nombreLocal = 'El nombre del local no puede quedar vacío.';
    if (!datos.direccion?.trim()) nuevos.direccion = 'La dirección no puede quedar vacía.';

    // El CUIT es opcional en el alta: el relevador no lo pide en la calle y la
    // oficina lo completa después. Pero si se carga, tiene que estar bien.
    if (datos.cuit?.trim() && !FORMATO_CUIT.test(datos.cuit.trim())) {
      nuevos.cuit = 'El CUIT tiene 11 números. Escribilo de corrido: los guiones se ponen solos.';
    }
    if (datos.email?.trim() && !FORMATO_EMAIL.test(datos.email.trim())) {
      nuevos.email = 'Ese correo no parece válido.';
    }
    return nuevos;
  }

  function enviar(e) {
    e.preventDefault();
    const encontrados = validar();
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return;

    onGuardar({
      ...datos,
      nombreLocal: datos.nombreLocal.trim(),
      razonSocial: (datos.razonSocial ?? '').trim(),
      cuit: (datos.cuit ?? '').trim(),
      direccion: datos.direccion.trim(),
    });
  }


  return (
    <form className="formulario formulario-modal" onSubmit={enviar} noValidate autoComplete="off">
      {/* ---------- Aviso de datos registrales ----------
          No bloquea el guardado: se puede guardar un local incompleto (así
          entra el relevamiento). Lo que no se puede es NOTIFICARLO. */}


      <div className="form-grilla">
        {/* ---------- Identificación ---------- */}
        {!esNuevo && (
          <Campo
            id="campo-id"
            etiqueta="N° de local"
            valor={datos.id}
            onChange={() => {}}
            soloLectura

          />
        )}

        <Campo
          id="campo-nombre"
          etiqueta="Nombre del local"
          valor={datos.nombreLocal}
          onChange={(v) => cambiar('nombreLocal', v)}
          error={errores.nombreLocal}
          soloLectura={soloLectura}
          ancho={2}
        />

        {/* ---------- Datos registrales ---------- */}
        <Campo
          id="campo-razon"
          etiqueta="Razón social"
          valor={datos.razonSocial}
          onChange={(v) => cambiar('razonSocial', v)}
          soloLectura={soloLectura}

        />
        <Campo
          id="campo-cuit"
          etiqueta="CUIT"
          valor={datos.cuit}
          onChange={(v) => cambiar('cuit', formatearCuit(v))}
          error={errores.cuit}
          soloLectura={soloLectura}
          teclado="numeric"
        />
        <CampoSelect
          id="campo-rubro"
          etiqueta="Rubro"
          valor={datos.rubro}
          onChange={(v) => cambiar('rubro', v)}
          opciones={rubros.map((r) => ({ id: r.nombre, etiqueta: r.nombre }))}
          soloLectura={soloLectura}
        />

        {/* ---------- Domicilios ---------- */}
        <Campo
          id="campo-direccion"
          etiqueta="Dirección del local"
          valor={datos.direccion}
          onChange={(v) => cambiar('direccion', v)}
          error={errores.direccion}
          soloLectura={soloLectura}

        />
        <Campo
          id="campo-fiscal"
          etiqueta="Domicilio fiscal"
          valor={datos.domicilioFiscal}
          onChange={(v) => cambiar('domicilioFiscal', v)}
          soloLectura={soloLectura}

        />

        {/* ---------- Contacto ---------- */}
        <Campo
          id="campo-email"
          etiqueta="Correo electrónico"
          tipo="email"
          valor={datos.email}
          onChange={(v) => cambiar('email', v)}
          error={errores.email}
          soloLectura={soloLectura}
        />
        <Campo
          id="campo-telefono"
          etiqueta="Teléfono"
          tipo="tel"
          valor={datos.telefono}
          onChange={(v) => cambiar('telefono', v)}
          soloLectura={soloLectura}
        />

        {/* ---------- Vínculo con el portal ----------
            PENDIENTE con la Dirección Técnica (sección 8.2): cómo se determina
            qué locales corresponden a una persona autenticada en CiDiTuc.
            CiDiTuc identifica personas por CUIL y el padrón identifica locales
            por CUIT del titular, que puede ser una persona jurídica. Mientras
            no se defina, la habilitación se carga a mano acá. */}
        <Campo
          id="campo-cuil"
          etiqueta="CUIL del titular habilitado"
          valor={datos.titularCuil}
          onChange={(v) => cambiar('titularCuil', formatearCuit(v))}
          soloLectura={soloLectura}
          teclado="numeric"
        />

        <CampoTexto
          id="campo-obs"
          etiqueta="Observaciones"
          valor={datos.observaciones}
          onChange={(v) => cambiar('observaciones', v)}
          soloLectura={soloLectura}
          ancho={2}
        />
      </div>

      {/* ---------- Ubicación (informativa, no editable) ---------- */}
      {!esNuevo && (
        <div className="bloque-info">
          <strong>Ubicación en el padrón</strong>
          {datos.latitud !== null && datos.longitud !== null ? (
            <span>
              {datos.latitud}, {datos.longitud} — obtenida geocodificando la dirección declarada.
            </span>
          ) : (
            <span>Sin ubicación. {datos.motivoSinGeo}</span>
          )}
        </div>
      )}

      <div className="form-acciones">
        {!soloLectura && (
          <button type="submit" className="btn-primario">
            {esNuevo ? 'Crear local' : 'Guardar cambios'}
          </button>
        )}
        <button type="button" className={soloLectura ? 'btn-secundario' : 'btn-peligro'} onClick={onCancelar}>
          {soloLectura ? 'Cerrar' : 'Cancelar'}
        </button>
      </div>
    </form>
  );
}

export default FormLocal;
