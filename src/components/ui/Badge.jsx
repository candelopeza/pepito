/* ============================================================================
   ui/Badge.jsx  —  LA PASTILLA DE COLOR
   ----------------------------------------------------------------------------
   Se usa en todas las grillas y en la ficha del local. Tiene dos formas:

     <Badge color="verde">Vigente</Badge>          color a mano
     <BadgeEstado codigo="NOTIF1_PENDIENTE" />     lo saca de la máquina de
                                                   estados: etiqueta Y color

   USÁ SIEMPRE BadgeEstado para el estado de un local. Si el color se elige a
   mano en cada pantalla, el mismo estado termina pintado de dos colores
   distintos en dos grillas, que es lo que pasaba antes.

   COLORES DISPONIBLES (tienen que existir como .badge-<color> en App.css):
     verde · naranja · azul · amarillo · rojo · gris
   ============================================================================ */

import { colorEstado, etiquetaEstado } from '../../dominio/estados';

function Badge({ color = 'gris', children, title }) {
  return (
    <span className={`badge badge-${color}`} title={title}>
      {children}
    </span>
  );
}

export function BadgeEstado({ codigo, title }) {
  if (!codigo) return <Badge color="gris">—</Badge>;
  return (
    <Badge color={colorEstado(codigo)} title={title ?? codigo}>
      {etiquetaEstado(codigo)}
    </Badge>
  );
}

export default Badge;
