import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';

function Relevamiento() {
  return (
    <>
      <PageHeader etiqueta="RELEVAMIENTOS" titulo="REGISTRO Y CONSULTA DE INSPECCIONES" botonVolver />

      <div className="accesos-header">
        <span>OPCIONES</span>
      </div>

      <div className="grid-accesos">
        <Card titulo="Nuevo Relevamiento" descripcion="Cargar inspección" />
        <Card titulo="Consultar" descripcion="Ver todos los relevamientos" />
        <Card titulo="Filtrar por Inspector" />
        <Card titulo="Gran Generador / Menor" />
      </div>
    </>
  );
}

export default Relevamiento;