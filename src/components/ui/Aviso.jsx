/* ============================================================================
   ui/Aviso.jsx  —  CAJAS DE MENSAJE
   ----------------------------------------------------------------------------
   El recuadro de color con un texto adentro. Se usa mucho en este sistema
   porque hay reglas que el usuario TIENE que ver antes de apretar un botón:
   "el plazo no corre hasta la entrega", "esta presentación no suspende nada
   hasta que la apruebes", "faltan datos registrales".

   TIPOS:
     info      azul     ...... explica algo
     ok        verde    ...... salió bien / está habilitado
     alerta    amarillo ...... ojo con esto
     bloqueo   rojo     ...... no se puede avanzar

   <Aviso tipo="bloqueo" titulo="Faltan datos registrales">
     Sin CUIT y razón social la cédula es impugnable.
   </Aviso>

   PROP `accion` (opcional): un <Link> o un <button> que va a la DERECHA del
   aviso, separado del texto. Es el "¿y ahora qué hago?": "Ir a validar", "Ver
   la cola". Va ahí y no colgado al final del párrafo porque un link pegado a
   una explicación se lee como parte de la prosa y se saltea.

   <Aviso tipo="alerta" titulo="3 presentaciones esperando validación"
          accion={<Link to="/validaciones">Ir a validar</Link>} />

   ESTILOS: App.css sección 14.
   ============================================================================ */

function Aviso({ tipo = 'info', titulo, children, icono, accion }) {
  return (
    <div className={`aviso aviso-${tipo}${accion ? ' aviso-con-accion' : ''}`}>
      {icono && <span className="aviso-icono">{icono}</span>}
      <div className="aviso-cuerpo">
        {titulo && <strong className="aviso-titulo">{titulo}</strong>}
        {children && <span className="aviso-texto">{children}</span>}
      </div>
      {accion && <div className="aviso-accion">{accion}</div>}
    </div>
  );
}

/* Estado vacío de una pantalla o de una bandeja. Es distinto de un aviso: no
   informa un problema, dice "acá no hay nada y está bien". */
export function Vacio({ titulo = 'No hay nada por acá', children }) {
  return (
    <div className="vacio">
      <strong>{titulo}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export default Aviso;
