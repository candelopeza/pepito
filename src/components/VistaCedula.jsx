/* ============================================================================
   VistaCedula.jsx  —  LA CÉDULA COMO SE VA A IMPRIMIR
   ----------------------------------------------------------------------------
   Toma la plantilla de Configuración → Plantilla de cédula y le reemplaza las
   variables con los datos del local y de la notificación.

   POR QUÉ IMPORTA QUE ESTO EXISTA (sección 9.6): "la cédula generada debe
   poder abrirse y consultarse desde la ficha del local, no solamente desde el
   lote de emisión". Hoy el sistema emite en automático y nadie mira el
   documento hasta que se imprime; si un dato salió mal, ya se materializó en
   un acto administrativo.

   AL IMPRIMIR SE REGISTRA QUIÉN Y CUÁNDO. Es un requisito válido para
   cualquiera de las dos alternativas de emisión que están en evaluación:
   permite saber qué queda pendiente de imprimir sin depender de la memoria de
   quien lo hizo, y evita tanto la duplicación como el olvido.

   MAQUETA: acá se muestra el texto en pantalla y se manda a la impresora del
   navegador. El PDF de verdad lo genera el backend a partir de la misma
   plantilla, así lo que se ve acá y lo que sale impreso no pueden diferir.
   ============================================================================ */

import Modal from './ui/Modal';
import { useDatos } from '../datos/datosContexto';
import { useRol } from '../auth/rolContexto';
import { fmtFechaHora } from '../dominio/fechas';
import { textoDeCedula } from '../dominio/textoCedula';
import { descargarPdf, imprimirPdf, nombreCedula, pdfCedulas, quienGenera } from './pdfCedulas';

/* La cédula sale en PDF (components/pdfCedulas.js): igual en cualquier
   navegador y con la constancia de notificación. En false vuelve a imprimirse
   desde el navegador, como antes. */
const IMPRESION_EN_PDF = true;

/* soloLectura: se puede ver pero no imprimir (el titular, desde su portal:
   imprimirla marcaría como impresa una cédula que la oficina todavía no
   imprimió). */
function VistaCedula({ abierto, cedula, local, onCerrar, soloLectura = false }) {
  const { plantillaCedula, marcarImpresa, capacidades, usuarios } = useDatos();
  const { rol, usuario } = useRol();
  // Sin las columnas de sql/04 se imprime igual, pero no queda constancia.
  const registraImpresion = Boolean(capacidades?.impresion);
  if (!abierto || !cedula) return null;

  /* Quién imprime: la oficina, y el agente de campo la cédula que le
     asignaron. Imprimir deja constancia de quién y cuándo: Dirección (lectura
     total) o un relevador que solo la mira no tienen que figurar ahí. */
  const imprime =
    !soloLectura &&
    (['administrativo', 'coordinacion', 'administrador', 'notificador'].includes(rol) ||
      (rol === 'relevador' && Boolean(usuario?.id) && cedula.notificadorId === usuario.id));

  const { texto, faltantes } = textoDeCedula(plantillaCedula, cedula, local);

  function imprimir() {
    if (registraImpresion) marcarImpresa(cedula.id);
    window.print();
  }

  // Lo que necesita el PDF. El notificador asignado sale impreso en la constancia.
  const paraPdf = () => [
    {
      cedula,
      local,
      notificador: cedula.notificador?.nombre ?? usuarios.find((u) => u.id === cedula.notificadorId)?.nombre ?? null,
    },
  ];
  // Imprimir o descargar para imprimir deja la constancia (solo quien imprime).
  const registrar = () => {
    if (imprime && registraImpresion) marcarImpresa(cedula.id);
  };
  function imprimirEnPdf() {
    imprimirPdf(
      () => pdfCedulas(paraPdf(), plantillaCedula, { generadoPor: quienGenera(usuario) }),
      nombreCedula(cedula),
    );
    registrar();
  }
  async function descargarEnPdf() {
    descargarPdf(
      await pdfCedulas(paraPdf(), plantillaCedula, { generadoPor: quienGenera(usuario) }),
      nombreCedula(cedula),
    );
    registrar();
  }
  const sinDatos = faltantes > 0 ? 'Faltan datos: corregí el local y regenerá la cédula' : undefined;

  return (
    <Modal
      abierto={abierto}
      etiqueta="CÉDULA DE NOTIFICACIÓN"
      titulo={cedula.numeroCedula}
      ancho="ancho"
      onCerrar={onCerrar}
    >
      {faltantes > 0 && (
        <div className="aviso aviso-bloqueo">
          <div className="aviso-cuerpo">
            <strong className="aviso-titulo">Hay {faltantes} dato(s) sin completar</strong>
            <span className="aviso-texto">
              No imprimas esta cédula: corregí los datos del local y usá "Regenerar cédula". Una notificación que no
              individualiza bien al sujeto obligado es impugnable.
            </span>
          </div>
        </div>
      )}

      {/* El bloque imprimible. La clase .solo-impresion de App.css hace que al
          imprimir salga solo esto y no la app entera. */}
      <pre className="cedula-papel solo-impresion">{texto}</pre>

      {registraImpresion && (
        <div className="bloque-info">
          <strong>Constancia de impresión</strong>
          {cedula.impresaEn ? (
            <span>
              Impresa por {cedula.impresaPor} el {fmtFechaHora(cedula.impresaEn)}.
            </span>
          ) : (
            <span>Todavía no se imprimió.</span>
          )}
        </div>
      )}

      <div className="form-acciones">
        {IMPRESION_EN_PDF ? (
          <>
            {imprime && (
              <button
                type="button"
                className="btn-primario"
                onClick={imprimirEnPdf}
                disabled={faltantes > 0}
                title={sinDatos}
              >
                {!registraImpresion ? 'Imprimir' : cedula.impresaEn ? 'Imprimir de nuevo' : 'Imprimir y registrar'}
              </button>
            )}
            <button
              type="button"
              className="btn-secundario"
              onClick={descargarEnPdf}
              disabled={faltantes > 0}
              title={sinDatos}
            >
              Descargar PDF
            </button>
          </>
        ) : (
          imprime && (
            <button type="button" className="btn-primario" onClick={imprimir}>
              {!registraImpresion ? 'Imprimir' : cedula.impresaEn ? 'Imprimir de nuevo' : 'Imprimir y registrar'}
            </button>
          )
        )}
        <button type="button" className="btn-secundario" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}

export default VistaCedula;
