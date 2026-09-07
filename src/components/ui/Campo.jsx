/* ============================================================================
   ui/Campo.jsx  —  LOS CAMPOS DE FORMULARIO
   ----------------------------------------------------------------------------
   Un campo = etiqueta + control + (error | ayuda). Estaba escrito a mano en
   cada formulario, con el <label>, el <input>, el className del error y el
   <span> del mensaje repetidos quince veces. Acá va una sola vez.

   TRES VARIANTES:
     <Campo />        input de texto, fecha, número o email
     <CampoSelect />  desplegable
     <CampoTexto />   textarea (observaciones, motivos)

   >>> POR QUÉ LOS INPUTS LLEVAN placeholder=" " (UN ESPACIO) <<<
   No es un descuido. Dentro de un modal la etiqueta arranca ADENTRO del
   recuadro y sube achicándose cuando el campo toma foco o ya tiene algo
   escrito. Ese "ya tiene algo escrito" el CSS lo detecta con
   :placeholder-shown, que solo funciona si el input TIENE placeholder.
   Si lo sacás, las etiquetas dejan de subir. Ver App.css sección 12.
   El ejemplo de formato va en `ayuda`, debajo del campo, no en el placeholder.

   PROPS
     id, etiqueta, valor, onChange (recibe el valor pelado, no el evento)
     tipo         'text' | 'date' | 'number' | 'email' | 'tel'
     error        texto del error. Si viene, reemplaza a la ayuda.
     ayuda        aclaración chica debajo
     soloLectura  deshabilita el control
     teclado      inputMode: 'numeric' abre el teclado numérico en el celular.
                  Va con tipo="text" cuando el dato es dígitos pero no un
                  número (no queremos flechitas ni notación científica).
     largoMaximo  maxLength del input
     opciones     solo CampoSelect: [{ id, etiqueta }] o array de textos
   ============================================================================ */

function Envoltura({ id, etiqueta, error, ayuda, children, ancho }) {
  return (
    <div className="form-grupo" style={ancho ? { gridColumn: `span ${ancho}` } : undefined}>
      <label htmlFor={id}>{etiqueta}</label>
      {children}
      {error ? (
        <span className="form-error">{error}</span>
      ) : (
        ayuda && <span className="form-ayuda">{ayuda}</span>
      )}
    </div>
  );
}

function Campo({ id, etiqueta, valor, onChange, tipo = 'text', error, ayuda, soloLectura, ancho, min, max, requerido, teclado, largoMaximo }) {
  return (
    <Envoltura id={id} etiqueta={etiqueta} error={error} ayuda={ayuda} ancho={ancho}>
      <input
        id={id}
        type={tipo}
        // Sin esto, después de guardar una vez el navegador ofrece los valores
        // del formulario anterior y el alta de un local nuevo aparece con
        // datos de otro. No es un bug del código: es el autocompletado.
        autoComplete="off"
        placeholder=" "
        value={valor ?? ''}
        min={min}
        max={max}
        inputMode={teclado}
        maxLength={largoMaximo}
        required={requerido}
        disabled={soloLectura}
        className={error ? 'con-error' : ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </Envoltura>
  );
}

export function CampoSelect({ id, etiqueta, valor, onChange, opciones = [], error, ayuda, soloLectura, ancho, vacio = 'Seleccionar...' }) {
  // Acepta tanto ['Uno','Dos'] como [{ id, etiqueta }]: los catálogos del
  // dominio usan la segunda forma, las listas simples la primera.
  const normalizadas = opciones.map((o) => (typeof o === 'object' ? o : { id: o, etiqueta: o }));

  return (
    <Envoltura id={id} etiqueta={etiqueta} error={error} ayuda={ayuda} ancho={ancho}>
      <select
        id={id}
        value={valor ?? ''}
        disabled={soloLectura}
        className={error ? 'con-error' : ''}
        onChange={(e) => onChange(e.target.value)}
      >
        {vacio !== null && <option value="">{vacio}</option>}
        {normalizadas.map((o) => (
          <option key={o.id} value={o.id}>
            {o.etiqueta}
          </option>
        ))}
      </select>
    </Envoltura>
  );
}

export function CampoTexto({ id, etiqueta, valor, onChange, error, ayuda, soloLectura, ancho, filas = 3 }) {
  return (
    <Envoltura id={id} etiqueta={etiqueta} error={error} ayuda={ayuda} ancho={ancho}>
      <textarea
        id={id}
        className={`textarea-formulario ${error ? 'con-error' : ''}`}
        rows={filas}
        value={valor ?? ''}
        disabled={soloLectura}
        onChange={(e) => onChange(e.target.value)}
      />
    </Envoltura>
  );
}

/* Dato de solo lectura, para las fichas. No es un input: es texto. */
export function Dato({ etiqueta, children, ancho }) {
  return (
    <div className="dato" style={ancho ? { gridColumn: `span ${ancho}` } : undefined}>
      <span className="dato-etiqueta">{etiqueta}</span>
      <span className="dato-valor">{children ?? '—'}</span>
    </div>
  );
}

export default Campo;
