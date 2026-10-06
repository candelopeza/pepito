/* ============================================================================
   pages/config/Feriados.jsx  —  CALENDARIO  (URL: /#/config/feriados)
   ----------------------------------------------------------------------------
   >>> ESTA TABLA ES UN REQUERIMIENTO, NO UNA COMODIDAD (sección 4.1) <<<

   [NO PORTAR] El sistema viejo excluye del cómputo únicamente sábados y
   domingos: no contempla feriados de ningún tipo. Eso significa que HOY los
   plazos pueden estar venciendo antes de lo que corresponde legalmente, y una
   intimación con el plazo mal computado es impugnable.

   El calendario tiene que contemplar los tres alcances, porque los tres
   suspenden plazos: feriados nacionales, provinciales de Tucumán y asuetos
   municipales. Por eso es administrable por el propio organismo: los asuetos
   municipales se anuncian con pocos días de aviso y no puede depender de un
   desarrollo.

   >>> PENDIENTE DE CONFIRMAR CON EL ÁREA LEGAL (Anexo B.2) <<<
   Dos cosas que el pliego deja abiertas y que cambian el resultado del
   cómputo:
     1. QUÉ CALENDARIO APLICA EXACTAMENTE. Los tres alcances es lo razonable,
        pero hay que confirmarlo.
     2. SI EL DÍA DE LA ENTREGA CUENTA COMO DÍA UNO o el plazo empieza a correr
        al día siguiente. Está como parámetro en Configuración → Parámetros.
   ============================================================================ */

import PageHeader from '../../components/ui/PageHeader';
import Badge from '../../components/ui/Badge';
import CrudCatalogo from '../../components/CrudCatalogo';
import { useDatos } from '../../datos/datosContexto';
import { ALCANCES_FERIADO } from '../../config/catalogos';
import { fmtFecha, hoyISO, vencimientoHabil } from '../../dominio/fechas';

const COLOR_ALCANCE = { nacional: 'azul', provincial: 'verde', municipal: 'naranja' };

const CAMPOS = [
  { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, render: (f) => fmtFecha(f.fecha) },
  { id: 'motivo', etiqueta: 'Motivo', requerido: true },
  {
    id: 'alcance',
    etiqueta: 'Alcance',
    tipo: 'select',
    opciones: ALCANCES_FERIADO,
    pordefecto: 'nacional',
    vacio: null,
    ayuda: 'Los tres alcances suspenden plazos: un asueto municipal también cuenta.',
    render: (f) => <Badge color={COLOR_ALCANCE[f.alcance] ?? 'gris'}>{f.alcance}</Badge>,
  },
];

function Feriados() {
  const { feriados, parametros } = useDatos();

  const proximos = [...feriados].filter((f) => f.fecha >= hoyISO()).sort((a, b) => a.fecha.localeCompare(b.fecha));

  /* Ejemplo en vivo: qué pasaría hoy con una cédula entregada. Es la forma más
     directa de que alguien vea si el calendario está bien cargado. */
  const ejemplo1 = vencimientoHabil(hoyISO(), parametros.plazoNotif1, feriados, parametros.contarDiaEntrega);
  const ejemplo2 = vencimientoHabil(hoyISO(), parametros.plazoNotif2, feriados, parametros.contarDiaEntrega);

  return (
    <>
      <PageHeader
        etiqueta="CONFIGURACIÓN"
        titulo="CALENDARIO DE FERIADOS"
        subtitulo={`${feriados.length} fecha(s) cargadas · ${proximos.length} por venir`}
        botonVolver
      />
      <div className="bloque-info">
        <strong>Verificación en vivo</strong>
        <span>
          Una cédula entregada hoy ({fmtFecha(hoyISO())}) vencería: primera notificación ({parametros.plazoNotif1} días hábiles) el{' '}
          <strong>{fmtFecha(ejemplo1)}</strong> · segunda notificación ({parametros.plazoNotif2} días hábiles) el{' '}
          <strong>{fmtFecha(ejemplo2)}</strong>.
        </span>
        <span>
          El día de la entrega {parametros.contarDiaEntrega ? 'SÍ cuenta' : 'NO cuenta'} como día uno (parámetro pendiente de
          confirmación con el área legal).
        </span>
      </div>

      <CrudCatalogo
        clave="feriados"
        titulo="feriado"
        campos={CAMPOS}
        columnas={['fecha', 'motivo', 'alcance']}
        orden={(a, b) => a.fecha.localeCompare(b.fecha)}
      />
    </>
  );
}

export default Feriados;
