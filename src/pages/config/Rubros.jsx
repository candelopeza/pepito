/* ============================================================================
   pages/config/Rubros.jsx  —  CATÁLOGO DE RUBROS  (URL: /#/config/rubros)
   ----------------------------------------------------------------------------
   >>> POR QUÉ EL RUBRO ES UNA TABLA Y NO UNA LISTA EN EL CÓDIGO <<<
   En el sistema viejo es una lista desplegable definida dentro de la interfaz
   (columna K del padrón, texto libre proveniente de un desplegable de
   AppSheet). El pliego pide que sea una tabla administrable (sección 5.2):
   agregar un rubro no puede requerir a un programador.

   Además el rubro es un DATO REGISTRAL: junto con el CUIT y la razón social,
   es uno de los tres que la cédula necesita para individualizar al sujeto
   obligado. No es una etiqueta decorativa.

   La columna "En uso" cuenta cuántos locales tienen ese rubro. Sirve para no
   borrar uno que está en uso y quedarse con veinte locales apuntando a un
   valor que ya no existe en el desplegable.
   ============================================================================ */

import PageHeader from '../../components/ui/PageHeader';
import CrudCatalogo from '../../components/CrudCatalogo';
import { useDatos } from '../../datos/datosContexto';

const CAMPOS = [{ id: 'nombre', etiqueta: 'Nombre del rubro', requerido: true }];

function Rubros() {
  const { locales } = useDatos();

  return (
    <>
      <PageHeader etiqueta="CONFIGURACIÓN" titulo="RUBROS DE LOS ESTABLECIMIENTOS" botonVolver />

      <CrudCatalogo
        clave="rubros"
        titulo="rubro"
        campos={CAMPOS}
        columnas={['nombre']}
        enUso={(r) => locales.filter((l) => l.rubro === r.nombre).length}
        orden={(a, b) => a.nombre.localeCompare(b.nombre)}
      />
    </>
  );
}

export default Rubros;
