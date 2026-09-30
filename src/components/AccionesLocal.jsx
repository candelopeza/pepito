/* ============================================================================
   AccionesLocal.jsx  —  *** LOS BOTONES QUE HACEN AVANZAR EL CIRCUITO ***
   ----------------------------------------------------------------------------
   Recibe un local y dibuja SOLO las acciones que corresponden a su estado y al
   rol del usuario. Después maneja cada formulario y llama al store.

   POR QUÉ ESTÁ EN UN SOLO COMPONENTE Y NO EN CADA PANTALLA
   Porque lo usan la ficha del local, el tablero, la cola de emisión y la
   pantalla de expedientes. Si cada una armara sus propios botones, en dos
   semanas una ofrecería "otorgar prórroga" en un estado donde otra no, y esa
   diferencia es un acto administrativo mal habilitado, no un detalle visual.

   QUÉ ACCIÓN APARECE CUÁNDO NO SE DECIDE ACÁ: está en la tabla ACCIONES de
   dominio/reglas.js. Este archivo solo la ejecuta. Si falta o sobra un botón,
   se corrige allá.

   PROPS
     local     el local YA enriquecido (con .estado calculado)
     compacto  para una fila de tabla: UN solo botón "Acciones" que despliega
               el menú con las opciones, en vez de un botón por acción
     alTerminar  (opcional) se llama después de ejecutar una acción
   ============================================================================ */

import { useState } from 'react';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Modal from './ui/Modal';
import Confirmar from './ui/Confirmar';
import Aviso from './ui/Aviso';
import Campo, { CampoSelect, CampoTexto } from './ui/Campo';
import FormLocal from './FormLocal';
import FormDocumento from './FormDocumento';
import FormEntrega from './FormEntrega';
import VistaCedula from './VistaCedula';
import { useRol } from '../auth/rolContexto';
import { useDatos } from '../datos/datosContexto';
import { accionesDisponibles, faltantesRegistrales } from '../dominio/reglas';

/* El menú que se abre desde el botón "Acciones" de una fila. Es el Menu de MUI
   (ya está en el bundle por la grilla) porque sale por portal: así no lo
   recorta el overflow: hidden de la tabla ni el de la bandeja, y cierra solo
   con Escape o con un clic afuera. Estos dos objetos lo visten con el mismo
   lenguaje que .btn-tabla —azul institucional, esquinas de 8px— y le sacan la
   tipografía propia de MUI. */
const ESTILO_MENU = {
  mt: 0.5,
  minWidth: 230,
  borderRadius: 2,
  border: '1px solid #e8ecf1',
  boxShadow: '0 6px 20px rgba(0, 0, 0, 0.12)',
};
const ESTILO_ITEM = {
  fontFamily: 'inherit',
  fontSize: 14,
  color: '#333',
  py: 1.1,
  '&:hover': { backgroundColor: '#e3f2fd', color: '#1565c0' },
};

function AccionesLocal({ local, compacto = false, alTerminar }) {
  const { rol } = useRol();
  const datos = useDatos();
  const {
    usuarios,
    parametros,
    actuacionesDeLocal,
    guardarLocal,
    revisarRelevamiento,
    generarCedula,
    regenerarCedula,
    asignarNotificador,
    registrarEntrega,
    registrarDocumento,
    otorgarProrroga,
    registrarExpediente,
    reingresarAlCircuito,
    bloquearLocal,
    desbloquearLocal,
  } = datos;

  /* `abierta` guarda qué acción se está ejecutando. Un solo estado para todos
     los modales: así no puede haber dos abiertos a la vez. */
  const [abierta, setAbierta] = useState(null);
  const [form, setForm] = useState({});
  // El botón desde el que se abrió el menú (modo compacto). null = cerrado.
  const [anclaMenu, setAnclaMenu] = useState(null);

  const disponibles = accionesDisponibles(local.estado, rol, local);
  const faltan = faltantesRegistrales(local);

  /* La cédula sobre la que operan asignar / entrega / regenerar: la última
     emitida que todavía no tiene resultado. */
  const cedulaPendiente = actuacionesDeLocal(local.id)
    .filter((a) => a.tipo === 'NOTIFICACION' && !a.resultado)
    .pop() ?? null;

  const notificadores = usuarios.filter((u) => u.activo && ['notificador', 'relevador'].includes(u.rol));
  const prorrogasPrevias = actuacionesDeLocal(local.id).filter((a) => a.tipo === 'PRORROGA').length;

  function abrir(id) {
    setForm({});
    setAbierta(id);
  }

  function cerrar() {
    setAbierta(null);
    setForm({});
  }

  function terminar() {
    cerrar();
    alTerminar?.();
  }

  /* La lista de opciones ya resuelta para este local y este rol. Se arma una
     sola vez y la dibujan las dos variantes: botones grandes en la ficha, menú
     desplegable en una fila. Un local bloqueado no ofrece el circuito, solo
     levantar el bloqueo (y eso, coordinación). */
  const opciones = [];
  if (local.bloqueado) {
    if (['coordinacion', 'administrador'].includes(rol)) opciones.push({ id: 'desbloquear', etiqueta: 'Levantar bloqueo' });
  } else {
    opciones.push(...disponibles);
  }
  /* Ver la cédula emitida, desde cualquier pantalla. Requisito válido para las
     dos alternativas de emisión (sección 9.6). */
  if (cedulaPendiente) opciones.push({ id: 'ver-cedula', etiqueta: 'Ver cédula' });

  function elegir(id) {
    setAnclaMenu(null);
    abrir(id);
  }

  return (
    <>
      {/* ======================= LOS BOTONES ======================= */}
      {compacto ? (
        /* En una fila de tabla: UN botón que despliega las opciones. Antes cada
           acción era un botón propio, una fila con cuatro ocupaba dos renglones
           y la columna Acciones era lo más ancho de la tabla. Con el menú todas
           las filas miden lo mismo y se ve de un vistazo dónde hay algo para
           hacer. El número dice cuántas opciones hay sin tener que abrirlo. */
        opciones.length === 0 ? (
          <span className="texto-gris">—</span>
        ) : (
          <>
            <button
              type="button"
              className="btn-tabla btn-menu-acciones"
              aria-haspopup="menu"
              aria-expanded={Boolean(anclaMenu)}
              onClick={(e) => setAnclaMenu(e.currentTarget)}
            >
              Opciones ({opciones.length})
              <ExpandMoreIcon fontSize="inherit" />
            </button>
            <Menu
              anchorEl={anclaMenu}
              open={Boolean(anclaMenu)}
              onClose={() => setAnclaMenu(null)}
              slotProps={{ paper: { sx: ESTILO_MENU } }}
            >
              {opciones.map((o) => (
                <MenuItem key={o.id} title={o.ayuda} sx={ESTILO_ITEM} onClick={() => elegir(o.id)}>
                  {o.etiqueta}
                </MenuItem>
              ))}
            </Menu>
          </>
        )
      ) : (
        <div className="acciones-local">
          {opciones.map((o) => (
            <button key={o.id} type="button" className="btn-accion" title={o.ayuda} onClick={() => abrir(o.id)}>
              {o.etiqueta}
            </button>
          ))}

          {opciones.length === 0 && (
            <span className="sin-acciones">
              {local.estado === 'EXENTO_CONFIRMADO'
                ? 'Exención confirmada: es el único estado terminal, no hay más actos.'
                : 'No hay acciones disponibles para tu rol en este estado.'}
            </span>
          )}
        </div>
      )}

      {/* ======================= CONTROL DEL RELEVAMIENTO ======================= */}
      <Confirmar
        abierto={abierta === 'confirmar-exencion'}
        titulo="Confirmar la exención"
        textoConfirmar="Confirmar exención"
        onCancelar={cerrar}
        onConfirmar={() => {
          revisarRelevamiento(local.id, 'EXENTO_CONFIRMADO');
          terminar();
        }}
      >
        <p>
          <strong>{local.nombreLocal}</strong> queda como <strong>Relevado - Exento</strong>. Es el único estado terminal del
          sistema: el local no vuelve a entrar al circuito de notificaciones.
        </p>
      </Confirmar>

      <Confirmar
        abierto={abierta === 'corregir-clasificacion'}
        titulo="Corregir la clasificación"
        textoConfirmar="Sí, es Gran Generador"
        onCancelar={cerrar}
        onConfirmar={() => {
          revisarRelevamiento(local.id, 'GRAN_GENERADOR');
          terminar();
        }}
      >
        <p>
          El relevador lo clasificó como Generador Menor. Al corregirlo, <strong>{local.nombreLocal}</strong> pasa directamente a la
          emisión de la primera notificación.
        </p>
      </Confirmar>

      <Confirmar
        abierto={abierta === 'habilitar-notificacion'}
        titulo="Habilitar la notificación"
        textoConfirmar="Habilitar"
        onCancelar={cerrar}
        onConfirmar={() => {
          revisarRelevamiento(local.id, 'HABILITADO');
          terminar();
        }}
      >
        <p>
          <strong>{local.nombreLocal}</strong> entra en la cola de emisión de la primera cédula.
        </p>
        {faltan.length > 0 && (
          <Aviso tipo="alerta" titulo="Faltan datos registrales">
            Falta {faltan.join(', ')}. Podés habilitarlo, pero no vas a poder emitir la cédula hasta cargarlos.
          </Aviso>
        )}
      </Confirmar>

      {/* ======================= COMPLETAR DATOS ======================= */}
      <Modal abierto={abierta === 'completar-datos'} etiqueta="PADRÓN" titulo="Completar datos del local" ancho="ancho" onCerrar={cerrar}>
        <FormLocal
          local={local}
          onGuardar={(l) => {
            guardarLocal(l);
            terminar();
          }}
          onCancelar={cerrar}
        />
      </Modal>

      {/* ======================= EMISIÓN DE CÉDULAS ======================= */}
      <Confirmar
        abierto={abierta === 'generar-cedula'}
        titulo="Generar la cédula de notificación"
        textoConfirmar={faltan.length > 0 ? 'No se puede generar' : 'Generar cédula'}
        onCancelar={cerrar}
        onConfirmar={() => {
          if (faltan.length > 0) return;
          generarCedula(local.id);
          terminar();
        }}
      >
        {faltan.length > 0 ? (
          <Aviso tipo="bloqueo" titulo="Faltan datos registrales">
            Falta {faltan.join(', ')}. La cédula tiene que individualizar correctamente al sujeto obligado: sin esos datos la
            notificación es impugnable. Completá el padrón y volvé.
          </Aviso>
        ) : (
          <>
            <p>
              Se va a emitir la <strong>{local.estado.startsWith('NOTIF2') ? 'segunda' : 'primera'} cédula</strong> de{' '}
              <strong>{local.nombreLocal}</strong>, con número correlativo.
            </p>
            <Aviso tipo="info" titulo="La emisión no hace correr ningún plazo">
              El cómputo arranca en la entrega efectiva. Después de generar hay que asignar notificador y registrar el resultado de
              la entrega.
            </Aviso>
          </>
        )}
      </Confirmar>

      <Confirmar
        abierto={abierta === 'regenerar-cedula'}
        titulo="Regenerar la cédula"
        textoConfirmar="Regenerar"
        onCancelar={cerrar}
        onConfirmar={() => {
          if (cedulaPendiente) regenerarCedula(cedulaPendiente.id);
          terminar();
        }}
      >
        <p>
          Se reemplaza la cédula <strong>{cedulaPendiente?.numeroCedula}</strong> por una nueva, con número nuevo y con los datos
          corregidos del local.
        </p>
        <p className="texto-chico">
          La anterior queda anulada. Se le pide número nuevo porque la vieja ya salió con datos mal y no puede quedar circulando con
          el mismo número.
        </p>
      </Confirmar>

      {/* ======================= ASIGNAR NOTIFICADOR ======================= */}
      <Modal abierto={abierta === 'asignar-notificador'} etiqueta="NOTIFICACIÓN" titulo="Asignar notificador" onCerrar={cerrar}>
        <div className="formulario formulario-modal">
          <div className="bloque-info">
            <strong>{local.nombreLocal}</strong>
            <span>
              Cédula {cedulaPendiente?.numeroCedula} · {local.direccion}
            </span>
          </div>
          <CampoSelect
            id="asig-notificador"
            etiqueta="Notificador"
            valor={form.notificadorId ?? ''}
            onChange={(v) => setForm({ ...form, notificadorId: v })}
            opciones={notificadores.map((u) => ({ id: u.id, etiqueta: `${u.nombre} (${u.rol})` }))}
            ayuda="Suele ser el mismo agente que releva."
          />
          <div className="form-acciones">
            <button
              type="button"
              className="btn-primario"
              disabled={!form.notificadorId}
              onClick={() => {
                asignarNotificador(cedulaPendiente.id, form.notificadorId);
                terminar();
              }}
            >
              Asignar
            </button>
            <button type="button" className="btn-secundario" onClick={cerrar}>
              Cancelar
            </button>
          </div>
        </div>
      </Modal>

      {/* ======================= REGISTRAR ENTREGA ======================= */}
      <Modal abierto={abierta === 'registrar-entrega'} etiqueta="NOTIFICACIÓN" titulo="Registrar el resultado de la entrega" ancho="ancho" onCerrar={cerrar}>
        {cedulaPendiente && (
          <FormEntrega
            cedula={cedulaPendiente}
            local={local}
            onGuardar={(d) => {
              registrarEntrega(cedulaPendiente.id, d);
              terminar();
            }}
            onCancelar={cerrar}
          />
        )}
      </Modal>

      {/* ======================= DOCUMENTACIÓN ======================= */}
      <Modal abierto={abierta === 'registrar-documentacion'} etiqueta="DOCUMENTACIÓN" titulo="Registrar documentación" ancho="ancho" onCerrar={cerrar}>
        <FormDocumento
          local={local}
          onGuardar={(d) => {
            registrarDocumento(local.id, d);
            terminar();
          }}
          onCancelar={cerrar}
        />
      </Modal>

      {/* ======================= PRÓRROGA ======================= */}
      <Modal abierto={abierta === 'otorgar-prorroga'} etiqueta="PRÓRROGA" titulo="Otorgar una prórroga" onCerrar={cerrar}>
        <div className="formulario formulario-modal">
          <div className="bloque-info">
            <strong>{local.nombreLocal}</strong>
            <span>Prórrogas otorgadas hasta ahora: {prorrogasPrevias}</span>
          </div>

          <Campo
            id="pro-dias"
            etiqueta="Días de plazo concedidos"
            tipo="number"
            min={1}
            max={parametros.topeProrrogaDias || undefined}
            valor={form.dias ?? ''}
            onChange={(v) => setForm({ ...form, dias: v })}
            ayuda={
              parametros.topeProrrogaDias
                ? `Tope configurado: ${parametros.topeProrrogaDias} días. PENDIENTE de definición con el área legal.`
                : 'Sin tope configurado.'
            }
          />
          <CampoTexto
            id="pro-motivo"
            etiqueta="Motivo"
            valor={form.motivo ?? ''}
            onChange={(v) => setForm({ ...form, motivo: v })}
            ayuda="Qué pidió el titular. Queda en el historial del local."
          />

          {parametros.maxProrrogasPorLocal > 0 && prorrogasPrevias >= parametros.maxProrrogasPorLocal && (
            <Aviso tipo="alerta" titulo="Este local ya usó su prórroga">
              El máximo configurado es {parametros.maxProrrogasPorLocal} por local. Se puede otorgar igual, pero queda registrado
              como excepción.
            </Aviso>
          )}

          <div className="form-acciones">
            <button
              type="button"
              className="btn-primario"
              disabled={!form.dias || Number(form.dias) < 1 || !form.motivo?.trim()}
              onClick={() => {
                otorgarProrroga(local.id, { dias: form.dias, motivo: form.motivo });
                terminar();
              }}
            >
              Otorgar prórroga
            </button>
            <button type="button" className="btn-secundario" onClick={cerrar}>
              Cancelar
            </button>
          </div>
        </div>
      </Modal>

      {/* ======================= EXPEDIENTE DE MULTA ======================= */}
      <Modal abierto={abierta === 'registrar-expediente'} etiqueta="EXPEDIENTE" titulo="Iniciar expediente de multa" onCerrar={cerrar}>
        <div className="formulario formulario-modal">
          <div className="bloque-info">
            <strong>{local.nombreLocal}</strong>
            <span>
              {local.razonSocial || 'SIN RAZÓN SOCIAL'} · CUIT {local.cuit || 'SIN CUIT'}
            </span>
          </div>

          {faltan.length > 0 && parametros.exigirDatosSiempre && (
            <Aviso tipo="bloqueo" titulo="Faltan datos registrales">
              Falta {faltan.join(', ')}. Un expediente de multa contra un local sin CUIT ni razón social es tan impugnable como una
              notificación. (El sistema viejo no aplicaba esta verificación acá; está como parámetro porque el Anexo B.2 lo deja
              como decisión pendiente del área legal.)
            </Aviso>
          )}

          <Campo
            id="exp-numero"
            etiqueta="N° de expediente"
            valor={form.numero ?? ''}
            onChange={(v) => setForm({ ...form, numero: v })}
            ayuda="Dejalo vacío para que lo asigne el sistema. Se carga a mano si el sistema de expedientes municipales no responde."
          />

          <div className="form-acciones">
            <button
              type="button"
              className="btn-peligro"
              disabled={faltan.length > 0 && parametros.exigirDatosSiempre}
              onClick={() => {
                registrarExpediente(local.id, form.numero?.trim());
                terminar();
              }}
            >
              Iniciar expediente
            </button>
            <button type="button" className="btn-secundario" onClick={cerrar}>
              Cancelar
            </button>
          </div>
        </div>
      </Modal>

      {/* ======================= REINGRESO AL CIRCUITO ======================= */}
      <Modal abierto={abierta === 'reingresar-circuito'} etiqueta="EXPEDIENTE" titulo="Reingresar el local al circuito" onCerrar={cerrar}>
        <div className="formulario formulario-modal">
          <p>
            <strong>{local.nombreLocal}</strong> vuelve a <strong>1° Notificación pendiente</strong> y la intimación arranca de cero.
            El expediente ya iniciado queda en el historial.
          </p>
          <CampoTexto
            id="rei-motivo"
            etiqueta="Motivo del reingreso"
            valor={form.motivo ?? ''}
            onChange={(v) => setForm({ ...form, motivo: v })}
          />
          <div className="form-acciones">
            <button
              type="button"
              className="btn-primario"
              disabled={!form.motivo?.trim()}
              onClick={() => {
                reingresarAlCircuito(local.id, form.motivo);
                terminar();
              }}
            >
              Reingresar
            </button>
            <button type="button" className="btn-secundario" onClick={cerrar}>
              Cancelar
            </button>
          </div>
        </div>
      </Modal>

      {/* ======================= BLOQUEO MANUAL ======================= */}
      <Modal abierto={abierta === 'bloquear'} etiqueta="EXCEPCIÓN" titulo="Bloqueo manual del recálculo" onCerrar={cerrar}>
        <div className="formulario formulario-modal">
          <CampoTexto
            id="blo-motivo"
            etiqueta="Motivo del bloqueo"
            valor={form.motivo ?? ''}
            onChange={(v) => setForm({ ...form, motivo: v })}
            ayuda="Obligatorio. Queda registrado con tu nombre y la fecha, y se muestra en la ficha del local."
          />
          <div className="form-acciones">
            <button
              type="button"
              className="btn-peligro"
              disabled={!form.motivo?.trim()}
              onClick={() => {
                bloquearLocal(local.id, form.motivo.trim());
                terminar();
              }}
            >
              Bloquear
            </button>
            <button type="button" className="btn-secundario" onClick={cerrar}>
              Cancelar
            </button>
          </div>
        </div>
      </Modal>

      <Confirmar
        abierto={abierta === 'desbloquear'}
        titulo="Levantar el bloqueo manual"
        textoConfirmar="Levantar bloqueo"
        onCancelar={cerrar}
        onConfirmar={() => {
          desbloquearLocal(local.id);
          terminar();
        }}
      >
        <p>
          El local vuelve al cálculo automático. Su estado se va a recalcular con todas las actuaciones y los vencimientos que
          pasaron mientras estuvo bloqueado, así que puede cambiar de golpe.
        </p>
        <p className="texto-chico">
          Bloqueado por {local.bloqueadoPor} · motivo: {local.bloqueadoMotivo}
        </p>
      </Confirmar>

      {/* ======================= VISTA DE LA CÉDULA ======================= */}
      <VistaCedula abierto={abierta === 'ver-cedula'} cedula={cedulaPendiente} local={local} onCerrar={cerrar} />
    </>
  );
}

export default AccionesLocal;
