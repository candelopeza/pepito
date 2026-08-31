import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';

function Documentacion() {
  return (
    <>
      <PageHeader etiqueta="DOCUMENTACIÓN" titulo="DDJJ, CONTRATOS Y DOCUMENTOS" botonVolver />

      <div className="accesos-header">
        <span>CATEGORÍAS</span>
      </div>

      <div className="grid-accesos">
        <Card titulo="Declaraciones Juradas" />
        <Card titulo="Contratos" />
        <Card titulo="DDJJ de Reciclaje" />
        <Card titulo="Vigentes" />
        <Card titulo="Vencidas" />
        <Card titulo="Pendientes de Revisión" />
      </div>
    </>
  );
}

export default Documentacion;