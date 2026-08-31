import PageHeader from '../../components/ui/PageHeader';

function Rubro() {
  return (
    <>
      <PageHeader etiqueta="CONFIGURACIÓN" titulo="ADMINISTRACIÓN DE RUBROS" botonVolver />
      <p style={{ marginTop: '20px', color: '#666' }}>
        Acá se cargan y editan los rubros de los establecimientos.
      </p>
    </>
  );
}

export default Rubro;