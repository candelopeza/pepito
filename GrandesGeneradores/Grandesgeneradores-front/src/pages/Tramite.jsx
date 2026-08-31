import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';

function Tramite() {
  return (
    <>
      <PageHeader etiqueta="TRÁMITES" titulo="GESTIÓN DE TRÁMITES" botonVolver />

      <div className="accesos-header">
        <span>TIPOS DE TRÁMITE</span>
      </div>

      <div className="grid-accesos">
        <Card titulo="Primera Notificación" />
        <Card titulo="Segunda Notificación" />
        <Card titulo="Revisión de Documentación" />
        <Card titulo="Todos los Trámites" />
      </div>
    </>
  );
}

export default Tramite;