import PageHeader from '../../components/ui/PageHeader';

function Sede() {
  return (
    <>
      <PageHeader etiqueta="CONFIGURACIÓN" titulo="ADMINISTRACIÓN DE SEDES" botonVolver />
      <p style={{ marginTop: '20px', color: '#666' }}>
        Acá se cargan y editan las sedes del sistema.
      </p>
    </>
  );
}

export default Sede;