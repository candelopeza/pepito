/* ============================================================================
   pages/campo/Entregas.jsx  —  MIS ENTREGAS  (URL: /#/campo/entregas)
   ----------------------------------------------------------------------------
   La pantalla del notificador. Le muestra las cédulas que tiene asignadas y le
   deja registrar el resultado de cada entrega con evidencia fotográfica
   (sección 6.2).

   >>> EL ORDEN DE LA LISTA ES LA HOJA DE RUTA <<<
   Las cédulas salen ordenadas por PROXIMIDAD GEOGRÁFICA, no por nombre de
   calle. El sistema viejo agrupa por calle y ordena por altura: aproxima un
   recorrido, pero ignora la distancia real entre puntos de calles distintas.
   Ahora que las coordenadas son confiables se puede calcular bien
   (dominio/geo.js → ordenarPorProximidad). Es una mejora de valor operativo
   directo sobre el trabajo diario del notificador.

   Los locales sin coordenada van al final: no se pueden rutear y el
   notificador los ubica a mano.

   ACÁ EMPIEZA A CORRER EL PLAZO: el formulario de entrega es el que calcula y
   guarda la fecha de vencimiento. Todo lo que viene después depende de eso.

   QUÉ CÉDULAS APARECEN: las que están EN CURSO en su local y todavía no
   tienen una entrega efectiva. Incluye las que constan como no entregadas:
   el circuito queda detenido hasta que la entrega se concrete, y este es el
   lugar donde se vuelve a intentar.

   SIN SEÑAL: la entrega queda guardada en el teléfono y se envía sola al
   volver la conexión (datos/colaSinConexion.js). Mientras tanto la cédula se
   muestra como "guardada en el teléfono", para no cargarla dos veces.

   CORREGIR LO DE HOY (sección 6.2): abajo aparecen las entregas que el agente
   registró hoy, con un botón para corregirlas si se equivocó de resultado o
   de fecha. Al día siguiente ya no: la corrección la hace la oficina. El
   servidor lo controla igual (PUT /notificaciones/:id/entrega).
   ============================================================================ */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Badge from '../../components/ui/Badge';
import Aviso, { Vacio } from '../../components/ui/Aviso';
import Modal from '../../components/ui/Modal';
import FormEntrega from '../../components/FormEntrega';
import VistaCedula from '../../components/VistaCedula';
import { useRol } from '../../auth/rolContexto';
import { useDatos } from '../../datos/datosContexto';
import { ordenarPorProximidad } from '../../dominio/geo';
import { fmtFecha, fmtFechaHora, hoyISO } from '../../dominio/fechas';
import { resultadoEntrega } from '../../dominio/actuaciones';

/* Estados del local en los que su cédula en curso espera una entrega. */
const ESPERAN_ENTREGA = ['NOTIF1_GENERADA', 'NOTIF2_GENERADA', 'NOTIF1_NO_ENTREGADA', 'NOTIF2_NO_ENTREGADA'];
const ENTREGA_EFECTIVA = ['ENTREGADA', 'SIN_FIRMA', 'FIJADA'];

function Entregas() {
  const { rol, usuario } = useRol();
  const { usuarios, cedulas, localPorId, registrarEntrega, corregirEntrega, capacidades, pendientesSinConexion, descartarPendiente } =
    useDatos();
  const [corrigiendo, setCorrigiendo] = useState(null);

  const [entregando, setEntregando] = useState(null);
  const [viendo, setViendo] = useState(null);
  const [verTodas, setVerTodas] = useState(['coordinacion', 'administrador'].includes(rol));

  // Quién soy en la tabla de usuarios: la asignación se guarda por id. Si se
  // entró con un agente de la base (selector de la barra), es él; si no, se
  // busca por nombre como antes.
  const yo = usuario.id ? usuarios.find((u) => u.id === usuario.id) : usuarios.find((u) => u.nombre === usuario.nombre);

  const enCola = (pendientesSinConexion ?? []).filter((p) => p.tipo === 'entrega');
  const idsEnCola = new Set(enCola.filter((p) => !p.rechazado).map((p) => p.referencia));

  // La cédula en curso de cada local: la última emitida (el id es correlativo:
  // la de mayor id es la más nueva; regenerar conserva el id).
  const todas = cedulas();
  const enCurso = todas.filter((c) => {
    if (c.resultado && c.resultado !== 'NO_ENTREGADA') return false;
    if (!ESPERAN_ENTREGA.includes(c.local?.estado)) return false;
    return todas.every((x) => x.localId !== c.localId || x.id <= c.id);
  });

  const pendientes = enCurso.filter((c) => verTodas || (yo && c.notificadorId === yo.id));

  // Las que este agente entregó hoy y siguen siendo la cédula en curso de su
  // local: todavía las puede corregir él.
  const hoy = hoyISO();
  const registradasHoy = todas.filter(
    (c) =>
      yo &&
      c.notificadorId === yo.id &&
      ENTREGA_EFECTIVA.includes(c.resultado) &&
      c.fechaEntrega === hoy &&
      todas.every((x) => x.localId !== c.localId || x.id <= c.id),
  );

  // Se enriquece con la coordenada del PADRÓN (la geocodificada), que es la
  // única válida para rutear.
  const conUbicacion = pendientes.map((c) => ({
    ...c,
    latitud: c.local?.latitud ?? null,
    longitud: c.local?.longitud ?? null,
  }));

  const ruta = ordenarPorProximidad(conUbicacion);
  const sinAsignar = enCurso.filter((c) => !c.notificadorId);

  async function guardarEntrega(cedula, datos) {
    const r = await registrarEntrega(cedula.id, {
      ...datos,
      etiqueta: `Cédula ${cedula.numeroCedula} · ${cedula.local?.nombreLocal ?? ''}`,
    });
    // Solo se cierra si se guardó (o quedó en el teléfono). Si el servidor la
    // rechazó, el formulario queda abierto con lo escrito y el cartel dice por qué.
    if (r) setEntregando(null);
  }

  return (
    <>
      <PageHeader
        etiqueta="CAMPO"
        titulo="MIS ENTREGAS"
        subtitulo={`${ruta.length} cédula(s) para entregar ordenado por proximidad`}
        botonVolver
        acciones={
          ['coordinacion', 'administrador'].includes(rol) && (
            <button type="button" className="btn-secundario" onClick={() => setVerTodas((v) => !v)}>
              {verTodas ? 'Ver solo las mías' : 'Ver las de todos'}
            </button>
          )
        }
      />

      {sinAsignar.length > 0 && ['coordinacion', 'administrador'].includes(rol) && (
        <Aviso
     tipo="alerta" titulo={`${sinAsignar.length} cédula(s) emitidas sin notificador asignado`}
        accion={<Link to="/tablero">Asignar desde el tablero</Link>}
      />
      )}

      {/* ---------- Lo cargado sin señal ---------- */}
      {enCola.length > 0 && (
        <>
          <div className="accesos-header">
            <span>Guardadas en el teléfono ({enCola.length})</span>
          </div>
          <ul className="lista-cola">
            {enCola.map((p) => (
              <li key={p.id}>
                <strong>{p.etiqueta}</strong>
                <span>{fmtFechaHora(p.creado)}</span>
                {p.rechazado ? (
                  <>
                    <Badge color="rojo">No se aceptó: {p.error}</Badge>
                    <button type="button" className="btn-tabla" onClick={() => descartarPendiente(p.id)}>
                      Descartar
                    </button>
                  </>
                ) : (
                  <Badge color="naranja">Se envía al volver la señal</Badge>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {ruta.length === 0 ? (
        <Vacio titulo="No tenés entregas pendientes">
        </Vacio>
      ) : (
        <ol className="lista-entregas">
          {ruta.map((c, i) => (
            <li key={c.id} className="entrega-item">
              <span className="entrega-orden">{i + 1}</span>

              <div className="entrega-datos">
                <strong>{c.local?.nombreLocal ?? 'Local sin nombre'}</strong>
                <span className="entrega-direccion">{c.local?.direccion}</span>
                <span className="entrega-meta">
                  Cédula {c.numeroCedula} · {c.instancia === 1 ? 'primera' : 'segunda'} notificación · emitida el{' '}
                  {fmtFecha(c.fecha)}
                </span>
                <span className="entrega-badges">
                  {c.resultado === 'NO_ENTREGADA' && <Badge color="rojo">No entregada: volver a intentar</Badge>}
                  {capacidades?.impresion &&
                    (c.impresaEn ? <Badge color="verde">Impresa</Badge> : <Badge color="rojo">Sin imprimir</Badge>)}
                  {c.notificador ? (
                    <Badge color="azul">{c.notificador.nombre}</Badge>
                  ) : (
                    <Badge color="amarillo">Sin asignar</Badge>
                  )}
                  {/* Un local sin coordenada no entra en el ruteo: hay que
                      avisarlo, no dejarlo pasar como si estuviera bien. */}
                  {c.latitud === null && <Badge color="gris">Sin ubicación: ubicalo a mano</Badge>}
                </span>
              </div>

              <div className="entrega-acciones">
                {idsEnCola.has(c.id) ? (
                  <Badge color="naranja">Guardada en el teléfono</Badge>
                ) : (
                  <button type="button" className="btn-primario" onClick={() => setEntregando(c)}>
                    Registrar entrega
                  </button>
                )}
                <button type="button" className="btn-secundario" onClick={() => setViendo(c)}>
                  Ver cédula
                </button>
                {c.local && (
                  <Link to={`/locales/${c.local.id}`} className="btn-tabla">
                    Ficha
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* ---------- Lo registrado hoy: se puede corregir ---------- */}
      {registradasHoy.length > 0 && (
        <>
          <div className="accesos-header">
            <span>Entregadas hoy ({registradasHoy.length})</span>
          </div>
          <ul className="lista-cola">
            {registradasHoy.map((c) => (
              <li key={c.id}>
                <strong>
                  Cédula {c.numeroCedula} · {c.local?.nombreLocal}
                </strong>
                <span>{resultadoEntrega(c.resultado)?.etiqueta ?? c.resultado}</span>
                <button type="button" className="btn-tabla" onClick={() => setCorrigiendo(c)}>
                  Corregir
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {corrigiendo && (
        <Modal
          abierto
          etiqueta="CORREGIR ENTREGA"
          titulo={`Cédula ${corrigiendo.numeroCedula}`}
          ancho="ancho"
          onCerrar={() => setCorrigiendo(null)}
        >
          <FormEntrega
            cedula={corrigiendo}
            local={corrigiendo.local}
            correccion
            onGuardar={async (d) => {
              if (await corregirEntrega(corrigiendo.id, d)) setCorrigiendo(null);
            }}
            onCancelar={() => setCorrigiendo(null)}
          />
        </Modal>
      )}

      {/* ---------- Registrar el resultado ---------- */}
      {entregando && (
        <Modal abierto etiqueta="ENTREGA" titulo={`Cédula ${entregando.numeroCedula}`} ancho="ancho" onCerrar={() => setEntregando(null)}>
          <FormEntrega
            cedula={entregando}
            local={entregando.local}
            onGuardar={(d) => guardarEntrega(entregando, d)}
            onCancelar={() => setEntregando(null)}
          />
        </Modal>
      )}

      <VistaCedula
        abierto={Boolean(viendo)}
        cedula={viendo}
        local={viendo ? localPorId(viendo.localId) : null}
        onCerrar={() => setViendo(null)}
      />
    </>
  );
}

export default Entregas;
