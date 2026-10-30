/* ============================================================================
   ConstanciaArca.jsx  —  BOTÓN A LA CONSTANCIA DE INSCRIPCIÓN DE ARCA
   ----------------------------------------------------------------------------
   Para que coordinación controle en ARCA (ex AFIP) los datos del titular al
   revisar la documentación. Abre la consulta pública de constancias en otra
   pestaña y copia el CUIT: esa página pide el CUIT y un captcha, así que no
   se puede abrir con el CUIT ya cargado; se pega con Ctrl+V.

   Lo usan la bandeja de validación y la ficha del local. Lo ve solo el rol de
   ROLES_CONSTANCIA_ARCA (src/dominio/reglas.js) y el administrador.

   PROPS
     cuit   el CUIT del local, con o sin guiones
   ============================================================================ */

import { useState } from 'react';
import { useRol } from '../auth/rolContexto';
import { ROLES_CONSTANCIA_ARCA, URL_CONSTANCIA_ARCA } from '../dominio/reglas';

/* Sin HTTPS el navegador no da el portapapeles moderno (navigator.clipboard):
   ahí se copia a la antigua, con un cuadro de texto escondido. */
function copiar(texto) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(texto);
  const area = document.createElement('textarea');
  area.value = texto;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  return ok ? Promise.resolve() : Promise.reject(new Error('No se pudo copiar'));
}

function ConstanciaArca({ cuit }) {
  const { rol } = useRol();
  const [copiado, setCopiado] = useState(false);
  const digitos = String(cuit ?? '').replace(/\D/g, '');

  if (rol !== 'administrador' && !ROLES_CONSTANCIA_ARCA.includes(rol)) return null;

  return (
    <a
      href={URL_CONSTANCIA_ARCA}
      target="_blank"
      rel="noreferrer"
      // Chico: en la bandeja va como tercera línea de la celda y la fila tiene alto fijo.
      className="btn-tabla btn-chico"
      style={{ textDecoration: 'none', display: 'inline-block' }}
      title={digitos ? 'Abre ARCA en otra pestaña con el CUIT copiado: pegalo con Ctrl+V' : 'Abre ARCA en otra pestaña'}
      onClick={() => {
        if (!digitos) return;
        // Si no se puede copiar, ARCA se abre igual: el CUIT está a la vista.
        copiar(digitos).then(
          () => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 3000);
          },
          () => {},
        );
      }}
    >
      {copiado ? 'CUIT copiado' : 'Constancia ARCA'}
    </a>
  );
}

export default ConstanciaArca;
