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
import { fmtFecha } from '../../dominio/fechas';

function Entregas() {
  const { rol, usuario } = useRol();
  const { usuarios, cedulas, localPorId, registrarEntrega } = useDatos();

  const [entregando, setEntregando] = useState(null);
  const [viendo, setViendo] = useState(null);
  const [verTodas, setVerTodas] = useState(rol === 'coordinacion');

  // Quién soy en la tabla de usuarios: la asignación se guarda por id.
  const yo = usuarios.find((u) => u.nombre === usuario.nombre);

  const pendientes = cedulas()
    .filter((c) => !c.resultado)
    .filter((c) => verTodas || (yo && c.notificadorId === yo.id));

  // Se enriquece con la coordenada del PADRÓN (la geocodificada), que es la
  // única válida para rutear.
  const conUbicacion = pendientes.map((c) => ({
    ...c,
    latitud: c.local?.latitud ?? null,
    longitud: c.local?.longitud ?? null,
  }));

  const ruta = ordenarPorProximidad(conUbicacion);
  const sinAsignar = cedulas().filter((c) => !c.resultado && !c.notificadorId);

  return (
    <>
      <PageHeader
        etiqueta="CAMPO"
        titulo="MIS ENTREGAS"
        subtitulo={`${ruta.length} cédula(s) para entregar ordenado por proximidad`}
        botonVolver
        acciones={
          rol === 'coordinacion' && (
            <button type="button" className="btn-secundario" onClick={() => setVerTodas((v) => !v)}>
              {verTodas ? 'Ver solo las mías' : 'Ver las de todos'}
            </button>
          )
        }
      />

      {sinAsignar.length > 0 && rol === 'coordinacion' && (
        <Aviso
     tipo="alerta" titulo={`${sinAsignar.length} cédula(s) emitidas sin notificador asignado`}
        accion={<Link to="/tablero">Expedientes para generar</Link>}
      />
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
                  {c.impresaEn ? <Badge color="verde">Impresa</Badge> : <Badge color="rojo">Sin imprimir</Badge>}
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
                <button type="button" className="btn-primario" onClick={() => setEntregando(c)}>
                  Registrar entrega
                </button>
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

      {/* ---------- Registrar el resultado ---------- */}
      {entregando && (
        <Modal abierto etiqueta="ENTREGA" titulo={`Cédula ${entregando.numeroCedula}`} ancho="ancho" onCerrar={() => setEntregando(null)}>
          <FormEntrega
            cedula={entregando}
            local={entregando.local}
            onGuardar={(d) => {
              registrarEntrega(entregando.id, d);
              setEntregando(null);
            }}
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
