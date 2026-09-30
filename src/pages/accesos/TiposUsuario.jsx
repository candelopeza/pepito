/* ============================================================================
   pages/accesos/TiposUsuario.jsx  —  LOS ROLES Y QUÉ VE CADA UNO
   (URL: /#/accesos/tipos-usuario, opcional ?rol=coordinacion abre sus permisos)
   ----------------------------------------------------------------------------
   Antes, darle o quitarle una pantalla a un rol era tocar un array en
   src/config/modulos.js y volver a publicar. Acá el administrador lo hace con
   una llave, y queda guardado.

   LA PANTALLA es la misma grilla que el padrón (ui/Grilla.jsx): buscador,
   imprimir y descargar, barra de columnas / filtros / densidad / exportar. Un
   renglón por tipo de usuario con nombre, descripción, cuántos usuarios
   activos tiene, cuántos módulos ve, la llave HABILITA y el ícono de llave
   que abre sus PERMISOS.
     - HABILITA apaga o prende el rol entero. Apagado, quien entre con ese rol
       no ve ningún módulo (el Inicio se lo avisa). Sus usuarios siguen dados
       de alta: es un apagón del tipo de usuario, no una baja de gente.
     - PERMISOS abre una ventana con los módulos agrupados como el menú, con
       dos llaves por fila: ACCESO (ve el módulo o no) y MODIFICAR (puede
       cambiar datos o solo consulta). La segunda solo aparece en los módulos
       que distinguen ver de editar. Lo que se toca se guarda al instante.

   SOLO SE GUARDAN LAS DIFERENCIAS respecto de lo que trae el código. Por eso
   la ventana tiene "Restablecer": borra lo guardado para ese rol y vuelve al
   reparto por defecto. Los módulos ajustados se marcan.

   LO QUE NO SE PUEDE HACER, A PROPÓSITO
     - Crear o borrar roles: el circuito (dominio/reglas.js) depende de sus
       ids. Los roles viven en auth/roles.js. Por eso no hay botón "+" ni
       ícono de eliminar en esta grilla.
     - Quitarle Tipos de usuario al administrador. Apagarlo sí se puede (la
       llave está, por las dudas), pero aun apagado conserva esta pantalla:
       así un clic nunca deja a todo el mundo sin la forma de arreglarlo.
     - Apagar el rol con el que estás trabajando, si no es el administrador:
       perderías esta pantalla en el acto y no podrías volver a prenderlo.

   >>> ESTO NO ES SEGURIDAD <<<  Igual que el resto de los permisos del front:
   define qué muestra la interfaz. El backend tiene que validar el rol en cada
   endpoint (tablas permisos_modulos y tipos_usuario).
   ============================================================================ */

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GridActionsCellItem } from '@mui/x-data-grid';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import PageHeader from '../../components/ui/PageHeader';
import Badge from '../../components/ui/Badge';
import Grilla from '../../components/ui/Grilla';
import Modal from '../../components/ui/Modal';
import Aviso from '../../components/ui/Aviso';
import Interruptor from '../../components/ui/hab/des';
import { useRol } from '../../auth/rolContexto';
import { LISTA_ROLES, ROLES } from '../../auth/roles';
import { useDatos } from '../../datos/datosContexto';
import {
  GRUPOS,
  MODULOS,
  ROL_ADMINISTRADOR,
  admiteEdicion,
  esPermisoFijo,
  nivelAcceso,
  nivelPorDefecto,
  puedeEditar,
  rolHabilitado,
} from '../../config/modulos';

/* ¿Este módulo tiene guardado algo distinto de lo que trae el código? */
function estaModificado(modulo, rol, permisos) {
  const guardado = permisos?.modulos?.[modulo.id]?.[rol];
  return guardado !== undefined && guardado !== nivelPorDefecto(modulo, rol);
}

/* Los permisos se miran como si el rol estuviera prendido: si está apagado,
   nivelAcceso() devuelve 'no' para todo y la ventana no mostraría nada útil. */
function comoPrendido(permisos) {
  return { ...permisos, rolesDeshabilitados: [] };
}

/* ---------------------------------------------------------------------------
   La ventana de permisos de UN rol: los módulos agrupados como el menú, con
   las llaves de acceso y de modificación.
   --------------------------------------------------------------------------- */
function PermisosDeRol({ rol, permisos, soloLectura, guardarPermiso, restablecerPermisosDeRol }) {
  const vista = comoPrendido(permisos);
  const apagado = !rolHabilitado(rol.id, permisos);
  const modificados = MODULOS.filter((m) => estaModificado(m, rol.id, permisos)).length;
  const habilitados = MODULOS.filter((m) => nivelAcceso(m, rol.id, vista) !== 'no').length;

  function cambiarAcceso(m, activo) {
    if (!activo) {
      guardarPermiso(m.id, rol.id, 'no');
      return;
    }
    // Al habilitar vuelve al nivel del código. Si el código no se lo daba,
    // arranca en consulta: modificar es un segundo paso explícito.
    const base = nivelPorDefecto(m, rol.id);
    guardarPermiso(m.id, rol.id, base === 'no' ? 'ver' : base);
  }

  function cambiarEdicion(m, puede) {
    guardarPermiso(m.id, rol.id, puede ? 'editar' : 'ver');
  }

  return (
    <>
      {apagado && (
        <Aviso tipo="alerta" titulo="Este tipo de usuario está deshabilitado">
          Los permisos se guardan igual, pero no rigen hasta que se lo vuelva a habilitar desde la tabla.
          {rol.id === ROL_ADMINISTRADOR && ' El administrador conserva Tipos de usuario aun apagado, para poder revertirlo.'}
        </Aviso>
      )}

      <div className="accesos-header accesos-header-accion">
        <span>
          {habilitados} de {MODULOS.length} módulos habilitados
          {modificados > 0 && (
            <>
              {' '}
              <Badge color="amarillo">{modificados} ajustado(s)</Badge>
            </>
          )}
        </span>
        {!soloLectura && modificados > 0 && (
          <button type="button" className="btn-secundario" onClick={() => restablecerPermisosDeRol(rol.id)}>
            Restablecer valores por defecto
          </button>
        )}
      </div>

      <table className="tabla-datos tabla-permisos">
        <thead>
          <tr>
            <th>Sección</th>
            <th>Módulo</th>
            <th>Acceso</th>
            <th>Modificar</th>
          </tr>
        </thead>
        <tbody>
          {GRUPOS.map((g) => {
            const delGrupo = MODULOS.filter((m) => m.grupo === g.id);
            return delGrupo.map((m, i) => {
              const nivel = nivelAcceso(m, rol.id, vista);
              const fijo = esPermisoFijo(m.id, rol.id);
              const conAcceso = nivel !== 'no';
              return (
                <tr key={m.id} className={conAcceso ? '' : 'fila-apagada'}>
                  {i === 0 && (
                    <td className="celda-grupo" rowSpan={delGrupo.length}>
                      {g.titulo}
                    </td>
                  )}
                  <td className="celda-modulo">
                    <strong>
                      {m.titulo}
                      {estaModificado(m, rol.id, permisos) && <Badge color="amarillo">ajustado</Badge>}
                    </strong>
                    <span className="texto-chico">{m.descripcion}</span>
                  </td>
                  <td>
                    <Interruptor
                      activo={conAcceso}
                      deshabilitado={soloLectura || fijo}
                      etiqueta={fijo ? 'Siempre' : conAcceso ? 'Habilitado' : 'Sin acceso'}
                      onChange={(v) => cambiarAcceso(m, v)}
                    />
                  </td>
                  <td>
                    {admiteEdicion(m) ? (
                      <Interruptor
                        activo={nivel === 'editar'}
                        deshabilitado={soloLectura || fijo || !conAcceso}
                        etiqueta={nivel === 'editar' ? 'Puede modificar' : 'Solo consulta'}
                        onChange={(v) => cambiarEdicion(m, v)}
                      />
                    ) : (
                      <span className="texto-gris">Solo consulta</span>
                    )}
                  </td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    </>
  );
}

/* ---------------------------------------------------------------------------
   La pantalla: la grilla de tipos de usuario.
   --------------------------------------------------------------------------- */
function TiposUsuario() {
  const { rol: rolActivo } = useRol();
  const { permisos, usuarios, guardarPermiso, restablecerPermisosDeRol, habilitarRol } = useDatos();
  const [params, setParams] = useSearchParams();

  // Quien llegue acá con acceso de consulta ve las llaves pero no las mueve.
  const soloLectura = !puedeEditar(rolActivo, 'accesos-roles', permisos);

  const [buscar, setBuscar] = useState('');

  /* La ventana de permisos abierta se lee de la URL (?rol=...). Así la llave
     de la grilla de Usuarios puede traer directo a los permisos de ese rol, y
     el botón Atrás del navegador la cierra. */
  const idAbierto = params.get('rol');
  const rolAbierto = idAbierto && ROLES[idAbierto] ? ROLES[idAbierto] : null;
  const cerrar = () => setParams({});

  /* ---------- Las filas ---------- */
  const filas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return LISTA_ROLES.filter((r) => !q || r.etiqueta.toLowerCase().includes(q) || r.descripcion.toLowerCase().includes(q)).map(
      (r) => ({
        id: r.id,
        nombre: r.etiqueta,
        descripcion: r.descripcion,
        usuarios: usuarios.filter((u) => u.rol === r.id && u.activo).length,
        modulos: MODULOS.filter((m) => nivelAcceso(m, r.id, comoPrendido(permisos)) !== 'no').length,
        ajustados: MODULOS.filter((m) => estaModificado(m, r.id, permisos)).length,
        habilitado: rolHabilitado(r.id, permisos),
      }),
    );
  }, [buscar, usuarios, permisos]);

  /* ---------- Las columnas ---------- */
  const columnas = useMemo(
    () => [
      { field: 'id', headerName: 'ID', width: 140 },
      { field: 'nombre', headerName: 'Nombre', flex: 1, minWidth: 200 },
      { field: 'descripcion', headerName: 'Descripción', flex: 2, minWidth: 260 },
      { field: 'usuarios', headerName: 'Usuarios', width: 100, type: 'number' },
      {
        field: 'modulos',
        headerName: 'Módulos',
        width: 190,
        type: 'number',
        renderCell: ({ row }) => (
          <span className="celda-estado">
            {row.modulos} de {MODULOS.length}
            {row.ajustados > 0 && <Badge color="amarillo">{row.ajustados} ajustado(s)</Badge>}
          </span>
        ),
      },
      {
        field: 'habilitado',
        headerName: 'Habilita',
        width: 170,
        type: 'boolean',
        renderCell: ({ row }) => {
          // Tu propio rol no se apaga desde adentro: al hacerlo perderías esta
          // pantalla y no podrías volver. El administrador es la excepción
          // porque conserva Tipos de usuario aun apagado.
          const esElPropio = row.id === rolActivo && row.id !== ROL_ADMINISTRADOR;
          return (
            <span title={esElPropio ? 'Es el tipo de usuario con el que estás trabajando: no se puede apagar desde acá.' : undefined}>
              <Interruptor
                activo={row.habilitado}
                deshabilitado={soloLectura || esElPropio}
                etiqueta={row.habilitado ? 'Habilitado' : 'Deshabilitado'}
                onChange={(v) => habilitarRol(row.id, v)}
              />
            </span>
          );
        },
      },
      {
        field: 'acciones',
        headerName: 'Acciones',
        type: 'actions',
        width: 100,
        getActions: ({ row }) => [
          <GridActionsCellItem
            key="permisos"
            className="accion-grilla-llave"
            icon={<VpnKeyIcon fontSize="small" />}
            label="Permisos"
            title={`Permisos de ${row.nombre}`}
            onClick={() => setParams({ rol: row.id })}
          />,
        ],
      },
    ],
    [soloLectura, rolActivo, habilitarRol, setParams],
  );

  const prendidos = LISTA_ROLES.filter((r) => rolHabilitado(r.id, permisos)).length;

  return (
    <>
      <PageHeader
        etiqueta="ACCESOS"
        titulo="TIPOS DE USUARIO"
        subtitulo={`${LISTA_ROLES.length} tipos de usuario · ${prendidos} habilitado(s)`}
        botonVolver
      />

      <Grilla
        filas={filas}
        columnas={columnas}
        nombreArchivo="tipos-de-usuario"
        vacio="Ningún tipo de usuario coincide con la búsqueda."
        buscadores={[{ placeholder: 'Buscar por nombre', valor: buscar, onChange: setBuscar }]}
        alto={520}
      />

      <Modal abierto={Boolean(rolAbierto)} etiqueta="PERMISOS" titulo={rolAbierto?.etiqueta ?? ''} ancho="ancho" onCerrar={cerrar}>
        {rolAbierto && (
          <PermisosDeRol
            rol={rolAbierto}
            permisos={permisos}
            soloLectura={soloLectura}
            guardarPermiso={guardarPermiso}
            restablecerPermisosDeRol={restablecerPermisosDeRol}
          />
        )}
      </Modal>
    </>
  );
}

export default TiposUsuario;
