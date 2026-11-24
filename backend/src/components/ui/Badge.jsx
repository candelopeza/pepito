/* ============================================================================
   ui/Badge.jsx  —  LA PASTILLA DE COLOR
   ----------------------------------------------------------------------------
   Se usa en todas las grillas y en la ficha del local. Tiene dos formas:

     <Badge color="verde">Vigente</Badge>          color a mano
     <BadgeEstado codigo="NOTIF1_PENDIENTE" />     lo saca de la máquina de
                                                   estados: etiqueta Y color

   EN LAS GRILLAS EL ESTADO VA SIN COLOR (`sinColor`): pedido del área, para
   que las tablas se lean más tranquilas. Los colores siguen en
   dominio/estados.js y se usan donde ayudan a ubicarse de un vistazo: la ficha
   del local, el portal y el mapa (que por la guía va con colores por estado).
   Para volver a pintarlos en una grilla, se saca `sinColor` de esa columna.

   USÁ SIEMPRE BadgeEstado para el estado de un local. Si el color se elige a
   mano en cada pantalla, el mismo estado termina pintado de dos colores
   distintos en dos grillas, que es lo que pasaba antes.

   COLORES DISPONIBLES (tienen que existir como .badge-<color> en App.css):
     verde · naranja · azul · amarillo · rojo · gris · neutro (sin color)
   ============================================================================ */

import { colorEstado, etiquetaEstado } from '../../dominio/estados';

function Badge({ color = 'gris', children, title }) {
  return (
    <span className={`badge badge-${color}`} title={title}>
      {children}
    </span>
  );
}

export function BadgeEstado({ codigo, title, sinColor = false }) {
  if (!codigo) return <Badge color={sinColor ? 'neutro' : 'gris'}>—</Badge>;
  return (
    <Badge color={sinColor ? 'neutro' : colorEstado(codigo)} title={title ?? codigo}>
      {etiquetaEstado(codigo)}
    </Badge>
  );
}

export default Badge;
