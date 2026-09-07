/* ============================================================================
   pages/herramientas/Duplicados.jsx  —  (URL: /#/herramientas/duplicados)
   ----------------------------------------------------------------------------
   Sección 9.4 del pliego. El padrón acumula establecimientos cargados más de
   una vez con identificadores distintos, y sus actuaciones quedan repartidas
   entre los dos registros: el local aparece con menos historial del que tiene,
   y se lo puede intimar dos veces por lo mismo.

   >>> SIEMPRE CON CONFIRMACIÓN HUMANA <<<
   El sistema PROPONE, una persona decide. La detección es por similitud
   (dominio/duplicados.js) y la similitud se equivoca: "Farmacia Central" y
   "Farmacia Centro" pueden ser dos locales distintos a tres cuadras.

   >>> QUEDA CONSTANCIA DE LA FUSIÓN <<<
   Se registra qué ids se unificaron y con qué id legacy, porque después hay
   que poder rastrear una actuación histórica hasta el registro donde se cargó.
   Sin eso, un expediente que referencia el id viejo queda huérfano.

   QUÉ HACE LA FUSIÓN: pasa las actuaciones y los relevamientos del duplicado
   al principal, completa los datos que el principal no tenga, y elimina el
   duplicado. No se pierde información: es lo que la diferencia de borrar el
   registro a mano desde el padrón.
   ============================================================================ */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Badge, { BadgeEstado } from '../../components/ui/Badge';
import Aviso, { Vacio } from '../../components/ui/Aviso';
import Confirmar from '../../components/ui/Confirmar';
import { useDatos } from '../../datos/datosContexto';
import { buscarDuplicados } from '../../dominio/duplicados';
import { fmtFechaHora } from '../../dominio/fechas';

const COLOR_NIVEL = { alta: 'rojo', media: 'naranja', baja: 'amarillo' };

function Duplicados() {
  const { localesConEstado, fusiones, fusionarLocales } = useDatos();
  const [aFusionar, setAFusionar] = useState(null);
  const [invertido, setInvertido] = useState(false);

  const pares = useMemo(() => buscarDuplicados(localesConEstado), [localesConEstado]);

  /* Cuál de los dos se conserva. Por defecto el que tiene más historial: es el
     que probablemente esté referenciado en expedientes ya iniciados. */
  const decidir = (par) => {
    const [principal, duplicado] =
      par.principal.cantidadActuaciones >= par.duplicado.cantidadActuaciones
        ? [par.principal, par.duplicado]
        : [par.duplicado, par.principal];
    return invertido ? [duplicado, principal] : [principal, duplicado];
  };

  return (
    <>
      <PageHeader
        etiqueta="HERRAMIENTAS"
        titulo="DETECCIÓN DE DUPLICADOS"
        subtitulo={`${pares.length} par(es) candidatos · ${fusiones.length} fusión(es) realizadas`}
        botonVolver
      />

      <Aviso tipo="info" titulo="El sistema propone, vos decidís">
        Coincidencia <Badge color="rojo">alta</Badge> = mismo CUIT normalizado. <Badge color="naranja">Media</Badge> = nombre
        parecido y misma dirección. <Badge color="amarillo">Baja</Badge> = solo el nombre se parece; revisala con cuidado, puede
        ser un local distinto.
      </Aviso>

      {pares.length === 0 ? (
        <Vacio titulo="No se detectaron duplicados">
          Se comparan CUIT normalizado, nombre comercial y calle con altura. Si sabés de un duplicado que no aparece, avisá qué
          criterio lo detectaría.
        </Vacio>
      ) : (
        pares.map((par) => {
          const [principal, duplicado] = decidir(par);
          return (
            <div key={par.id} className="par-duplicado">
              <div className="par-cabecera">
                <Badge color={COLOR_NIVEL[par.nivel]}>Coincidencia {par.nivel}</Badge>
                <span>{par.motivo}</span>
                <span className="texto-gris">Nombres {par.parecido}% similares</span>
              </div>

              <div className="par-cuerpo">
                {/* El que se conserva */}
                <div className="par-lado par-lado-conserva">
                  <span className="par-rol">SE CONSERVA</span>
                  <Link to={`/locales/${principal.id}`} className="link-local">
                    {principal.nombreLocal}
                  </Link>
                  <span>{principal.razonSocial || 'sin razón social'}</span>
                  <span>CUIT {principal.cuit || '—'}</span>
                  <span>{principal.direccion}</span>
                  <BadgeEstado codigo={principal.estado} />
                  <span className="texto-chico">
                    N° {principal.id}
                    {principal.idLegacy ? ` · ${principal.idLegacy}` : ''} · {principal.cantidadActuaciones} actuación(es)
                  </span>
                </div>

                <div className="par-flecha">←</div>

                {/* El que se absorbe */}
                <div className="par-lado par-lado-absorbe">
                  <span className="par-rol">SE UNIFICA Y SE ELIMINA</span>
                  <Link to={`/locales/${duplicado.id}`} className="link-local">
                    {duplicado.nombreLocal}
                  </Link>
                  <span>{duplicado.razonSocial || 'sin razón social'}</span>
                  <span>CUIT {duplicado.cuit || '—'}</span>
                  <span>{duplicado.direccion}</span>
                  <BadgeEstado codigo={duplicado.estado} />
                  <span className="texto-chico">
                    N° {duplicado.id}
                    {duplicado.idLegacy ? ` · ${duplicado.idLegacy}` : ''} · {duplicado.cantidadActuaciones} actuación(es)
                  </span>
                </div>
              </div>

              <div className="par-acciones">
                <button type="button" className="btn-primario" onClick={() => setAFusionar({ principal, duplicado })}>
                  Unificar
                </button>
                <button type="button" className="btn-secundario" onClick={() => setInvertido((v) => !v)}>
                  Cambiar cuál se conserva
                </button>
              </div>
            </div>
          );
        })
      )}

      {/* ---------- Constancia de las fusiones ---------- */}
      {fusiones.length > 0 && (
        <>
          <div className="accesos-header">
            <span>Fusiones registradas</span>
          </div>
          <table className="tabla-datos">
            <thead>
              <tr>
                <th>Momento</th>
                <th>Se conservó</th>
                <th>Se unificó</th>
                <th>Id legacy del eliminado</th>
                <th>Quién</th>
              </tr>
            </thead>
            <tbody>
              {[...fusiones].reverse().map((f) => (
                <tr key={f.id}>
                  <td>{fmtFechaHora(f.momento)}</td>
                  <td>
                    <Link to={`/locales/${f.idPrincipal}`} className="link-local">
                      N° {f.idPrincipal}
                    </Link>
                  </td>
                  <td>
                    N° {f.idDuplicado} — {f.nombreDuplicado}
                  </td>
                  {/* Este dato es el que permite rastrear una actuación
                      histórica: los expedientes ya iniciados referencian el id
                      del sistema anterior. */}
                  <td>{f.idLegacyDuplicado ?? '—'}</td>
                  <td>{f.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <Confirmar
        abierto={Boolean(aFusionar)}
        titulo="Unificar los dos registros"
        textoConfirmar="Unificar"
        peligro
        onCancelar={() => setAFusionar(null)}
        onConfirmar={() => {
          fusionarLocales(aFusionar.principal.id, aFusionar.duplicado.id);
          setAFusionar(null);
        }}
      >
        <p>
          Las {aFusionar?.duplicado.cantidadActuaciones} actuación(es) y los relevamientos de{' '}
          <strong>{aFusionar?.duplicado.nombreLocal}</strong> (N° {aFusionar?.duplicado.id}) pasan a{' '}
          <strong>{aFusionar?.principal.nombreLocal}</strong> (N° {aFusionar?.principal.id}), y el primero se elimina del padrón.
        </p>
        <p className="texto-chico">
          El estado del local que queda se va a recalcular con TODO el historial unificado, así que puede cambiar. Queda constancia
          de la fusión para poder rastrear las actuaciones históricas. Esto no se puede deshacer desde la aplicación.
        </p>
      </Confirmar>
    </>
  );
}

export default Duplicados;
