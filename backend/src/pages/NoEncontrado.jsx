/* ============================================================================
   pages/NoEncontrado.jsx  —  404  (URL: cualquiera que no exista)
   ----------------------------------------------------------------------------
   Antes no había ruta 404: quien entraba a una URL inexistente veía el marco
   de la app con el medio vacío, sin ningún error. Parecía una pantalla rota.
   ============================================================================ */

import { Link, useLocation } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import { Vacio } from '../components/ui/Aviso';

function NoEncontrado() {
  const { pathname } = useLocation();

  return (
    <>
      <PageHeader etiqueta="ERROR" titulo="ESTA PANTALLA NO EXISTE" botonVolver />
      <Vacio titulo={`No hay nada en ${pathname}`}>
        Puede ser un link viejo o una dirección mal escrita. Volvé al <Link to="/">inicio</Link> y buscá el módulo en el menú.
      </Vacio>
    </>
  );
}

export default NoEncontrado;
