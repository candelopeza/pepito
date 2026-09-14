/* ============================================================================
   pages/config/Plantilla.jsx  —  PLANTILLA DE LA CÉDULA
   (URL: /#/config/plantilla)
   ----------------------------------------------------------------------------
   Sección 6.4: "El sistema genera la cédula en PDF a partir de una plantilla
   EDITABLE POR EL ÁREA, completando los datos del local y el número
   correlativo."

   El texto de una cédula de notificación cambia: cambia una ordenanza, cambia
   la redacción que sugiere el área legal, cambia el nombre de la Secretaría.
   Nada de eso puede requerir un desarrollo.

   CÓMO FUNCIONA: lo que va entre llaves se reemplaza con el dato real al
   generar. Si una variable no existe o el dato está vacío, la vista previa
   muestra «falta ...» en su lugar — a propósito: un campo vacío en una cédula
   es un acto impugnable, y es mejor verlo antes de imprimir que después de
   entregar.
   ============================================================================ */

import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import Aviso from '../../components/ui/Aviso';
import { useDatos } from '../../datos/datosContexto';
import { fmtFecha, hoyISO } from '../../dominio/fechas';

/* Las variables disponibles. Si se agrega una, hay que agregarla también en
   components/VistaCedula.jsx, que es quien las reemplaza de verdad. */
const VARIABLES = [
  { clave: 'numeroCedula', que: 'Número correlativo de la cédula' },
  { clave: 'instanciaTexto', que: 'PRIMERA INTIMACIÓN o SEGUNDA INTIMACIÓN' },
  { clave: 'nombreLocal', que: 'Nombre del establecimiento' },
  { clave: 'razonSocial', que: 'Razón social del titular' },
  { clave: 'cuit', que: 'CUIT del titular' },
  { clave: 'direccion', que: 'Domicilio del local' },
  { clave: 'rubro', que: 'Rubro del establecimiento' },
  { clave: 'plazoDias', que: 'Días hábiles del plazo (5 o 3, según la instancia)' },
  { clave: 'fechaEmision', que: 'Fecha de emisión de la cédula' },
];

const EJEMPLO = {
  numeroCedula: 'CED-001299',
  instanciaTexto: 'PRIMERA INTIMACIÓN',
  nombreLocal: 'Supermercado Norte',
  razonSocial: 'Distribuidora Norte S.A.',
  cuit: '30-12345678-9',
  direccion: 'Av. Alem 1230',
  rubro: 'Supermercado',
  plazoDias: 5,
  fechaEmision: fmtFecha(hoyISO()),
};

function Plantilla() {
  const { plantillaCedula, guardarPlantilla } = useDatos();
  const [texto, setTexto] = useState(plantillaCedula);
  const [guardado, setGuardado] = useState(false);

  const previa = texto.replace(/\{(\w+)\}/g, (_, clave) => {
    const v = EJEMPLO[clave];
    return v === undefined ? `«no existe la variable ${clave}»` : String(v);
  });

  const inexistentes = [...texto.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .filter((c) => EJEMPLO[c] === undefined);

  return (
    <>
      <PageHeader etiqueta="CONFIGURACIÓN" titulo="PLANTILLA DE LA CÉDULA" botonVolver />
      {inexistentes.length > 0 && (
        <Aviso tipo="bloqueo" titulo="Hay variables que no existen">
          {inexistentes.map((c) => `{${c}}`).join(', ')}. Van a salir así en la cédula impresa. Revisá la lista de variables
          disponibles.
        </Aviso>
      )}

      <div className="plantilla-columnas">
        {/* ---------- El editor ---------- */}
        <div>
          <div className="accesos-header">
            <span>Texto de la plantilla</span>
          </div>
          <textarea
            className="textarea-formulario textarea-plantilla"
            rows={26}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setGuardado(false);
            }}
          />
          <div className="form-acciones">
            <button
              type="button"
              className="btn-primario"
              onClick={() => {
                guardarPlantilla(texto);
                setGuardado(true);
              }}
            >
              Guardar plantilla
            </button>
            <button type="button" className="btn-secundario" onClick={() => setTexto(plantillaCedula)}>
              Descartar cambios
            </button>
            {guardado && <span className="texto-ok">Guardada.</span>}
          </div>
        </div>

        {/* ---------- La vista previa ---------- */}
        <div>
          <div className="accesos-header">
            <span>Vista previa con datos de ejemplo</span>
          </div>
          <pre className="cedula-papel">{previa}</pre>
        </div>
      </div>

      {/* ---------- Variables disponibles ---------- */}
      <div className="accesos-header">
        <span>Variables disponibles</span>
      </div>
      <table className="tabla-datos">
        <thead>
          <tr>
            <th>Escribí esto</th>
            <th>Y se reemplaza por</th>
          </tr>
        </thead>
        <tbody>
          {VARIABLES.map((v) => (
            <tr key={v.clave}>
              <td>
                <code>{`{${v.clave}}`}</code>
              </td>
              <td>{v.que}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export default Plantilla;
