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
     conPadron   (opcional) suma "Dar de baja", que no es un acto del
               circuito sino mantenimiento del padrón. Lo pide el tablero
               (sección 6.1: la bandeja ofrece "dar de baja" sin salir de la
               vista).

   "EDITAR DATOS" va en el menú de TODAS las tablas (modo compacto), para
   quien puede editar el padrón: así se corrige un local desde donde se lo
   está viendo, sin ir a buscarlo al padrón. La ficha no lo repite: tiene su
   propio botón "Editar datos" arriba.
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
import { Link } from 'react-router-dom';
import { puedeEditar, puedeVerRuta } from '../config/modulos';

/* Quiénes dan de baja un local: lo mismo que exige el servidor
   (DELETE /locales/:id). */
const ROLES_BAJA = ['coordinacion', 'administrador'];

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

function AccionesLocal({ local, compacto = false, alTerminar, conPadron = false }) {
  const { rol, usuario } = useRol();
  const datos = useDatos();
  const {
    usuarios,
    localesConEstado,
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
    solicitarExpediente,
    reingresarAlCircuito,
    volverANotificar,
    cerrarLocal,
    reabrirLocal,
    bloquearLocal,
    desbloquearLocal,
    corregirEntrega,
    eliminarLocal,
    permisos,
  } = datos;

  /* `abierta` guarda qué acción se está ejecutando. Un solo estado para todos
     los modales: así no puede haber dos abiertos a la vez. */
  const [abierta, setAbierta] = useState(null);
  const [form, setForm] = useState({});
  // El botón desde el que se abrió el menú (modo compacto). null = cerrado.
  const [anclaMenu, setAnclaMenu] = useState(null);

  const faltan = faltantesRegistrales(local);

  /* La cédula sobre la que operan asignar / entrega / regenerar: la ÚLTIMA
     emitida (con número), si todavía no tiene una entrega efectiva. Incluye
     la que consta como no entregada: sobre esa se reintenta. Una notificación
     pendiente de emisión no tiene número y no es una cédula todavía. */
  const ultimaCedula =
    actuacionesDeLocal(local.id)
      .filter((a) => a.tipo === 'NOTIFICACION' && a.numeroCedula)
      .pop() ?? null;
  const cedulaPendiente =
    ultimaCedula && (!ultimaCedula.resultado || ultimaCedula.resultado === 'NO_ENTREGADA') ? ultimaCedula : null;

  /* Las acciones del estado, menos una: el agente de campo no ve "Registrar
     entrega" en una cédula asignada a otro (el servidor igual se lo negaría). */
  const deOtroAgente =
    ['notificador', 'relevador'].includes(rol) &&
    Boolean(cedulaPendiente?.notificadorId) &&
    cedulaPendiente.notificadorId !== usuario?.id;
  const disponibles = accionesDisponibles(local.estado, rol, local).filter(
    (a) => !(a.id === 'registrar-entrega' && deOtroAgente),
  );

  // `activo` lo manda el backend desde que la lista trae también las bajas.
  // Con `u.activo` a secas, un usuario sin ese dato quedaba afuera y la lista
  // salía vacía.
  const notificadores = usuarios.filter((u) => u.activo !== false && ['notificador', 'relevador'].includes(u.rol));
  // Cuántas cédulas tiene en la calle cada uno, para repartir con criterio.
  // Se cuenta solo con el modal abierto: este componente va en cada fila.
  const enCursoDe = (idUsuario) =>
    abierta === 'asignar-notificador'
      ? (localesConEstado ?? []).filter(
          (l) => l.cedulaEnCurso?.notificadorId === idUsuario && /^NOTIF[12]_(GENERADA|NO_ENTREGADA)$/.test(l.estado),
        ).length
      : 0;
  const prorrogasPrevias = actuacionesDeLocal(local.id).filter((a) => a.tipo === 'PRORROGA').length;

  function abrir(id) {
    // La prórroga arranca con lo que pidió el titular por el portal, si pidió:
    // coordinación lo revisa y lo cambia si hace falta.
    const pedido = local.solicitudProrroga;
    setForm(
      id === 'otorgar-prorroga' && pedido
        ? { dias: pedido.dias ?? '', motivo: `Pedido del titular: ${pedido.motivo}` }
        : {},
    );
    setAbierta(id);
  }

  function cerrar() {
    setAbierta(null);
    setForm({});
    setFaltaDato({});
  }

  /* Los campos obligatorios no desactivan el botón en silencio: al confirmar
     sin completarlos, se marca el campo y se dice qué falta. */
  const [faltaDato, setFaltaDato] = useState({});
  const escribir = (campo, valor) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    setFaltaDato((e) => ({ ...e, [campo]: undefined }));
  };
  function completo(reglas) {
    const e = {};
    for (const [campo, ok, mensaje] of reglas) if (!ok) e[campo] = mensaje;
    setFaltaDato(e);
    return Object.keys(e).length === 0;
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
    if (['coordinacion', 'administrador'].includes(rol))
      opciones.push({ id: 'desbloquear', etiqueta: 'Levantar bloqueo' });
  } else {
    opciones.push(...disponibles);
  }
  /* Ver la cédula emitida, desde cualquier pantalla. Requisito válido para las
     dos alternativas de emisión (sección 9.6). */
  if (cedulaPendiente) opciones.push({ id: 'ver-cedula', etiqueta: 'Ver cédula' });
  // "Completar datos" ya abre el mismo formulario: no se repite.
  if (
    (compacto || conPadron) &&
    puedeEditar(rol, 'locales', permisos) &&
    !local.bloqueado &&
    !disponibles.some((a) => a.id === 'completar-datos')
  ) {
    opciones.push({ id: 'editar-padron', etiqueta: 'Editar datos' });
  }
  if (conPadron && ROLES_BAJA.includes(rol)) opciones.push({ id: 'dar-de-baja', etiqueta: 'Dar de baja' });

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
          <strong>{local.nombreLocal}</strong> queda como <strong>Relevado - Exento</strong>. Es el único estado
          terminal del sistema: el local no vuelve a entrar al circuito de notificaciones.
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
          El relevador lo clasificó como Generador Menor. Al corregirlo, <strong>{local.nombreLocal}</strong> pasa
          directamente a la emisión de la primera notificación.
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
      <Modal
        abierto={abierta === 'completar-datos'}
        etiqueta="PADRÓN"
        titulo="Completar datos del local"
        ancho="ancho"
        onCerrar={cerrar}
      >
        <FormLocal
          local={local}
          onGuardar={async (l) => {
            // Se cierra solo si se guardó: si falla, queda abierto con lo escrito.
            if (await guardarLocal(l)) terminar();
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
            Falta {faltan.join(', ')}. La cédula tiene que individualizar correctamente al sujeto obligado: sin esos
            datos la notificación es impugnable. Completá el padrón y volvé.
          </Aviso>
        ) : (
          <>
            <p>
              Se va a emitir la <strong>{local.estado.startsWith('NOTIF2') ? 'segunda' : 'primera'} cédula</strong> de{' '}
              <strong>{local.nombreLocal}</strong>, con número correlativo.
            </p>
            <Aviso tipo="info" titulo="La emisión no hace correr ningún plazo">
              El cómputo arranca en la entrega efectiva. Después de generar hay que asignar notificador y registrar el
              resultado de la entrega.
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
          Se reemplaza la cédula <strong>{cedulaPendiente?.numeroCedula}</strong> por una nueva, con número nuevo y con
          los datos corregidos del local.
        </p>
        <p className="texto-chico">
          La anterior queda anulada. Se le pide número nuevo porque la vieja ya salió con datos mal y no puede quedar
          circulando con el mismo número.
        </p>
      </Confirmar>

      {/* ======================= ASIGNAR NOTIFICADOR ======================= */}
      <Modal
        abierto={abierta === 'asignar-notificador'}
        etiqueta="NOTIFICACIÓN"
        titulo="Asignar notificador"
        onCerrar={cerrar}
      >
        <div className="formulario formulario-modal">
          <div className="bloque-info">
            <strong>{local.nombreLocal}</strong>
            <span>
              Cédula {cedulaPendiente?.numeroCedula} · {local.direccion}
            </span>
          </div>
          {/* Sin agentes de campo cargados la lista quedaría vacía y no habría
              forma de seguir: se dice por qué y dónde se cargan. */}
          {notificadores.length === 0 ? (
            <Aviso tipo="alerta" titulo="No hay notificadores ni relevadores cargados">
              {puedeVerRuta(rol, '/accesos/usuarios', permisos) ? (
                <Link to="/accesos/usuarios" onClick={cerrar}>
                  Ir a Usuarios
                </Link>
              ) : (
                ''
              )}
            </Aviso>
          ) : (
            <CampoSelect
              id="asig-notificador"
              etiqueta="Notificador"
              valor={form.notificadorId ?? ''}
              onChange={(v) => setForm({ ...form, notificadorId: v })}
              opciones={notificadores.map((u) => ({
                id: u.id,
                etiqueta: `${u.nombre} (${u.rol}) · ${enCursoDe(u.id)} en curso`,
              }))}
              ayuda="Suele ser el mismo agente que releva."
            />
          )}
          <div className="form-acciones">
            <button
              type="button"
              className="btn-primario"
              disabled={!form.notificadorId}
              onClick={async () => {
                if (await asignarNotificador(cedulaPendiente.id, form.notificadorId)) terminar();
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
      <Modal
        abierto={abierta === 'registrar-entrega'}
        etiqueta="NOTIFICACIÓN"
        titulo="Registrar el resultado de la entrega"
        ancho="ancho"
        onCerrar={cerrar}
      >
        {cedulaPendiente && (
          <FormEntrega
            cedula={cedulaPendiente}
            local={local}
            onGuardar={async (d) => {
              const r = await registrarEntrega(cedulaPendiente.id, {
                ...d,
                etiqueta: `Cédula ${cedulaPendiente.numeroCedula} · ${local.nombreLocal}`,
              });
              if (r) terminar();
            }}
            onCancelar={cerrar}
          />
        )}
      </Modal>

      {/* ======================= CORREGIR ENTREGA =======================
          La oficina corrige con motivo (el agente de campo corrige la suya el
          mismo día desde Mis entregas). */}
      <Modal
        abierto={abierta === 'corregir-entrega'}
        etiqueta="NOTIFICACIÓN"
        titulo="Corregir la entrega"
        ancho="ancho"
        onCerrar={cerrar}
      >
        {ultimaCedula && (
          <FormEntrega
            cedula={ultimaCedula}
            local={local}
            correccion
            pideMotivo={!['notificador', 'relevador'].includes(rol)}
            onGuardar={async (d) => {
              if (await corregirEntrega(ultimaCedula.id, d)) terminar();
            }}
            onCancelar={cerrar}
          />
        )}
      </Modal>

      {/* ======================= PADRÓN: editar datos y dar de baja ======================= */}
      <Modal
        abierto={abierta === 'editar-padron'}
        etiqueta="PADRÓN"
        titulo="Editar datos del local"
        ancho="ancho"
        onCerrar={cerrar}
      >
        <FormLocal
          local={local}
          onGuardar={async (l) => {
            if (await guardarLocal(l)) terminar();
          }}
          onCancelar={cerrar}
        />
      </Modal>

      <Confirmar
        abierto={abierta === 'dar-de-baja'}
        titulo="Dar de baja del padrón"
        textoConfirmar="Dar de baja"
        peligro
        onCancelar={cerrar}
        onConfirmar={async () => {
          if (await eliminarLocal(local.id)) terminar();
        }}
      >
        <p>
          <strong>{local.nombreLocal}</strong> deja de aparecer en el padrón y en las bandejas. Sus actuaciones no se
          borran: quedan en la base, marcadas como dadas de baja.
        </p>
        <p className="texto-chico">
          Si es un duplicado, usá Herramientas → Duplicados: unifica el historial en vez de perderlo.
        </p>
      </Confirmar>

      {/* ======================= DOCUMENTACIÓN ======================= */}
      <Modal
        abierto={abierta === 'registrar-documentacion'}
        etiqueta="DOCUMENTACIÓN"
        titulo="Registrar documentación"
        ancho="ancho"
        onCerrar={cerrar}
      >
        <FormDocumento
          local={local}
          onGuardar={async (d) => {
            if (await registrarDocumento(local.id, d)) terminar();
          }}
          onCancelar={cerrar}
        />
      </Modal>

      {/* ======================= PRÓRROGA ======================= */}
      <Modal
        abierto={abierta === 'otorgar-prorroga'}
        etiqueta="PRÓRROGA"
        titulo="Otorgar una prórroga"
        onCerrar={cerrar}
      >
        <div className="formulario formulario-modal">
          <div className="bloque-info">
            <strong>{local.nombreLocal}</strong>
            <span>Prórrogas otorgadas hasta ahora: {prorrogasPrevias}</span>
          </div>

          <Campo
            id="pro-dias"
            etiqueta="Días de plazo concedidos (obligatorio)"
            tipo="number"
            min={1}
            max={parametros.topeProrrogaDias || undefined}
            valor={form.dias ?? ''}
            onChange={(v) => escribir('dias', v)}
            error={faltaDato.dias}
            ayuda={
              parametros.topeProrrogaDias
                ? `Tope configurado: ${parametros.topeProrrogaDias} días. PENDIENTE de definición con el área legal.`
                : 'Sin tope configurado.'
            }
          />
          <CampoTexto
            id="pro-motivo"
            etiqueta="Motivo (obligatorio)"
            valor={form.motivo ?? ''}
            onChange={(v) => escribir('motivo', v)}
            error={faltaDato.motivo}
            ayuda="Qué pidió el titular. Queda en el historial del local."
          />

          {parametros.maxProrrogasPorLocal > 0 && prorrogasPrevias >= parametros.maxProrrogasPorLocal && (
            <Aviso tipo="alerta" titulo="Este local ya usó su prórroga">
              El máximo configurado es {parametros.maxProrrogasPorLocal} por local. Se puede otorgar igual, pero queda
              registrado como excepción.
            </Aviso>
          )}

          <div className="form-acciones">
            <button
              type="button"
              className="btn-primario"
              onClick={async () => {
                if (
                  !completo([
                    ['dias', Number(form.dias) >= 1, 'Indicá cuántos días se conceden.'],
                    [
                      'motivo',
                      form.motivo?.trim(),
                      'Escribí el motivo: es obligatorio y queda en el historial del local.',
                    ],
                  ])
                )
                  return;
                if (await otorgarProrroga(local.id, { dias: form.dias, motivo: form.motivo })) terminar();
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

      {/* ======================= SOLICITAR N° DE EXPEDIENTE =======================
          No inicia nada en la otra dependencia (eso es humano, hoy por correo):
          registra QUE SE PIDIÓ, cuándo, quién y por dónde. Es lo que separa
          "habilitado" (lo decidió el sistema) de "solicitado" (lo decidió una
          persona): sin esa marca nunca se sabría cuántos expedientes esperan
          que alguien los pida. */}
      <Modal
        abierto={abierta === 'solicitar-expediente'}
        etiqueta="EXPEDIENTE"
        titulo="Solicitar el número de expediente"
        onCerrar={cerrar}
      >
        <div className="formulario formulario-modal">
          <div className="bloque-info">
            <strong>{local.nombreLocal}</strong>
            <span>
              {local.razonSocial || 'SIN RAZÓN SOCIAL'} · CUIT {local.cuit || 'SIN CUIT'}
            </span>
          </div>

          <p className="texto-chico">
            El pedido a la dependencia se hace por fuera del sistema
            {parametros.correoSolicitudExpedientes ? (
              <>
                {' '}
                (correo: <strong>{parametros.correoSolicitudExpedientes}</strong>)
              </>
            ) : (
              <> (por correo, por teléfono o en persona)</>
            )}
            . Acá queda la constancia: fecha, agente y canal.
          </p>

          <CampoSelect
            id="sol-canal"
            etiqueta="¿Por qué canal se pidió?"
            valor={form.canal ?? ''}
            onChange={(v) => setForm({ ...form, canal: v })}
            opciones={[
              { id: 'correo', etiqueta: 'Correo electrónico' },
              { id: 'telefono', etiqueta: 'Teléfono' },
              { id: 'presencial', etiqueta: 'En persona' },
              { id: 'otro', etiqueta: 'Otro' },
            ]}
            error={faltaDato.canal}
          />
          <CampoTexto
            id="sol-obs"
            etiqueta="Observaciones (opcional)"
            valor={form.observaciones ?? ''}
            onChange={(v) => setForm({ ...form, observaciones: v })}
            ayuda="A quién se le pidió, referencia del correo, lo que ayude a seguirlo."
          />

          <div className="form-acciones">
            <button
              type="button"
              className="btn-primario"
              onClick={async () => {
                if (!completo([['canal', form.canal, 'Indicá por qué canal se pidió el número.']])) return;
                if (await solicitarExpediente(local.id, form.canal, form.observaciones?.trim() ?? '')) terminar();
              }}
            >
              Registrar la solicitud
            </button>
            <button type="button" className="btn-secundario" onClick={cerrar}>
              Cancelar
            </button>
          </div>
        </div>
      </Modal>

      {/* ======================= EXPEDIENTE DE MULTA ======================= */}
      <Modal
        abierto={abierta === 'registrar-expediente'}
        etiqueta="EXPEDIENTE"
        titulo="Iniciar expediente de multa"
        onCerrar={cerrar}
      >
        <div className="formulario formulario-modal">
          <div className="bloque-info">
            <strong>{local.nombreLocal}</strong>
            <span>
              {local.razonSocial || 'SIN RAZÓN SOCIAL'} · CUIT {local.cuit || 'SIN CUIT'}
            </span>
          </div>

          {faltan.length > 0 && parametros.exigirDatosSiempre && (
            <Aviso tipo="bloqueo" titulo="Faltan datos registrales">
              Falta {faltan.join(', ')}. Un expediente de multa contra un local sin CUIT ni razón social es tan
              impugnable como una notificación.
            </Aviso>
          )}

          {form.ratificando ? (
            /* >>> LA RATIFICACIÓN <<< El número se muestra tal como se va a
               guardar: asignarle a un comercio el expediente de otro es el
               error más caro que puede cometerse acá. */
            <>
              <Aviso tipo="alerta" titulo="Revisá antes de guardar">
                El expediente de <strong>{local.nombreLocal}</strong> queda con el número{' '}
                <strong style={{ fontSize: '1.2rem' }}>{form.numero?.trim()}</strong>. ¿Es correcto?
              </Aviso>
              <div className="form-acciones">
                <button
                  type="button"
                  className="btn-peligro"
                  onClick={async () => {
                    if (await registrarExpediente(local.id, form.numero?.trim())) terminar();
                    else setForm({ ...form, ratificando: false });
                  }}
                >
                  Sí, iniciar con el {form.numero?.trim()}
                </button>
                <button type="button" className="btn-secundario" onClick={() => setForm({ ...form, ratificando: false })}>
                  No, volver
                </button>
              </div>
            </>
          ) : (
            <>
              <Campo
                id="exp-numero"
                etiqueta="N° de expediente (obligatorio)"
                valor={form.numero ?? ''}
                onChange={(v) => setForm({ ...form, numero: v })}
                ayuda={`Formato número/año, por ejemplo 175079/${new Date().getFullYear()}. ¿Todavía no llegó? Usá «Solicitar N° de expediente»: un expediente no se inicia con un número de prueba.`}
              />

              <div className="form-acciones">
                <button
                  type="button"
                  className="btn-peligro"
                  disabled={!form.numero?.trim() || (faltan.length > 0 && parametros.exigirDatosSiempre)}
                  onClick={() => setForm({ ...form, ratificando: true })}
                >
                  Continuar
                </button>
                <button type="button" className="btn-secundario" onClick={cerrar}>
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ======================= REINGRESO AL CIRCUITO ======================= */}
      <Modal
        abierto={abierta === 'reingresar-circuito'}
        etiqueta="EXPEDIENTE"
        titulo="Reingresar el local al circuito"
        onCerrar={cerrar}
      >
        <div className="formulario formulario-modal">
          <p>
            <strong>{local.nombreLocal}</strong> vuelve a <strong>1° Notificación pendiente</strong> y la intimación
            arranca de cero. El expediente ya iniciado queda en el historial.
          </p>
          <CampoTexto
            id="rei-motivo"
            etiqueta="Motivo del reingreso (obligatorio)"
            valor={form.motivo ?? ''}
            onChange={(v) => escribir('motivo', v)}
            error={faltaDato.motivo}
          />
          <div className="form-acciones">
            <button
              type="button"
              className="btn-primario"
              onClick={async () => {
                if (
                  !completo([
                    [
                      'motivo',
                      form.motivo?.trim(),
                      'Escribí el motivo: es obligatorio y queda en el historial del local.',
                    ],
                  ])
                )
                  return;
                if (await reingresarAlCircuito(local.id, form.motivo)) terminar();
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

      {/* ======================= VOLVER A NOTIFICAR =======================
          Para los locales que llegaron a expediente sin las dos entregas
          efectivas (ver la acción en dominio/reglas.js). */}
      <Modal
        abierto={abierta === 'volver-a-notificar'}
        etiqueta="EXPEDIENTE"
        titulo="Volver a notificar"
        onCerrar={cerrar}
      >
        <div className="formulario formulario-modal">
          <p>
            En <strong>{local.nombreLocal}</strong> no constan las dos notificaciones entregadas, y sin eso no se puede
            iniciar el expediente de multa. Vuelve a <strong>1° Notificación pendiente</strong> y la intimación arranca
            de cero. Lo anterior queda en el historial.
          </p>
          <CampoTexto
            id="vol-motivo"
            etiqueta="Motivo (obligatorio)"
            valor={form.motivo ?? ''}
            onChange={(v) => escribir('motivo', v)}
            error={faltaDato.motivo}
            ayuda="Por ejemplo: la 2° notificación nunca se entregó (dato de AppSheet)."
          />
          <div className="form-acciones">
            <button
              type="button"
              className="btn-primario"
              onClick={async () => {
                if (
                  !completo([
                    [
                      'motivo',
                      form.motivo?.trim(),
                      'Escribí el motivo: es obligatorio y queda en el historial del local.',
                    ],
                  ])
                )
                  return;
                if (await volverANotificar(local.id, form.motivo.trim())) terminar();
              }}
            >
              Volver a notificar
            </button>
            <button type="button" className="btn-secundario" onClick={cerrar}>
              Cancelar
            </button>
          </div>
        </div>
      </Modal>

      {/* ======================= EL COMERCIO CERRÓ / VOLVIÓ A ABRIR =======================
          Solo el administrador (ver las acciones en dominio/reglas.js). */}
      {['cerrar-local', 'reabrir-local'].map((id) => {
        const esCierre = id === 'cerrar-local';
        return (
          <Modal
            key={id}
            abierto={abierta === id}
            etiqueta="PADRÓN"
            titulo={esCierre ? 'Marcar el local como cerrado' : 'Reabrir el local'}
            onCerrar={cerrar}
          >
            <div className="formulario formulario-modal">
              <p>
                {esCierre ? (
                  <>
                    <strong>{local.nombreLocal}</strong> deja de aparecer en el padrón, el mapa y las bandejas. No se
                    borra nada: conserva su historial y se puede reabrir. Se encuentra en el padrón con Situación →
                    Cerrados.
                  </>
                ) : (
                  <>
                    <strong>{local.nombreLocal}</strong> vuelve al padrón, al estado que le corresponde por sus
                    trámites.
                  </>
                )}
              </p>
              <CampoTexto
                id={`${id}-motivo`}
                etiqueta="Motivo (obligatorio)"
                valor={form.motivo ?? ''}
                onChange={(v) => escribir('motivo', v)}
                error={faltaDato.motivo}
                ayuda={
                  esCierre
                    ? 'Por ejemplo: el comercio cerró, verificado en el relevamiento del 20/10.'
                    : 'Por ejemplo: se marcó cerrado por error, o volvió a abrir.'
                }
              />
              <div className="form-acciones">
                <button
                  type="button"
                  className={esCierre ? 'btn-peligro' : 'btn-primario'}
                  onClick={async () => {
                    if (
                      !completo([
                        [
                          'motivo',
                          form.motivo?.trim(),
                          'Escribí el motivo: es obligatorio y queda en el historial del local.',
                        ],
                      ])
                    )
                      return;
                    const hecho = esCierre
                      ? await cerrarLocal(local.id, form.motivo.trim())
                      : await reabrirLocal(local.id, form.motivo.trim());
                    if (hecho) terminar();
                  }}
                >
                  {esCierre ? 'Marcar como cerrado' : 'Reabrir'}
                </button>
                <button type="button" className="btn-secundario" onClick={cerrar}>
                  Cancelar
                </button>
              </div>
            </div>
          </Modal>
        );
      })}

      {/* ======================= BLOQUEO MANUAL ======================= */}
      <Modal
        abierto={abierta === 'bloquear'}
        etiqueta="EXCEPCIÓN"
        titulo="Bloqueo manual del recálculo"
        onCerrar={cerrar}
      >
        <div className="formulario formulario-modal">
          <CampoTexto
            id="blo-motivo"
            etiqueta="Motivo del bloqueo (obligatorio)"
            valor={form.motivo ?? ''}
            onChange={(v) => escribir('motivo', v)}
            error={faltaDato.motivo}
            ayuda="Obligatorio. Queda registrado con tu nombre y la fecha, y se muestra en la ficha del local."
          />
          <div className="form-acciones">
            <button
              type="button"
              className="btn-peligro"
              onClick={async () => {
                if (
                  !completo([
                    [
                      'motivo',
                      form.motivo?.trim(),
                      'Escribí el motivo: es obligatorio y queda en el historial del local.',
                    ],
                  ])
                )
                  return;
                if (await bloquearLocal(local.id, form.motivo.trim())) terminar();
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
          El local vuelve al cálculo automático. Su estado se va a recalcular con todas las actuaciones y los
          vencimientos que pasaron mientras estuvo bloqueado, así que puede cambiar de golpe.
        </p>
        <p className="texto-chico">
          Bloqueado por {usuarios.find((u) => u.id === local.bloqueadoPor)?.nombre ?? local.bloqueadoPor ?? '—'} ·
          motivo: {local.bloqueadoMotivo}
        </p>
      </Confirmar>

      {/* ======================= VISTA DE LA CÉDULA ======================= */}
      <VistaCedula abierto={abierta === 'ver-cedula'} cedula={cedulaPendiente} local={local} onCerrar={cerrar} />
    </>
  );
}

export default AccionesLocal;
