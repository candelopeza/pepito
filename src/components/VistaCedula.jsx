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
import { fmtFecha, fmtFechaHora } from '../dominio/fechas';

/* Reemplaza {variable} por su valor. Si falta un dato deja el hueco marcado,
   así se ve en la vista previa antes de imprimir: un campo vacío en una cédula
   es un acto impugnable. */
function completar(plantilla, valores) {
  return plantilla.replace(/\{(\w+)\}/g, (_, clave) => {
    const v = valores[clave];
    return v === undefined || v === null || v === '' ? `«falta ${clave}»` : String(v);
  });
}

function VistaCedula({ abierto, cedula, local, onCerrar }) {
  const { plantillaCedula, marcarImpresa } = useDatos();
  if (!abierto || !cedula) return null;

  const texto = completar(plantillaCedula, {
    numeroCedula: cedula.numeroCedula,
    instanciaTexto: cedula.instancia === 1 ? 'PRIMERA INTIMACIÓN' : 'SEGUNDA INTIMACIÓN',
    nombreLocal: local?.nombreLocal,
    razonSocial: local?.razonSocial,
    cuit: local?.cuit,
    direccion: local?.direccion,
    rubro: local?.rubro,
    plazoDias: cedula.plazoDias,
    fechaEmision: fmtFecha(cedula.fecha),
  });

  const faltantes = (texto.match(/«falta \w+»/g) ?? []).length;

  function imprimir() {
    marcarImpresa(cedula.id);
    window.print();
  }

  return (
    <Modal abierto={abierto} etiqueta="CÉDULA DE NOTIFICACIÓN" titulo={cedula.numeroCedula} ancho="ancho" onCerrar={onCerrar}>
      {faltantes > 0 && (
        <div className="aviso aviso-bloqueo">
          <div className="aviso-cuerpo">
            <strong className="aviso-titulo">Hay {faltantes} dato(s) sin completar</strong>
            <span className="aviso-texto">
              No imprimas esta cédula: corregí los datos del local y usá "Regenerar cédula". Una notificación que no individualiza
              bien al sujeto obligado es impugnable.
            </span>
          </div>
        </div>
      )}

      {/* El bloque imprimible. La clase .solo-impresion de App.css hace que al
          imprimir salga solo esto y no la app entera. */}
      <pre className="cedula-papel solo-impresion">{texto}</pre>

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

      <div className="form-acciones">
        <button type="button" className="btn-primario" onClick={imprimir}>
          {cedula.impresaEn ? 'Imprimir de nuevo' : 'Imprimir y registrar'}
        </button>
        <button type="button" className="btn-secundario" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}

export default VistaCedula;
