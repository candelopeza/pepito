/* ============================================================================
   RevisionCoordenadas.jsx  —  CORREGIR UBICACIONES QUE NO SE CORRESPONDEN
   ----------------------------------------------------------------------------
   Sección 9.2 del pliego. Los locales cuya coordenada guardada no cae dentro
   del ejido municipal: en el padrón real los hay a doce kilómetros de la
   dirección que declaran.

   >>> EL SISTEMA PROPONE, UNA PERSONA CONFIRMA <<<
   Es el criterio que el pliego pide para el informe de la prestataria (9.3) y
   acá pesa igual: la coordenada es la ubicación oficial del establecimiento,
   alimenta el mapa y el ruteo de los notificadores. Pisar sesenta y ocho de una
   sin que nadie las mire sería cambiar el mismo tipo de dato que se quiere
   arreglar, nada más que en sentido contrario.

   CÓMO FUNCIONA
     1. "Revisar" pide las propuestas al backend, que geocodifica cada dirección
        de verdad (Nominatim) y devuelve qué coordenada pondría. No guarda nada.
     2. La tabla muestra la actual, la propuesta y CUÁNTO SE MUEVE el local.
        Esa distancia es lo que permite decidir: 50 metros es un ajuste, 12 km
        es otro domicilio.
     3. El agente destilda lo que no quiere y aplica el resto.

   >>> VA POR TANDAS <<<
   El geocodificador acepta una consulta por segundo. Sesenta y ocho locales son
   más de un minuto, así que se piden de a veinte y la pantalla muestra el
   avance. Lo ya revisado no se pierde si se corta en el medio.
   ============================================================================ */

import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Grilla from './ui/Grilla';
import Badge from './ui/Badge';
import Aviso, { Vacio } from './ui/Aviso';
import { api } from '../datos/api';
import { useDatos } from '../datos/datosContexto';

/* A partir de cuántos kilómetros una corrección deja de ser un ajuste y pasa a
   ser un cambio de domicilio. Solo sirve para pintarlo: la decisión es del
   agente, pero conviene que lo grande se vea grande. */
const KM_PARA_MIRAR = 1;

function RevisionCoordenadas() {
  const { recargar } = useDatos();

  const [cargando, setCargando] = useState(false);
  const [avance, setAvance] = useState(null);
  const [propuestas, setPropuestas] = useState(null);
  const [elegidas, setElegidas] = useState(() => new Set());
  const [error, setError] = useState(null);
  const [resultado, setResultado] = useState(null);

  /* Pide las propuestas de a tandas hasta terminar. Cada tanda que vuelve se
     agrega a la tabla, así se ve avanzar en vez de quedar esperando un minuto
     frente a una pantalla quieta. */
  const revisar = useCallback(async () => {
    setCargando(true);
    setError(null);
    setResultado(null);
    setPropuestas([]);
    setElegidas(new Set());

    try {
      const { locales } = await api.coordenadasFuera();
      if (!locales.length) {
        setPropuestas([]);
        setAvance(null);
        return;
      }

      const ids = locales.map((l) => l.id);
      const acumuladas = [];
      const aprobadas = new Set();

      for (let i = 0; i < ids.length; i += 20) {
        setAvance({ hechos: i, total: ids.length });
        const { propuestas: tanda } = await api.proponerCoordenadas(ids.slice(i, i + 20));
        for (const p of tanda) {
          acumuladas.push(p);
          // Vienen tildadas: lo normal es aceptar la corrección, y destildar lo
          // dudoso es menos trabajo que tildar sesenta y ocho.
          if (p.propuesta) aprobadas.add(p.id);
        }
        setPropuestas([...acumuladas]);
        setElegidas(new Set(aprobadas));
      }
      setAvance({ hechos: ids.length, total: ids.length });
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  const alternar = useCallback((id) => {
    setElegidas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }, []);

  const aplicar = useCallback(async () => {
    const cambios = (propuestas ?? [])
      .filter((p) => p.propuesta && elegidas.has(p.id))
      .map((p) => ({ id: p.id, latitud: p.propuesta.latitud, longitud: p.propuesta.longitud }));

    if (!cambios.length) return;
    setCargando(true);
    setError(null);
    try {
      const r = await api.aplicarCoordenadas(cambios);
      setResultado(r);
      setPropuestas(null);
      // El padrón cambió: hay que volver a pedirlo para que el mapa y las
      // grillas muestren las ubicaciones nuevas.
      await recargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [propuestas, elegidas, recargar]);

  const columnas = useMemo(
    () => [
      {
        field: 'aplicar',
        headerName: 'Aplicar',
        width: 90,
        sortable: false,
        filterable: false,
        renderCell: ({ row }) =>
          row.propuesta ? (
            <input
              type="checkbox"
              checked={elegidas.has(row.id)}
              onChange={() => alternar(row.id)}
              aria-label={`Aplicar la corrección de ${row.nombreLocal}`}
            />
          ) : (
            <span className="texto-gris">—</span>
          ),
      },
      {
        field: 'nombreLocal',
        headerName: 'Local',
        flex: 1,
        minWidth: 190,
        renderCell: ({ row }) => (
          <Link to={`/locales/${row.id}`} className="link-local">
            {row.nombreLocal}
          </Link>
        ),
      },
      { field: 'direccion', headerName: 'Dirección declarada', flex: 1.2, minWidth: 210 },
      {
        field: 'actual',
        headerName: 'Ubicación guardada',
        width: 190,
        valueGetter: (_v, row) => (row.actual ? `${row.actual.latitud}, ${row.actual.longitud}` : ''),
        renderCell: ({ row }) =>
          row.actual ? (
            <span className="texto-gris">
              {row.actual.latitud.toFixed(5)}, {row.actual.longitud.toFixed(5)}
            </span>
          ) : (
            <span className="texto-gris">sin ubicación</span>
          ),
      },
      {
        field: 'propuesta',
        headerName: 'Ubicación propuesta',
        width: 190,
        valueGetter: (_v, row) => (row.propuesta ? `${row.propuesta.latitud}, ${row.propuesta.longitud}` : ''),
        renderCell: ({ row }) =>
          row.propuesta ? (
            <strong>
              {row.propuesta.latitud.toFixed(5)}, {row.propuesta.longitud.toFixed(5)}
            </strong>
          ) : (
            <Badge color="gris">no se pudo</Badge>
          ),
      },
      {
        field: 'distanciaKm',
        headerName: 'Se mueve',
        width: 130,
        renderCell: ({ row }) => {
          if (row.distanciaKm === null || row.distanciaKm === undefined) return <span className="texto-gris">—</span>;
          return row.distanciaKm >= KM_PARA_MIRAR ? (
            <Badge color="naranja">{row.distanciaKm} km</Badge>
          ) : (
            <Badge color="verde">{row.distanciaKm} km</Badge>
          );
        },
      },
      {
        field: 'motivo',
        headerName: 'Observación',
        flex: 1,
        minWidth: 200,
        renderCell: ({ row }) => row.motivo ?? '',
      },
    ],
    [elegidas, alternar],
  );

  const aAplicar = (propuestas ?? []).filter((p) => p.propuesta && elegidas.has(p.id)).length;
  const sinResolver = (propuestas ?? []).filter((p) => !p.propuesta).length;

  return (
    <>
      <div className="accesos-header">
        <span>Ubicaciones que no se corresponden con su dirección</span>
      </div>

      <Aviso tipo="alerta" titulo="Qué es esto">
        Locales cuya coordenada guardada cae fuera del ejido municipal. El sistema vuelve a geocodificar su dirección y propone la
        ubicación correcta, pero <strong>no cambia nada hasta que lo confirmes</strong>. La columna “Se mueve” dice cuánto se
        desplazaría cada local: medio kilómetro es un ajuste, diez es otro domicilio.
      </Aviso>

      {error && (
        <Aviso tipo="alerta" titulo="No se pudo completar">
          {error}
        </Aviso>
      )}

      {resultado && (
        <Aviso tipo="ok" titulo={`${resultado.aplicados} ubicación(es) corregida(s)`}>
          {resultado.rechazados.length > 0 &&
            `${resultado.rechazados.length} no se pudieron aplicar: ${resultado.rechazados
              .map((r) => `${r.id} (${r.motivo})`)
              .join(' · ')}`}
        </Aviso>
      )}

      <div className="barra-lote">
        <button type="button" className="btn-primario" onClick={revisar} disabled={cargando}>
          {cargando ? 'Revisando…' : 'Revisar las ubicaciones sospechosas'}
        </button>

        {cargando && avance && (
          <span className="texto-chico">
            {avance.hechos} de {avance.total} · una consulta por segundo
          </span>
        )}

        {!cargando && propuestas && propuestas.length > 0 && (
          <>
            <button type="button" className="btn-primario" onClick={aplicar} disabled={aAplicar === 0}>
              Aplicar {aAplicar} corrección(es)
            </button>
            <span className="texto-chico">
              {propuestas.length} revisado(s)
              {sinResolver > 0 && ` · ${sinResolver} sin resolver`}
            </span>
          </>
        )}
      </div>

      {propuestas === null ? (
        <Vacio titulo="Sin revisar todavía">
          Tocá “Revisar las ubicaciones sospechosas” para que el sistema geocodifique cada dirección y proponga la corrección. El
          proceso tarda alrededor de un segundo por local y no modifica nada por su cuenta.
        </Vacio>
      ) : propuestas.length === 0 ? (
        <Vacio titulo="No hay ubicaciones fuera del ejido">
          Todas las coordenadas guardadas caen dentro del municipio.
        </Vacio>
      ) : (
        <Grilla
          filas={propuestas}
          columnas={columnas}
          nombreArchivo="correccion-de-ubicaciones"
          vacio="No hay ubicaciones para revisar."
          alto="auto"
          filasPorPagina={25}
        />
      )}
    </>
  );
}

export default RevisionCoordenadas;
