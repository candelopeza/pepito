/* ============================================================================
   ui/hab/des.jsx  —  UNA LLAVE SÍ / NO CON TEXTO AL LADO
   ----------------------------------------------------------------------------
   Para habilitar o deshabilitar algo con un toque, sin abrir un formulario.
   La usan las dos pantallas de Accesos: Tipos de usuario (módulo habilitado /
   puede modificar) y Usuarios (activo / de baja).

   Es un checkbox real escondido detrás de la pista: funciona con teclado y el
   lector de pantalla lo anuncia como interruptor. El texto cambia con el
   estado, así se lee sin mirar el color.

   PROPS
     activo         true / false
     onChange       recibe el valor nuevo
     deshabilitado  se ve apagado y no responde
     etiqueta       texto a la derecha (opcional)

   ESTILOS: App.css -> sección 14.11 (ACCESOS)
   ============================================================================ */

function Interruptor({ activo, onChange, deshabilitado = false, etiqueta, id }) {
  return (
    <label className={`interruptor ${deshabilitado ? 'interruptor-deshabilitado' : ''}`}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={Boolean(activo)}
        aria-checked={Boolean(activo)}
        disabled={deshabilitado}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span className="interruptor-pista">
        <span className="interruptor-perilla" />
      </span>
      {etiqueta && <span className="interruptor-texto">{etiqueta}</span>}
    </label>
  );
}

export default Interruptor;
