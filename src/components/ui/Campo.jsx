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

import { useState } from 'react';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';

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

/* Achica la foto en el navegador antes de mandarla: la de un celular pesa
   3-8 MB y por la red móvil, o guardada en la cola sin conexión, eso es
   demasiado. A 1600 px de lado y JPEG al 80 % queda en unos 300 KB y se sigue
   viendo bien el frente del local. */
function achicarImagen(archivo, maximo = 1600, calidad = 0.8) {
  return new Promise((resolver, rechazar) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, maximo / Math.max(img.width, img.height));
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.round(img.width * escala);
      lienzo.height = Math.round(img.height * escala);
      lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
      URL.revokeObjectURL(url);
      resolver(lienzo.toDataURL('image/jpeg', calidad));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rechazar(new Error('No se pudo leer la imagen'));
    };
    img.src = url;
  });
}

/* Foto desde la cámara o la galería del celular. `valor` es la imagen ya
   achicada (data URL); onChange recibe (imagen, nombreDelArchivo). Se usa en
   el relevamiento (foto del local) y en la entrega de cédulas (sección 6.2).

   soloCamara: en el teléfono abre directo la cámara trasera y no deja elegir
   una foto guardada (atributo `capture`, lo respetan Android e iPhone). Así la
   foto es del momento. En la PC no cambia nada: abre el explorador de archivos.

   >>> DOS BOTONES EN EL TELÉFONO: CÁMARA Y GALERÍA (25/11/2026) <<<
   Con un solo <input type="file" accept="image/*">, los Android nuevos abren
   directo el selector de fotos del sistema, que muestra solo la galería: no
   había forma de sacar la foto en el momento. Ahora, en el teléfono (pantalla
   táctil), salen dos botones: "Cámara" (el mismo input con capture, abre la
   cámara trasera) y "Galería" (sin capture, elige una guardada). Las dos
   terminan igual: la foto se achica y se guarda con el relevamiento o la
   entrega, como el archivo de siempre. En la PC queda el input de antes.
   Para volver al input único: FOTO_DOS_BOTONES = false. */
const FOTO_DOS_BOTONES = true;

/* Pantalla táctil = teléfono o tablet, donde tiene sentido ofrecer la cámara.
   En la PC (mouse) los dos botones abrirían el mismo explorador de archivos. */
function esPantallaTactil() {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

export function CampoFoto({ id, etiqueta, valor, onChange, error, ayuda, ancho, soloCamara = false }) {
  const [preparando, setPreparando] = useState(false);
  const [dosBotones] = useState(() => FOTO_DOS_BOTONES && !soloCamara && esPantallaTactil());

  async function elegir(e) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setPreparando(true);
    try {
      onChange(await achicarImagen(archivo), archivo.name);
    } catch {
      onChange('', '');
    } finally {
      setPreparando(false);
    }
  }

  return (
    <Envoltura id={id} etiqueta={etiqueta} error={error} ayuda={preparando ? 'Preparando la foto…' : ayuda} ancho={ancho}>
      {dosBotones ? (
        /* Los inputs quedan invisibles (no display:none: el iPhone no abre un
           input escondido así); cada <label> es el botón que lo abre. */
        <span className="campo-foto-botones">
          <input id={id} type="file" accept="image/*" capture="environment" className="campo-foto-oculto" onChange={elegir} />
          <label htmlFor={id} className={`btn-secundario campo-foto-boton ${error ? 'con-error' : ''}`}>
            <PhotoCameraIcon fontSize="small" /> Cámara
          </label>
          <input id={`${id}-galeria`} type="file" accept="image/*" className="campo-foto-oculto" onChange={elegir} />
          <label htmlFor={`${id}-galeria`} className={`btn-secundario campo-foto-boton ${error ? 'con-error' : ''}`}>
            <PhotoLibraryIcon fontSize="small" /> Galería
          </label>
        </span>
      ) : (
        <input
          id={id}
          type="file"
          accept="image/*"
          capture={soloCamara ? 'environment' : undefined}
          className={error ? 'con-error' : ''}
          onChange={elegir}
        />
      )}
      {valor && (
        <span className="campo-foto-previa">
          <img src={valor} alt="Foto cargada" />
          <button type="button" className="btn-tabla" onClick={() => onChange('', '')}>
            Quitar
          </button>
        </span>
      )}
    </Envoltura>
  );
}

/* Un documento respaldatorio: PDF o imagen (DDJJ, contrato). Las imágenes se
   achican igual que las fotos; los PDF van tal cual, hasta 5 MB. onChange
   recibe (archivoEnBase64, nombre). Lo usa el formulario de documentación. */
const MAXIMO_PDF = 5 * 1024 * 1024;

function leerComoBase64(archivo) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result));
    lector.onerror = () => rechazar(new Error('No se pudo leer el archivo'));
    lector.readAsDataURL(archivo);
  });
}

export function CampoArchivo({ id, etiqueta, valor, nombre, onChange, error, ayuda, ancho }) {
  const [problema, setProblema] = useState(null);
  const [preparando, setPreparando] = useState(false);

  async function elegir(e) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setProblema(null);
    if (archivo.type === 'application/pdf' && archivo.size > MAXIMO_PDF) {
      setProblema('El PDF pesa más de 5 MB. Probá escanearlo en menor calidad.');
      return;
    }
    setPreparando(true);
    try {
      const contenido = archivo.type.startsWith('image/') ? await achicarImagen(archivo) : await leerComoBase64(archivo);
      onChange(contenido, archivo.name);
    } catch {
      setProblema('No se pudo leer el archivo.');
    } finally {
      setPreparando(false);
    }
  }

  return (
    <Envoltura
      id={id}
      etiqueta={etiqueta}
      error={problema ?? error}
      ayuda={preparando ? 'Preparando el archivo…' : ayuda}
      ancho={ancho}
    >
      <input id={id} type="file" accept="application/pdf,image/*" className={error ? 'con-error' : ''} onChange={elegir} />
      {valor && (
        <span className="campo-foto-previa">
          <span>{nombre || 'Archivo adjunto'}</span>
          <button type="button" className="btn-tabla" onClick={() => onChange('', '')}>
            Quitar
          </button>
        </span>
      )}
    </Envoltura>
  );
}

export default Campo;
