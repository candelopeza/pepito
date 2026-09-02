import { useMemo, useState } from 'react';

import {
  Stepper,
  Step,
  StepLabel,
} from '@mui/material';

import {
  DataGrid,
  GridToolbar,
  GridActionsCellItem,
  useGridApiRef,
} from '@mui/x-data-grid';

import { esES } from '@mui/x-data-grid/locales';

import AddIcon from '@mui/icons-material/Add';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EditIcon from '@mui/icons-material/Edit';

import PageHeader from '../components/ui/PageHeader';


/* =========================================================
   PASOS DEL STEPPER
   ========================================================= */

const PASOS = [
  'Seleccionar local',
  'Situación del proceso',
  'Documento',
];


/* =========================================================
   DATOS DE PRUEBA DE LA TABLA

   Después estos datos vendrán del backend.
   ========================================================= */

const DOCUMENTACION_INICIAL = [
  {
    id: 1,
    local: 'Supermercado Norte',
    tipo: 'Declaración Jurada',
    tramiteOrigen: 'Primera Notificación',
    numero: 'DDJJ-00125',
    fechaPresentacion: new Date(2026, 7, 10),
    fechaVencimiento: new Date(2027, 7, 10),
    estado: 'Vigente',
    usuario: 'candelaria',
  },
  {
    id: 2,
    local: 'Industria Sur',
    tipo: 'Contrato',
    tramiteOrigen: 'Segunda Notificación',
    numero: 'CONT-0048',
    fechaPresentacion: new Date(2026, 6, 15),
    fechaVencimiento: new Date(2026, 11, 15),
    estado: 'Vigente',
    usuario: 'mariano',
  },
  {
    id: 3,
    local: 'Hotel Plaza',
    tipo: 'Declaración Jurada',
    tramiteOrigen: 'Primera Notificación',
    numero: 'DDJJ-00098',
    fechaPresentacion: new Date(2025, 5, 20),
    fechaVencimiento: new Date(2026, 5, 20),
    estado: 'Vencida',
    usuario: 'jorge',
  },
];


/* =========================================================
   COLORES PARA LOS ESTADOS
   ========================================================= */

const COLOR_ESTADO = {
  Vigente: 'verde',
  Vencida: 'rojo',
  'Pendiente de Revisión': 'amarillo',
};


/* =========================================================
   LOCALES DE PRUEBA

   Después vendrán de:
   GET /api/locales
   ========================================================= */

const LOCALES_PRUEBA = [
  {
    id: 1,
    nombre: 'Polo',
  },
  {
    id: 2,
    nombre: 'Norte',
  },
  {
    id: 3,
    nombre: 'Centro',
  },
];


/* =========================================================
   SITUACIONES DE PRUEBA

   Esto simula lo que más adelante devolverá el backend.

   Cada local puede encontrarse en una situación diferente.
   ========================================================= */

const SITUACIONES_PRUEBA = {

  /* -------------------------------------------------------
     POLO

     Ya fue relevado como Gran Generador.
     Primera Notificación entregada.
     Puede presentar documentación.
     ------------------------------------------------------- */

  1: {
    local: {
      id: 1,
      nombre: 'Polo',
    },

    puedeRegistrar: true,

    tramiteOrigen: 'Primera Notificación',

    historial: [
      {
        etapa: 'Relevamiento',
        estado: 'Gran Generador',
        completado: true,
      },
      {
        etapa: 'Primera Notificación',
        estado: 'Entregada',
        completado: true,
      },
      {
        etapa: 'Documentación',
        estado: 'Habilitada',
        completado: false,
      },
    ],

    documentosHabilitados: [
      {
        id: 1,
        nombre: 'Declaración Jurada',
      },
      {
        id: 2,
        nombre: 'Contrato',
      },
    ],
  },


  /* -------------------------------------------------------
     NORTE

     Está todavía en relevamiento.
     NO corresponde documentación.
     ------------------------------------------------------- */

  2: {
    local: {
      id: 2,
      nombre: 'Norte',
    },

    puedeRegistrar: false,

    tramiteOrigen: null,

    historial: [
      {
        etapa: 'Relevamiento',
        estado: 'Pendiente de Revisión',
        completado: false,
      },
    ],

    documentosHabilitados: [],
  },


  /* -------------------------------------------------------
     CENTRO

     Primera notificación entregada.
     Ya presentó DDJJ.
     Solo queda habilitado Contrato.

     Esto sirve para demostrar que no se vuelve a ofrecer
     un documento ya registrado para esa instancia.
     ------------------------------------------------------- */

  3: {
    local: {
      id: 3,
      nombre: 'Centro',
    },

    puedeRegistrar: true,

    tramiteOrigen: 'Primera Notificación',

    historial: [
      {
        etapa: 'Relevamiento',
        estado: 'Gran Generador',
        completado: true,
      },
      {
        etapa: 'Primera Notificación',
        estado: 'Entregada',
        completado: true,
      },
      {
        etapa: 'Declaración Jurada',
        estado: 'Ya presentada',
        completado: true,
      },
      {
        etapa: 'Documentación',
        estado: 'Contrato habilitado',
        completado: false,
      },
    ],

    documentosHabilitados: [
      {
        id: 2,
        nombre: 'Contrato',
      },
    ],
  },
};


/* =========================================================
   COMPONENTE
   ========================================================= */

function Documentacion() {

  /* -------------------------------------------------------
     API DEL DATAGRID
     ------------------------------------------------------- */

  const apiRef = useGridApiRef();


  /* -------------------------------------------------------
     TABLA
     ------------------------------------------------------- */

  const [documentacion, setDocumentacion] =
    useState(DOCUMENTACION_INICIAL);


  /* -------------------------------------------------------
     MODAL Y STEPPER
     ------------------------------------------------------- */

  const [modalAbierto, setModalAbierto] = useState(false);

  const [pasoActivo, setPasoActivo] = useState(0);


  /* -------------------------------------------------------
     LOCAL SELECCIONADO
     ------------------------------------------------------- */

  const [localSeleccionado, setLocalSeleccionado] =
    useState('');


  /* -------------------------------------------------------
     SITUACIÓN DEL PROCESO

     Acá vamos a guardar lo que en el futuro responda
     el backend.
     ------------------------------------------------------- */

  const [situacion, setSituacion] = useState(null);


  /* -------------------------------------------------------
     DATOS DEL DOCUMENTO
     ------------------------------------------------------- */

  const [tipoDocumento, setTipoDocumento] = useState('');

  const [numero, setNumero] = useState('');

  const [fechaPresentacion, setFechaPresentacion] =
    useState('');

  const [fechaVencimiento, setFechaVencimiento] =
    useState('');

  const [observaciones, setObservaciones] =
    useState('');


  /* =======================================================
     COLUMNAS DE LA GRILLA
     ======================================================= */

  const columnas = useMemo(
    () => [

      {
        field: 'local',
        headerName: 'Local',
        flex: 1,
        minWidth: 180,
      },

      {
        field: 'tipo',
        headerName: 'Tipo de Documentación',
        flex: 1,
        minWidth: 190,
      },

      {
        field: 'tramiteOrigen',
        headerName: 'Trámite Origen',
        flex: 1,
        minWidth: 190,
      },

      {
        field: 'numero',
        headerName: 'Número',
        width: 150,
      },

      {
        field: 'fechaPresentacion',
        headerName: 'Fecha Presentación',
        type: 'date',
        width: 170,

        valueFormatter: (value) =>
          value
            ? value.toLocaleDateString('es-AR')
            : '',
      },

      {
        field: 'fechaVencimiento',
        headerName: 'Fecha Vencimiento',
        type: 'date',
        width: 170,

        valueFormatter: (value) =>
          value
            ? value.toLocaleDateString('es-AR')
            : '',
      },

      {
        field: 'estado',
        headerName: 'Estado',
        width: 170,

        renderCell: ({ value }) => (
          <span
            className={
              `badge badge-${COLOR_ESTADO[value] ?? 'gris'}`
            }
          >
            {value}
          </span>
        ),
      },

      {
        field: 'usuario',
        headerName: 'Usuario',
        width: 150,
      },

      {
        field: 'acciones',
        headerName: 'Acciones',
        type: 'actions',
        width: 110,

        getActions: () => [

          <GridActionsCellItem
            key="ver"
            icon={
              <VisibilityIcon fontSize="small" />
            }
            label="Ver"
            title="Ver"
          />,

          <GridActionsCellItem
            key="editar"
            icon={
              <EditIcon fontSize="small" />
            }
            label="Editar"
            title="Editar"
          />,

        ],
      },

    ],
    [],
  );


  /* =======================================================
     IMPRIMIR
     ======================================================= */

  const imprimir = () => {
    apiRef.current?.exportDataAsPrint();
  };


  /* =======================================================
     DESCARGAR CSV
     ======================================================= */

  const descargar = () => {

    apiRef.current?.exportDataAsCsv({
      fileName: 'documentacion',
    });

  };


  /* =======================================================
     ABRIR MODAL
     ======================================================= */

  const abrirModal = () => {

    setModalAbierto(true);

    setPasoActivo(0);

  };


  /* =======================================================
     CERRAR Y LIMPIAR MODAL
     ======================================================= */

  const cerrarModal = () => {

    setModalAbierto(false);

    setPasoActivo(0);

    setLocalSeleccionado('');

    setSituacion(null);

    setTipoDocumento('');

    setNumero('');

    setFechaPresentacion('');

    setFechaVencimiento('');

    setObservaciones('');

  };


  /* =======================================================
     CONSULTAR SITUACIÓN DEL LOCAL

     POR AHORA:
     Busca dentro de SITUACIONES_PRUEBA.

     MÁS ADELANTE:
     Acá va a estar el fetch al backend.
     ======================================================= */

  const consultarSituacion = () => {

    if (!localSeleccionado) {
      return;
    }

    const datos =
      SITUACIONES_PRUEBA[localSeleccionado];

    setSituacion(datos);

    setPasoActivo(1);

  };


  /* =======================================================
     GUARDAR DOCUMENTO

     Por ahora lo agrega solamente al estado de React.

     Después:
     POST /api/documentacion
     ======================================================= */

  const guardarDocumento = (e) => {

    e.preventDefault();


    const documentoElegido =
      situacion.documentosHabilitados.find(
        (doc) =>
          String(doc.id) ===
          String(tipoDocumento)
      );


    if (!documentoElegido) {
      return;
    }


    const nuevoDocumento = {

      id:
        documentacion.reduce(
          (max, doc) =>
            Math.max(max, doc.id),
          0
        ) + 1,

      local:
        situacion.local.nombre,

      tipo:
        documentoElegido.nombre,

      tramiteOrigen:
        situacion.tramiteOrigen,

      numero,

      fechaPresentacion:
        fechaPresentacion
          ? new Date(
              `${fechaPresentacion}T00:00:00`
            )
          : null,

      fechaVencimiento:
        fechaVencimiento
          ? new Date(
              `${fechaVencimiento}T00:00:00`
            )
          : null,

      /* Por ahora entra pendiente de revisión.
         Después el backend determinará el estado. */

      estado:
        'Pendiente de Revisión',

      /* Después sale de la sesión */

      usuario:
        'candelaria',

      observaciones,
    };


    setDocumentacion(
      (prev) => [
        ...prev,
        nuevoDocumento,
      ]
    );


    cerrarModal();

  };


  /* =======================================================
     RENDER
     ======================================================= */

  return (
    <>

      {/* ===================================================
          ENCABEZADO
          =================================================== */}

      <PageHeader
        etiqueta="DOCUMENTACIÓN"
        titulo="GESTIÓN DE DOCUMENTACIÓN"
        botonVolver
      />


      {/* ===================================================
          BOTONES SUPERIORES
          =================================================== */}

      <div className="tabla-acciones">

        <div className="tabla-botones">

          {/* REGISTRAR DOCUMENTACIÓN */}

          <button
            type="button"
            className="btn-icono btn-icono-azul"
            title="Registrar documentación"
            onClick={abrirModal}
          >
            <AddIcon fontSize="small" />
          </button>


          {/* IMPRIMIR */}

          <button
            type="button"
            className="btn-icono btn-icono-verde"
            title="Imprimir"
            onClick={imprimir}
          >
            <PrintIcon fontSize="small" />
          </button>


          {/* DESCARGAR */}

          <button
            type="button"
            className="btn-icono btn-icono-azul"
            title="Descargar CSV"
            onClick={descargar}
          >
            <DownloadIcon fontSize="small" />
          </button>

        </div>

      </div>


      {/* ===================================================
          GRILLA
          =================================================== */}

      <div className="grilla-contenedor">

        <DataGrid

          apiRef={apiRef}

          rows={documentacion}

          columns={columnas}

          showToolbar

          slots={{
            toolbar: GridToolbar,
          }}

          slotProps={{
            toolbar: {

              showQuickFilter: false,

              csvOptions: {
                fileName: 'documentacion',
              },

            },
          }}

          localeText={
            esES.components
              .MuiDataGrid
              .defaultProps
              .localeText
          }

          initialState={{
            pagination: {
              paginationModel: {
                pageSize: 10,
              },
            },
          }}

          pageSizeOptions={[
            5,
            10,
            25,
            50,
          ]}

          disableRowSelectionOnClick

          sx={{

            border: 'none',

            fontFamily: 'inherit',

            '& .MuiDataGrid-columnHeader': {
              backgroundColor: '#1976d2',
              color: '#fff',
            },

            '& .MuiDataGrid-columnHeaderTitle': {
              fontWeight: 700,
            },

            '& .MuiDataGrid-columnHeader .MuiSvgIcon-root': {
              color: '#fff',
            },

            '& .MuiDataGrid-columnSeparator': {
              color:
                'rgba(255,255,255,0.4)',
            },

            '& .MuiDataGrid-row:hover': {
              backgroundColor: '#f8fafc',
            },

            '& .MuiDataGrid-cell': {
              fontSize: 14,
              color: '#444',
            },

          }}

        />

      </div>


      {/* ===================================================
          MODAL
          =================================================== */}

      {modalAbierto && (

        <div className="modal-fondo">

          <div
            className="
              modal-caja
              modal-documentacion
            "
          >

            {/* =============================================
                ENCABEZADO MODAL
                ============================================= */}

            <div className="modal-encabezado">

              <div>

                <span className="modal-etiqueta">
                  DOCUMENTACIÓN
                </span>

                <h2 className="modal-titulo">
                  Registrar documentación
                </h2>

              </div>


              <button
                type="button"
                className="modal-cerrar"
                onClick={cerrarModal}
              >
                ×
              </button>

            </div>


            {/* =============================================
                CUERPO MODAL
                ============================================= */}

            <div className="modal-cuerpo">


              {/* ===========================================
                  STEPPER
                  =========================================== */}

              <Stepper
                activeStep={pasoActivo}
                alternativeLabel
                className="documentacion-stepper"
              >

                {PASOS.map(
                  (paso) => (

                    <Step key={paso}>

                      <StepLabel>
                        {paso}
                      </StepLabel>

                    </Step>

                  )
                )}

              </Stepper>


              {/* ===========================================
                  PASO 1
                  SELECCIONAR LOCAL
                  =========================================== */}

              {pasoActivo === 0 && (

                <div className="paso-documentacion">

                  <div className="paso-encabezado">

                    <h3>
                      Seleccionar establecimiento
                    </h3>

                    <p>
                      Seleccione el local para
                      consultar su situación actual
                      y determinar qué documentación
                      se encuentra habilitada.
                    </p>

                  </div>


                  <div className="form-grupo">

                    <label htmlFor="local">
                      Local
                    </label>

                    <select
                      id="local"
                      value={localSeleccionado}

                      onChange={(e) =>
                        setLocalSeleccionado(
                          e.target.value
                        )
                      }
                    >

                      <option value="">
                        Seleccionar establecimiento
                      </option>


                      {LOCALES_PRUEBA.map(
                        (local) => (

                          <option
                            key={local.id}
                            value={local.id}
                          >
                            {local.nombre}
                          </option>

                        )
                      )}

                    </select>

                  </div>


                  <div className="form-acciones">

                    <button
                      type="button"
                      className="btn-secundario"
                      onClick={cerrarModal}
                    >
                      Cancelar
                    </button>


                    <button
                      type="button"
                      className="btn-primario"

                      disabled={
                        !localSeleccionado
                      }

                      onClick={
                        consultarSituacion
                      }
                    >
                      Continuar
                    </button>

                  </div>

                </div>

              )}


              {/* ===========================================
                  PASO 2
                  SITUACIÓN DEL PROCESO
                  =========================================== */}

              {pasoActivo === 1 &&
                situacion && (

                <div className="paso-documentacion">

                  <div className="paso-encabezado">

                    <h3>
                      Situación del proceso
                    </h3>

                    <p>
                      El sistema determinó
                      la etapa actual del
                      establecimiento a partir
                      de su historial.
                    </p>

                  </div>


                  {/* LOCAL */}

                  <div className="local-seleccionado">

                    <span className="local-seleccionado-label">
                      LOCAL
                    </span>

                    <strong>
                      {
                        situacion.local
                          .nombre
                      }
                    </strong>

                  </div>


                  {/* HISTORIAL */}

                  <div className="historial-proceso">

                    {
                      situacion.historial.map(
                        (item, index) => (

                          <div
                            key={index}

                            className={
                              `historial-item ${
                                item.completado
                                  ? 'historial-completado'
                                  : 'historial-actual'
                              }`
                            }
                          >

                            <div className="historial-icono">

                              {
                                item.completado
                                  ? '✓'
                                  : '●'
                              }

                            </div>


                            <div>

                              <span className="historial-etapa">
                                {item.etapa}
                              </span>

                              <span className="historial-estado">
                                {item.estado}
                              </span>

                            </div>

                          </div>

                        )
                      )
                    }

                  </div>


                  {/* MENSAJE SEGÚN SITUACIÓN */}

                  {
                    situacion.puedeRegistrar
                      ? (

                      <div className="mensaje-habilitado">

                        <strong>
                          Documentación habilitada
                        </strong>

                        <span>
                          El proceso permite
                          registrar documentación
                          para este establecimiento.
                        </span>

                      </div>

                    )
                      : (

                      <div className="mensaje-bloqueado">

                        <strong>
                          Documentación no habilitada
                        </strong>

                        <span>
                          El establecimiento todavía
                          no alcanzó una etapa que
                          permita registrar
                          documentación.
                        </span>

                      </div>

                    )
                  }


                  {/* BOTONES */}

                  <div className="form-acciones">

                    <button
                      type="button"
                      className="btn-secundario"

                      onClick={() =>
                        setPasoActivo(0)
                      }
                    >
                      Volver
                    </button>


                    {
                      situacion.puedeRegistrar && (

                        <button
                          type="button"
                          className="btn-primario"

                          onClick={() =>
                            setPasoActivo(2)
                          }
                        >
                          Continuar
                        </button>

                      )
                    }

                  </div>

                </div>

              )}


              {/* ===========================================
                  PASO 3
                  DATOS DEL DOCUMENTO
                  =========================================== */}

              {pasoActivo === 2 &&
                situacion && (

                <form
                  className="paso-documentacion"
                  onSubmit={guardarDocumento}
                >

                  <div className="paso-encabezado">

                    <h3>
                      Datos de la documentación
                    </h3>

                    <p>
                      Complete los datos
                      correspondientes al
                      documento presentado.
                    </p>

                  </div>


                  {/* TIPO */}

                  <div className="form-grupo">

                    <label htmlFor="tipoDocumento">
                      Tipo de documentación
                    </label>

                    <select
                      id="tipoDocumento"
                      required

                      value={
                        tipoDocumento
                      }

                      onChange={(e) =>
                        setTipoDocumento(
                          e.target.value
                        )
                      }
                    >

                      <option value="">
                        Seleccionar
                      </option>


                      {
                        situacion
                          .documentosHabilitados
                          .map(
                            (documento) => (

                              <option
                                key={
                                  documento.id
                                }
                                value={
                                  documento.id
                                }
                              >
                                {
                                  documento.nombre
                                }
                              </option>

                            )
                          )
                      }

                    </select>

                  </div>


                  {/* NÚMERO */}

                  <div className="form-grupo">

                    <label htmlFor="numero">
                      Número
                    </label>

                    <input
                      id="numero"
                      type="text"

                      value={numero}

                      onChange={(e) =>
                        setNumero(
                          e.target.value
                        )
                      }
                    />

                  </div>


                  {/* FECHAS */}

                  <div className="documentacion-fechas">

                    <div className="form-grupo">

                      <label htmlFor="fechaPresentacion">
                        Fecha de presentación
                      </label>

                      <input
                        id="fechaPresentacion"
                        type="date"

                        value={
                          fechaPresentacion
                        }

                        onChange={(e) =>
                          setFechaPresentacion(
                            e.target.value
                          )
                        }
                      />

                    </div>


                    <div className="form-grupo">

                      <label htmlFor="fechaVencimiento">
                        Fecha de vencimiento
                      </label>

                      <input
                        id="fechaVencimiento"
                        type="date"

                        value={
                          fechaVencimiento
                        }

                        onChange={(e) =>
                          setFechaVencimiento(
                            e.target.value
                          )
                        }
                      />

                    </div>

                  </div>


                  {/* OBSERVACIONES */}

                  <div className="form-grupo">

                    <label htmlFor="observaciones">
                      Observaciones
                    </label>

                    <textarea
                      id="observaciones"
                      rows="4"

                      className="textarea-formulario"

                      value={
                        observaciones
                      }

                      onChange={(e) =>
                        setObservaciones(
                          e.target.value
                        )
                      }
                    />

                  </div>


                  {/* BOTONES */}

                  <div className="form-acciones">

                    <button
                      type="button"
                      className="btn-secundario"

                      onClick={() =>
                        setPasoActivo(1)
                      }
                    >
                      Volver
                    </button>


                    <button
                      type="submit"
                      className="btn-primario"
                    >
                      Guardar
                    </button>

                  </div>

                </form>

              )}

            </div>

          </div>

        </div>

      )}

    </>
  );

}


export default Documentacion;