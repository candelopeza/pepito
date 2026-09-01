/* ============================================================================
   FormLocal.jsx  —  FORMULARIO DE UN LOCAL (ver / editar)
   ----------------------------------------------------------------------------
   Es el contenido que va adentro del modal de pages/Local.jsx.
   El MISMO formulario sirve para las dos cosas, según la prop `soloLectura`:
       soloLectura = true   ->  botón "Ver":    campos bloqueados, sin Guardar
       soloLectura = false  ->  botón "Editar": campos editables, con Guardar

   ESTILOS: App.css -> sección 10 (FORMULARIOS)

   PROPS:
     local       (objeto)   el local a mostrar. No se modifica: se trabaja
                            sobre una copia interna hasta que se guarda.
     soloLectura (bool)     ver arriba
     onGuardar   (función)  recibe el local ya modificado. Solo se llama si
                            pasó la validación.
     onCancelar  (función)  cerrar sin guardar

   ---------------------------------------------------------------------------
   EL ID NO SE PUEDE EDITAR. Se muestra pero está deshabilitado: es la clave
   con la que la tabla identifica la fila. Si se pudiera cambiar, al guardar
   no se encontraría cuál reemplazar.
   ---------------------------------------------------------------------------

   >>> LOS CAMBIOS NO SE GUARDAN EN NINGÚN LADO <<<
   Se guardan en la memoria de la pantalla. Si recargás (F5) vuelve todo como
   estaba. Cuando exista el backend, `onGuardar` en pages/Local.jsx es el
   único lugar que hay que cambiar por la llamada a la API.

   SI HAY PROBLEMA ACÁ:
     - "Falta un rubro / un estado en el desplegable": no es este archivo,
       son las listas de src/config/catalogos.js.
     - "Abro un local, escribo, cancelo, abro otro y aparece lo que escribí":
       no debería pasar. El estado arranca de la prop `local` una sola vez, al
       montarse. Funciona porque el modal se desmonta al cerrarse. Si alguna
       vez se deja montado, hay que agregarle un key={local.id}.
     - "Guardo y no pasa nada": la validación encontró un error. Fijate los
       mensajes rojos debajo de cada campo.
   ============================================================================ */

import { useState } from 'react';
import { RUBROS, ESTADOS_LOCAL } from '../config/catalogos';

// Formato de CUIT que se acepta: 2 dígitos - 8 dígitos - 1 dígito.
// Solo valida la FORMA, no el dígito verificador. Si más adelante hace falta
// verificar que el CUIT sea real, el cálculo va acá.
const FORMATO_CUIT = /^\d{2}-\d{8}-\d$/;

function FormLocal({ local, soloLectura, onGuardar, onCancelar }) {

  // ===== A. COPIA DE TRABAJO =====
  // No se toca la prop `local`: hasta que no se aprieta Guardar, la tabla de
  // atrás sigue mostrando los datos viejos. Así, cancelar no deja rastro.
  const [datos, setDatos] = useState(local);

  // Mensajes de error por campo: { nombre: 'texto', cuit: 'texto', ... }
  // Vacío = no hay errores.
  const [errores, setErrores] = useState({});

  // ===== B. ACTUALIZAR UN CAMPO =====
  function cambiar(campo, valor) {
    setDatos((previo) => ({ ...previo, [campo]: valor }));
  }

  // ===== C. VALIDACIÓN =====
  // Devuelve un objeto con los errores encontrados. Si sale vacío, está bien.
  function validar() {
    const nuevos = {};

    if (!datos.nombre.trim()) {
      nuevos.nombre = 'El nombre no puede quedar vacío.';
    }
    if (!datos.cuit.trim()) {
      nuevos.cuit = 'El CUIT no puede quedar vacío.';
    } else if (!FORMATO_CUIT.test(datos.cuit.trim())) {
      nuevos.cuit = 'El formato tiene que ser 30-12345678-9.';
    }
    if (!datos.direccion.trim()) {
      nuevos.direccion = 'La dirección no puede quedar vacía.';
    }

    // Rubro y estado salen de desplegables, así que no pueden traer un valor
    // inválido. No hace falta validarlos.
    return nuevos;
  }

  // ===== D. ENVIAR =====
  function enviar(e) {
    // Sin esto el navegador recarga la página entera al mandar el formulario.
    e.preventDefault();

    const encontrados = validar();
    setErrores(encontrados);

    // Si hay al menos un error, no se guarda nada.
    if (Object.keys(encontrados).length > 0) return;

    // Se limpian los espacios de más antes de guardar.
    onGuardar({
      ...datos,
      nombre: datos.nombre.trim(),
      cuit: datos.cuit.trim(),
      direccion: datos.direccion.trim(),
    });
  }

  // ===== E. LO QUE SE DIBUJA =====
  return (
    <form className="formulario formulario-modal" onSubmit={enviar} noValidate>

      {/* ---------- ID: se muestra pero nunca se edita ---------- */}
      <div className="form-grupo">
        <label htmlFor="campo-id">N° de local</label>
        <input id="campo-id" type="text" value={datos.id} disabled />
        <span className="form-ayuda">El número no se puede cambiar.</span>
      </div>

      {/* ---------- Nombre ---------- */}
      <div className="form-grupo">
        <label htmlFor="campo-nombre">Nombre</label>
        <input
          id="campo-nombre"
          type="text"
          value={datos.nombre}
          disabled={soloLectura}
          className={errores.nombre ? 'con-error' : ''}
          onChange={(e) => cambiar('nombre', e.target.value)}
        />
        {errores.nombre && <span className="form-error">{errores.nombre}</span>}
      </div>

      {/* ---------- CUIT ---------- */}
      <div className="form-grupo">
        <label htmlFor="campo-cuit">CUIT</label>
        <input
          id="campo-cuit"
          type="text"
          value={datos.cuit}
          disabled={soloLectura}
          placeholder="30-12345678-9"
          className={errores.cuit ? 'con-error' : ''}
          onChange={(e) => cambiar('cuit', e.target.value)}
        />
        {errores.cuit && <span className="form-error">{errores.cuit}</span>}
      </div>

      {/* ---------- Dirección ---------- */}
      <div className="form-grupo">
        <label htmlFor="campo-direccion">Dirección</label>
        <input
          id="campo-direccion"
          type="text"
          value={datos.direccion}
          disabled={soloLectura}
          className={errores.direccion ? 'con-error' : ''}
          onChange={(e) => cambiar('direccion', e.target.value)}
        />
        {errores.direccion && <span className="form-error">{errores.direccion}</span>}
      </div>

      {/* ---------- Rubro: opciones de config/catalogos.js ---------- */}
      <div className="form-grupo">
        <label htmlFor="campo-rubro">Rubro</label>
        <select
          id="campo-rubro"
          value={datos.rubro}
          disabled={soloLectura}
          onChange={(e) => cambiar('rubro', e.target.value)}
        >
          {RUBROS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {/* ---------- Estado: opciones de config/catalogos.js ---------- */}
      <div className="form-grupo">
        <label htmlFor="campo-estado">Estado</label>
        <select
          id="campo-estado"
          value={datos.estado}
          disabled={soloLectura}
          onChange={(e) => cambiar('estado', e.target.value)}
        >
          {ESTADOS_LOCAL.map((es) => (
            <option key={es.id} value={es.id}>{es.id}</option>
          ))}
        </select>
      </div>

      {/* ---------- Botones ----------
          En modo lectura solo hay "Cerrar": no tiene sentido ofrecer Guardar
          si no se puede cambiar nada. */}
      <div className="form-acciones">
        <button type="button" className="btn-secundario" onClick={onCancelar}>
          {soloLectura ? 'Cerrar' : 'Cancelar'}
        </button>
        {!soloLectura && (
          <button type="submit" className="btn-primario">Guardar cambios</button>
        )}
      </div>

    </form>
  );
}

export default FormLocal;
