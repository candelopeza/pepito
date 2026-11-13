# Backend Grandes Generadores: cómo está armado y cómo seguir

API en **Node + Express 5** sobre la base **MariaDB `smt_grandes_generadores`**,
que se administra con **HeidiSQL**. Este documento explica qué hay en cada
archivo, por qué está ahí y cómo ponerlo en marcha.

> **Si venís de la versión anterior de este documento:** el backend se escribió
> primero contra un esquema inventado a partir de los datos de prueba del front
> (tablas `locales`, `actuaciones`, `relevamientos`). Ese esquema **no existe**.
> La base real es la del área, con 2.220 locales y 2.441 trámites cargados, y
> el backend se adaptó a ella. Los scripts `sql/01-crear-tablas.sql` y
> `sql/02-datos-iniciales.sql` quedaron obsoletos: **no correrlos nunca**, el
> primero empieza con un `DROP TABLE` de diez tablas.

## 1. Qué hay en la carpeta

```
backend/
├── package.json              dependencias y scripts del servidor (aparte del front)
├── servidor.js               ARRANQUE: crea Express, monta rutas, escucha el puerto
├── conexion-bd.js            la conexión a MariaDB (pool) y las funciones para consultar
├── mapeo.js                  *** EL PUENTE entre el esquema de la base y el front ***
├── parametros-sistema.js     plazos, topes y plantilla de la cédula (no están en la base)
├── consultas.js              las lecturas y escrituras que usa más de una ruta
├── actos.js                  *** EL CONTROL DE CADA ACTO: estado, rol, bloqueo y auditoría ***
├── auditoria.js              el historial de cambios de estado (tabla opcional auditoria)
├── capacidades.js            qué scripts opcionales de sql/ están corridos en la base
├── geocodificador.js         de dónde sale la coordenada del padrón (hoy: de ningún lado)
├── archivos.js               las fotos de las entregas (tabla opcional archivo + carpeta)
├── tareas-programadas.js     lo que corre solo todos los días a las 00:05
├── probar-conexion.js        diagnóstico: npm run probar
├── inspeccionar-base.js      radiografía del esquema: npm run inspeccionar
├── .env                      credenciales de la base y puerto. NO se sube a git
├── .env.ejemplo              copia del .env sin datos reales, para el repo
├── middlewares/
│   └── usuario.js            quién pide y con qué rol; requiereRol() para proteger rutas
├── rutas/                    un archivo por recurso
│   ├── locales.js               padrón, bloqueo
│   ├── relevamientos.js         campo y control administrativo
│   ├── notificaciones.js        cédulas: emisión, impresión, asignación, entrega
│   ├── documentacion.js         DDJJ y contratos, validación del portal
│   ├── prorrogas-expedientes.js prórroga, expediente de multa, reingreso
│   ├── configuracion.js         usuarios, rubros, feriados, parámetros, plantilla, accesos
│   ├── herramientas.js          fusiones, geocodificación, informe 9 de Julio, recálculo
│   └── archivos.js              ver una foto guardada
├── sql/
│   ├── 01-crear-tablas.sql      OBSOLETO — no correr, borra las tablas del área
│   ├── 02-datos-iniciales.sql   OBSOLETO — pertenece al esquema viejo
│   ├── 03-tabla-feriado.sql     la única tabla OBLIGATORIA que agrega el sistema. Se corre.
│   ├── 04-columnas-opcionales.sql  OPCIONAL: constancia de impresión de la cédula
│   ├── 05-tabla-auditoria.sql   OPCIONAL (muy recomendado): historial de cambios de estado
│   ├── 06-tabla-parametros.sql  OPCIONAL: Dirección cambia plazos y plantilla desde la app
│   ├── 07-tablas-accesos.sql    OPCIONAL: guardar los permisos de Accesos
│   └── 08-tabla-archivo.sql     OPCIONAL: fotos de las entregas
└── PROCEDIMIENTO.md          este archivo
```

## 2. La base: dos modelos que dicen lo mismo

La parte importante de entender antes de tocar nada.

El front (`src/dominio/`) trabaja con **24 códigos de estado** (`NOTIF1_ENTREGADA`,
`PRORROGA_VIGENTE`, ...) y con **actuaciones** de seis tipos. La base trabaja con
una tabla `tramite` tipada por `id_ttramite` y con 23 filas en la tabla `estado`,
cada una asociada a un `objeto`. **Es el mismo modelo dicho de dos maneras**:

| Front                                   | Base                                              |
|-----------------------------------------|---------------------------------------------------|
| `estado = 'REVISION_DATOS'`             | `local.id_estado = 2`                             |
| actuación `NOTIFICACION` instancia 1, resultado `ENTREGADA` | `tramite` con `id_ttramite = 3` y `id_estado = 13` |
| actuación `PRORROGA` vigente            | `tramite` con `id_ttramite = 6` y `id_estado = 20` |

La traducción vive **entera** en `mapeo.js`, que es el único archivo del backend
que conoce los dos vocabularios. Si mañana el área agrega un estado, se agrega
ahí y en ningún otro lado.

### 2.1 Dos decisiones que conviene conocer

**El estado se compone: se lee lo registrado y se deduce el paso del tiempo.**
De la base se lee lo que anotó una persona (el resultado de una entrega, una
aprobación, el cierre de un control): eso no se recalcula nunca, porque es el
trabajo del área. Lo que el sistema deduce es únicamente que un plazo venció,
que un documento caducó o que una prórroga se terminó.

Esa parte NO puede leerse de la base, porque nadie la registra a mano: es
justamente lo que el pliego pide que el sistema resuelva solo (4.3 y 9.1). Se
aplica al leer y no en un proceso nocturno, así que un plazo que vence a la
medianoche ya se ve vencido a la mañana siguiente sin depender de que ningún
proceso haya corrido.

Está en `estadoDeLocal()` de `mapeo.js`, que implementa las once condiciones de
la sección 4.3 en su orden exacto. Las pruebas de `npm run criterios` lo
verifican contra el capítulo 10.

**La baja es lógica.** Toda la base usa `habilita = 1 | 0`: nada se borra. Un
`DELETE` real se llevaría puesto el historial que respalda una intimación. Por eso
**todas** las consultas filtran `habilita = 1`; una que se olvide muestra locales
dados de baja como si estuvieran activos.

### 2.2 Los formatos de numeración salen de la base, no del código

Dos cosas que estaban solo en los datos y que el código del front suponía mal:

- **Cédulas**: se numeran `0001-675` — serie `0001` y correlativo. El front
  suponía `CED-001275`. Manda la base: hay 340 notificaciones emitidas con ese
  número, impresas y entregadas en papel. Ver `numeroDeCedula()` en `mapeo.js`.
- **Expedientes de multa**: el número lo asigna la mesa de entradas municipal
  (`175557`, `175254/2026`), se carga a mano y este sistema no puede inventarlo.
  Si todavía no hay número, se emite uno `PROV-2026-0001` marcado como provisorio
  para reconciliar después (sección 8.3 del pliego).

## 3. Lo que agrega el sistema a la base

Una tabla obligatoria y cinco scripts **opcionales**. Ninguno toca las tablas
del área: solo agregan (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT
EXISTS`), y correrlos dos veces no hace nada.

| Script | Qué agrega | Sin él |
|---|---|---|
| `sql/03-tabla-feriado.sql` | tabla `feriado` | **obligatorio**: no se pueden calcular días hábiles |
| `sql/04-columnas-opcionales.sql` | `tramite.impresa_por` / `impresa_en` | no queda constancia de quién imprimió cada cédula |
| `sql/05-tabla-auditoria.sql` | tabla `auditoria` | no hay historial de estados; el bloqueo vuelve al estado del relevamiento; el titular no ve por qué le rechazaron una presentación; la corrección de entregas "en el día" se controla solo por la fecha |
| `sql/06-tabla-parametros.sql` | tabla `parametro` | plazos, plantilla y nombres de estados quedan fijos en el código (solo lectura) |
| `sql/07-tablas-accesos.sql` | `permisos_modulos`, `tipos_usuario` | rige el reparto de permisos del código; Accesos no guarda |
| `sql/08-tabla-archivo.sql` | tabla `archivo` | no se guardan las fotos de las entregas ni los documentos que adjunta el titular |

**El backend se da cuenta solo de cuáles están** (`capacidades.js`): revisa
`information_schema` al arrancar y cada 5 minutos. Lo que falta queda apagado
con un aviso de una línea en la pantalla, y el resto sigue andando. `GET
/salud` dice qué está prendido.

### `auditoria` — el historial de cambios de estado

La pide la sección 5.2 del pliego y es criterio de aceptación: *"Todo cambio de
estado queda registrado con actor, momento y motivo, y es consultable desde la
ficha"*. Es el script opcional más importante: **conviene correrlo antes de
presentar el sistema**.

La escribe el backend solo, a través de `ejecutarActo()` en `actos.js`, que
mide el estado del local **antes y después** de cada acto, en la misma
transacción, y anota si cambió. Va envuelto así y no anotado a mano en cada
ruta porque anotar a mano depende de que quien escriba la próxima ruta se
acuerde, y la que se olvide va a ser justo la que haga falta el día de una
impugnación.

Los cambios que produce el paso del tiempo (un plazo que vence) los anota el
actor **Sistema**: la tarea diaria de `tareas-programadas.js` a las 00:05, y
también justo antes de cada acto, por si el cambio pasó después de la última
corrida. La primera corrida anota el punto de partida de todos los locales.

El estado se guarda como **texto** (`NOTIF2_PENDIENTE`) y no como `id_estado`,
porque el estado que ve el área es compuesto: "2da notificación pendiente" no
existe como fila en la tabla `estado`, se deduce de que venció el plazo de la
primera.

### `feriado` — el calendario

| Campo | Tipo | Por qué está |
|---|---|---|
| `id_feriado` | `int(4)` PK | identificador propio, para editar o dar de baja un feriado puntual |
| `fecha_feriado` | `date` | el dato central: qué día no es hábil. `DATE` y no `DATETIME` porque el feriado es el día entero |
| `nombre_feriado` | `varchar(200)` | el motivo. No es decorativo: justifica por qué un vencimiento se corrió dos días |
| `alcance` | `varchar(20)` | nacional, provincial o municipal. Un asueto municipal también suspende plazos |
| `habilita` | `int(1)` | baja lógica: desactivar un feriado cargado por error sin borrar el histórico |

`fecha_feriado` **no** lleva índice único a propósito: puede haber dos feriados
el mismo día (uno nacional y un asueto municipal encima).

#### Por qué el calendario no se puede resolver en el código

Los feriados fijos y los que dependen de la Pascua se podrían calcular en código.
Los **puentes turísticos** los fija el Poder Ejecutivo por decreto cada año, y los
**asuetos municipales** salen a veces con días de aviso: no hay regla que los
prediga. Un feriado que el sistema no conoce produce un vencimiento un día antes
del que corresponde, y esa intimación es impugnable.

### Lo que se resolvió en el backend para no agregar tablas

| Lo que haría falta | Dónde está resuelto |
|---|---|
| plazos, topes, plantilla de la cédula | `backend/parametros-sistema.js`, en código. Con `sql/06`, lo que cambie Dirección pisa esos valores |
| numeración de cédulas sin repetidos | cola en memoria (`enFila` en `consultas.js`) + `MAX(correlativo)+1` |
| historial de lo que le pasó a un local | la propia tabla `tramite`; el de **estados** va en `auditoria` (`sql/05`) |

**La condición de la numeración**: vale mientras corra **una sola instancia** del
backend. Si algún día se levantan dos procesos (PM2 en modo cluster, o detrás de
un balanceador), cada uno tendría su cola y podrían repetirse números. Ahí sí
haría falta una tabla `secuencia` con `SELECT ... FOR UPDATE`.

### Dos funciones que dependen de `sql/04-columnas-opcionales.sql`

- **Constancia de impresión** de la cédula (`tramite.impresa_por`, `impresa_en`).
  Sin el script, `POST /notificaciones/:id/impresion` responde **501** en vez de
  fingir que guardó (si devolviera 200 sin persistir, el área reimprimiría
  cédulas creyendo que nunca salieron) y las pantallas no muestran "Sin
  imprimir". Con el script, se activa sola: no hay que descomentar nada.
- **Fusión de duplicados**: funciona igual, pero deja el rastro como texto en
  `local.observacion` (`FUSIONADO EN LOCAL 567 ...`) en lugar de una columna.

### Accesos: rol administrador, permisos_modulos y tipos_usuario

Se agregó el rol `administrador` al ENUM de `usuarios`. Es el perfil de control
total: en el front ve y modifica todos los módulos (menos el portal del
titular), ejecuta cualquier acto del circuito y administra Accesos. Está
resuelto en `nivelPorDefecto()` de `src/config/modulos.js`, no en los arrays
de cada módulo.

Dos tablas nuevas:

- `permisos_modulos (modulo, rol, nivel)`: solo las diferencias respecto del
  reparto por defecto del código. Si un módulo y un rol no tienen fila, rige lo
  que dice `src/config/modulos.js`. `nivel` es `no`, `ver` o `editar`.
- `tipos_usuario (rol, habilitado)`: la llave "Habilita" de cada tipo de
  usuario. Un rol apagado no ve ningún módulo; sus usuarios siguen dados de
  alta. El administrador también se puede apagar, pero conserva siempre el
  módulo Tipos de usuario (`FIJOS` en `src/config/modulos.js`) para poder
  revertirlo. El backend tiene que respetar la misma excepción.

Los roles en sí no se crean ni se borran desde la pantalla: el circuito
(`src/dominio/reglas.js`) depende de sus ids.

En el front la pantalla es **Accesos → Tipos de usuario** (tabla de roles con
la llave de habilitado y un botón Permisos que abre las llaves por módulo) y
**Accesos → Usuarios** (alta, baja y rol de cada agente, con la llave de activo
en la misma tabla y un buscador).

Rutas en `rutas/configuracion.js`: `GET /configuracion/permisos` devuelve
`{ modulos, rolesDeshabilitados }`. Las de escritura (`PUT
/configuracion/permisos/:modulo/:rol`, `PUT /configuracion/permisos/rol/:rol` y
`DELETE /configuracion/permisos/rol/:rol`) exigen rol administrador y funcionan
cuando la base tiene las dos tablas (`sql/07-tablas-accesos.sql`); sin ellas
responden 501. Validan contra `src/config/modulos.js`: no se guarda un módulo
que no existe ni se le quita al administrador Tipos de usuario.

El front pide `GET /configuracion/permisos` junto con el resto de la carga
inicial. Si la base todavía no tiene estas dos tablas, esa llamada falla y el
front sigue andando con el reparto por defecto del código (ver
`src/datos/DatosProvider.jsx`).

## 4. Cómo ponerlo en marcha

1. **Credenciales**: copiar `.env.ejemplo` a `.env` y completar host, puerto,
   usuario, clave y nombre de la base (los mismos datos que usa HeidiSQL).
2. **Instalar** (una sola vez):
   ```bash
   cd backend
   npm install
   ```
3. **Comprobar la conexión**:
   ```bash
   npm run probar
   ```
   Lista las tablas con su cantidad de filas y dice exactamente qué falta.
4. **Crear las tablas del sistema**: abrir HeidiSQL parada sobre
   `smt_grandes_generadores`, *Archivo > Cargar archivo SQL*, y ejecutar con F9
   `sql/03-tabla-feriado.sql` (obligatorio). Después, los opcionales que el área
   apruebe, en cualquier orden: `04` a `08` (ver la sección 3). Recomendado como
   mínimo el `05` (historial de estados). No hace falta reiniciar el backend.
5. **Arrancar**:
   ```bash
   npm run dev     # se reinicia solo al guardar un archivo
   ```
6. **Verificar**: `http://localhost:3000/salud` y después
   `http://localhost:3000/locales`. El segundo tiene que devolver los 2.220
   locales con su estado.

Si algo no conecta, `npm run probar` distingue los tres casos: usuario o clave
mal (`ER_ACCESS_DENIED_ERROR`), host o puerto mal (`ECONNREFUSED`) y estar fuera
de la red municipal o sin VPN (`ETIMEDOUT`).

## 5. Los endpoints

Cada archivo de `rutas/` arranca con una tabla que dice qué función de
`src/datos/DatosProvider.jsx` reemplaza cada ruta. En resumen:

| Método y ruta | Qué hace | Rol |
|---|---|---|
| `GET /locales` | padrón con estado | — |
| `GET /locales/:id` | ficha: local, actuaciones, relevamientos | — |
| `GET /locales/:id/auditoria` | historial de cambios de estado (`sql/05`) | — |
| `GET /locales/solicitudes-prorroga` | prórrogas pedidas por el portal y sin resolver (`sql/05`) | — |
| `POST /locales` | alta manual | administrativo+ |
| `PUT /locales/:id` | edición | administrativo+ |
| `DELETE /locales/:id` | baja lógica | coordinación |
| `POST · DELETE /locales/:id/bloqueo` | bloqueo manual | coordinación |
| `GET · POST /relevamientos` | campo | relevador |
| `PUT /relevamientos/:id` | el autor corrige su carga, el mismo día y sin control | el autor |
| `POST /relevamientos/:localId/revision` | control administrativo | coordinación |
| `GET · POST /notificaciones` | cédulas y emisión | administrativo+ |
| `POST /notificaciones/:id/regenerar` | reemplazo por corrección de datos | administrativo+ |
| `PUT /notificaciones/:id/notificador` | asignación | coordinación |
| `POST /notificaciones/:id/impresion` | constancia de impresión | cualquiera identificado |
| `POST /notificaciones/:id/entrega` | resultado, foto (`sql/08`) y **arranque del plazo** | notificador asignado |
| `PUT /notificaciones/:id/entrega` | **corregir** una entrega: el agente la suya en el día; después coordinación, con motivo | notificador asignado · coordinación |
| `GET /archivos/:id` | ver una foto o un documento guardado | cualquiera identificado |
| `GET /documentacion` · `/pendientes` | DDJJ y contratos | — |
| `POST /documentacion` | registrar (oficina) o presentar (titular, queda pendiente), con el documento adjunto (`sql/08`) | administrativo+ · titular |
| `POST /documentacion/:id/validacion` | aprobar o rechazar (el rechazo exige motivo) | administrativo+ |
| `POST /locales/:id/prorrogas` | prórroga (días corridos) | coordinación |
| `POST /locales/:id/solicitud-prorroga` | el titular pide; queda en el historial (`sql/05`) | titular |
| `POST /locales/:id/expedientes` | expediente de multa | administrativo+ |
| `PUT /expedientes/:id/numero` | número de la mesa de entradas para un expediente `PROV-` | administrativo+ |
| `POST /locales/:id/reingreso` | vuelve al circuito, sube el ciclo | coordinación |
| `GET · POST /configuracion/:catalogo` | rubros, usuarios, feriados | coordinación |
| `GET /configuracion/parametros` · `/plantilla` | plazos y plantilla | — |
| `PUT /configuracion/parametros` | plazos, decisiones pendientes y nombres de estados (`sql/06`) | dirección |
| `PUT /configuracion/plantilla` | plantilla de la cédula (`sql/06`) | coordinación · dirección |
| `PUT · DELETE /configuracion/permisos/...` | permisos de Accesos (`sql/07`) | administrador |
| `GET /configuracion/capacidades` | qué funciones opcionales están prendidas | — |
| `GET · POST /herramientas/fusiones` | duplicados | coordinación |
| `POST /herramientas/geocodificar` | coordenadas faltantes | administrativo+ |
| `POST /herramientas/informe-9dj` | carga del informe de la prestataria (todo o nada) | administrativo+ |
| `POST /herramientas/recalcular-estados` | corre ya la recorrida diaria del historial | coordinación |

El rol **administrador** (tipo 8 de la base) pasa por todas las rutas. Los
**actos** del circuito, además del rol de la ruta, tienen que estar permitidos
para ese rol y ese estado en la tabla `ACCIONES` de `src/dominio/reglas.js`
(ver la sección 8): por eso Dirección, que tiene lectura total, no ejecuta actos.
Desde el 5 de octubre tampoco edita el padrón, ni valida, ni usa las
herramientas: "administrativo+" quiere decir administrativo y coordinación
(y el administrador). Dirección conserva usuarios, parámetros, plantilla,
rubros, feriados y "Revisar vencimientos ahora" (guía 7.2).

Las reglas que el servidor hace cumplir y el front no puede garantizar:

- sin CUIT, razón social y rubro **no se emite** una cédula (la notificación
  sería impugnable, sección 4.3);
- el relevador **no puede** registrar CUIT ni razón social (sección 6.2);
- una presentación del portal entra **pendiente** y no suspende ningún plazo
  hasta que un agente la aprueba (sección 6.3);
- la prórroga solo se otorga con las dos notificaciones agotadas, y respeta el
  tope de días y el máximo por ciclo de Configuración;
- el vencimiento de una notificación se calcula **una sola vez**, al registrar la
  entrega, con los feriados y parámetros vigentes ese día;
- **cada acto solo se registra en el estado que le corresponde** (tabla
  `ACCIONES` del dominio, la misma que dibuja los botones): no se emite una
  cédula a un local con DDJJ vigente, no se regenera una cédula entregada, no
  se pisa una entrega efectiva;
- **no hay expediente de multa sin dos notificaciones con entrega efectiva** en
  el ciclo, ni con un número de expediente ya usado;
- la fecha de entrega no puede ser futura ni anterior a la emisión, y la
  registra el notificador asignado (o coordinación);
- el origen "Informe 9 de Julio" solo entra por el informe;
- con un bloqueo manual activo no se registran actos;
- con `sql/08`, el titular no presenta sin adjuntar el documento (PDF o foto):
  la oficina tiene que poder ver lo que aprueba;
- una presentación no se rechaza sin motivo: el titular lo ve en su portal;
- el número de una DDJJ no se repite en ningún otro local, y el de un contrato
  no se repite dentro del mismo local (un contrato puede cubrir varios locales
  del titular). Las presentaciones rechazadas no cuentan;
- una entrega se corrige solo mientras esa cédula sea lo último del circuito:
  si ya se emitió la siguiente, o hubo prórroga o expediente, no.

## 6. El front ya está conectado

`src/datos/DatosProvider.jsx` dejó de leer de `localStorage` y ahora consume
esta API. Fue el único archivo del front que cambió de raíz: las 29 pantallas
lo usan con `useDatos()` y no se enteraron.

Para levantar todo hacen falta **dos terminales**:

```bash
# terminal 1 — la API
cd backend
npm run dev

# terminal 2 — la aplicación
npm run dev      # desde la raíz del proyecto
```

Y se abre `http://localhost:5173`.

Los archivos del front que participan:

| Archivo | Qué hace |
|---|---|
| `src/datos/api.js` | el único lugar que hace `fetch`. El día que haya login, el token se agrega ahí |
| `src/datos/DatosProvider.jsx` | carga todo al arrancar y recarga después de cada acción |
| `src/datos/vistas.js` | usa el `estado` que manda la API en vez de recalcularlo |
| `.env` (raíz) | `VITE_API_URL`, la dirección de la API |

**Lo que depende de un script opcional** (sección 3) avisa en una línea cuando
la base no lo tiene, y el botón queda deshabilitado: la constancia de impresión,
guardar parámetros y plantilla, guardar permisos, el historial de estados y las
fotos de las entregas.

## 7. Lo que sigue

1. **Login.** Hoy el rol se elige desde un selector y viaja en dos cabeceras.
   La base `ciudadano_digital` del mismo servidor tiene una tabla `persona` con
   `clave`, `id_tusuario`, `validado` e `ingreso_fallido`: el mecanismo de
   autenticación del municipio ya existe y es contra esa tabla.
2. **Resolver los nombres de los agentes.** `usuario.id_persona` es una
   referencia a esa misma tabla `ciudadano_digital.persona` (el legajo 140.849
   existe ahí). Como están en el mismo servidor MariaDB, alcanza con un JOIN
   entre bases para mostrar nombre y apellido en vez del número de legajo.
3. **Cargar los feriados que falten.** El script trae los de 2026; los asuetos
   municipales los agrega el área desde Configuración.
3. **Revisar los 670 trámites de documentación.** Están con estado SIN INFORMAR
   y la tabla `documentacion` vacía, así que hoy no acreditan nada ni suspenden
   plazos. Cuando se carguen sus datos (tipo, número, vencimiento) van a empezar
   a sacar locales del circuito, que es lo correcto.
4. **Declarar las claves primarias que faltan.** `documentacion`, `objeto`,
   `tipo_documentacion`, `tipo_tramite` y `usuario` tienen su `id` con
   AUTO_INCREMENT pero sin PRIMARY KEY, solo un índice común. Funciona, pero
   admite ids duplicados.
6. **Reemplazar `middlewares/usuario.js` por CiDiTuc** cuando exista el login
   único. Las rutas no se tocan: siguen usando `req.usuario` y `requiereRol()`.
   El rol declarado está apagado desde el 2026-11-06 (solo entran los
   usuarios de la base); `ACEPTAR_ROL_DECLARADO=si` solo para las pruebas.
7. **Geocodificador real.** Hoy no hay: las direcciones nuevas quedan sin
   coordenada para revisar (antes se inventaban). Falta elegir el servicio y
   cargar el polígono KML del municipio (`src/dominio/geo.js` usa uno
   aproximado). Se agrega en `geocodificador.js`.
8. **HTTPS en el servidor.** Sin HTTPS el celular no da GPS ni instala la app
   para abrir sin señal (`public/sw.js`).
9. **Respaldo** de la base y de la carpeta de fotos (`CARPETA_ARCHIVOS`).
10. **Que el titular vea solo lo suyo en el servidor.** Hasta CiDiTuc, el portal
    filtra sus locales en el navegador (por CUIT); el servidor responde el
    padrón, el historial y las solicitudes a cualquier usuario identificado.
    Con el login, esas tres lecturas tienen que filtrar por titular.
11. **Reporte diario por correo** (Anexo A.4). La pantalla de Reportes ya lo
    arma con el período "Ayer"; falta mandarlo solo a las 7.
12. **La cédula en PDF** con la plantilla de Configuración, para imprimir sin
    depender del navegador.

## 8. Cambios del 1 de octubre de 2026: debido proceso, historial y campo sin conexión

Después de comparar el código con la Guía de construcción v2.2, se hizo lo que
faltaba y era imprescindible para presentarlo. Nada de lo que había se borró:
lo que estaba mal se corrigió o se apagó con una opción.

**1. La base del área ya no recibe datos inventados.**
- `geocodificador.js`: el geocodificador simulado (un punto inventado a partir
  del texto de la dirección) solo se usa con `GEOCODIFICADOR=simulado`. Por
  defecto la dirección queda sin coordenada y el local va a la vista de revisión.
- Informe 9 de Julio: se carga el CSV real de la empresa; el informe de ejemplo
  se puede mirar pero no aplicar; las coincidencias dudosas arrancan
  destildadas; el lote es todo o nada y no duplica contratos ya cargados.

**2. El servidor hace cumplir el debido proceso** (`actos.js`). Todo acto pasa
por `ejecutarActo()`: en fila, en transacción, con el estado leído adentro y
controlado con la tabla `ACCIONES` del dominio. Se corrigió además:
- "Habilitar notificación" y "Corregir clasificación" dejaban el local en
  revisión de datos y nunca llegaba a la cola de emisión. Ahora crean la
  primera notificación PENDIENTE, y la emisión completa ese mismo trámite.
- Con la cédula NO ENTREGADA ahora se puede reintentar la entrega, reasignar o
  regenerar (antes el local quedaba trabado sin ningún botón).
- La fecha de un documento en el historial es la de presentación, no la de
  emisión del papel (antes, al vencer, el local podía saltar a expediente).
- Una presentación del portal pendiente ya no tapa a una DDJJ vencida.
- Una notificación con estado desconocido y sin fecha de entrega no avanza.

**3. Rastro de todo** (`auditoria.js`, `tareas-programadas.js`, `sql/05`).
Historial de estados con actor, momento y motivo, visible en la ficha; tarea
diaria que anota los vencimientos como Sistema; el bloqueo congela el estado
real y guarda desde cuándo. En el front, el selector de la barra suma "firmar
como" un agente de la base, para que los actos queden con su legajo.

**4. Arreglos que bloqueaban el uso.**
- El rubro del relevamiento se perdía (el formulario mandaba el nombre).
- El rol administrador (tipo 8) no existía en el backend: todo le daba error.
- La lista de notificadores salía vacía y el notificador no veía sus cédulas.
- La pantalla de Usuarios esperaba correo y "activo", que la base no tiene: el
  alta grababa a todos como "sistema".
- El número de cédula de la base (0001-675) se comparaba mal y se rechazaba.
- Parámetros y Plantilla decían "Guardado" sin guardar. Con `sql/06` guardan.
- Accesos respondía "pendiente de implementar". Con `sql/07` guarda.

**5. Campo sin conexión** (requisito no negociable). Copia de los datos en el
dispositivo para abrir sin señal; cola de relevamientos y entregas que se
envían solas al volver la conexión, con la hora y la coordenada del momento de
guardar; indicador de pendientes en la barra; la app se guarda en el teléfono
(`public/sw.js`, solo con HTTPS). El backend reconoce un reenvío y no duplica.
La coordenada del relevamiento ahora es la del momento de guardar.

**6. Fotos de las entregas** (`archivos.js`, `sql/08`): obligatorias cuando la
cédula no se entrega, guardadas con su huella SHA-256, visibles en la ficha.

**7. Portal del titular**: vincula por CUIT mientras no esté CiDiTuc (campo de
PRUEBA para verlo como un titular real) y la prórroga se solicita, no se otorga.

**Cómo se probó.** Contra una copia de la estructura de la base en un MariaDB
local de prueba (nunca contra la del área): 108 verificaciones de punta a punta
en tres etapas (sin scripts opcionales, con ellos, y fotos/cola/corrección en el
día), la prueba de humo `npm run humo`, y los 64 criterios del dominio
(`npm test` y `npm run criterios`).

## 9. Cambios del 2 de octubre de 2026: cada rol hace lo suyo

Se revisó, rol por rol, que cada usuario vea lo que le toca y pueda resolverlo
sin buscar. Como siempre, nada se borró: lo que no corresponde se apaga.

**Inicio y Tablero cuentan solo lo que ese usuario puede resolver**
(`esTrabajoDe` en `src/datos/vistas.js`, con la misma tabla `ACCIONES` que
dibuja los botones). Al administrativo no se le cuentan las exenciones, que
confirma coordinación; los actos que valen en cualquier estado (registrar
documentación, bloquear) no hacen "trabajo pendiente". Las bandejas
informativas (prórrogas vigentes, bloqueados) se muestran enteras. Coordinación
suma tres bandejas: cédulas sin notificador, prórrogas pedidas por el portal y
locales bloqueados. La leyenda de colores del tablero quedó apagada
(`MOSTRAR_LEYENDA_COLORES`), porque las tablas ya no tienen colores.

**Por rol:**
- **Relevador.** "Mis relevamientos" arranca con sus cargas (un botón muestra
  todas) y no ve la lista de control, donde no puede hacer nada.
- **Notificador.** El Inicio muestra solo sus cédulas. Sin un agente elegido en
  "Firmar como", se le pide que lo elija.
- **Administrativo.** Elige el local de la documentación escribiendo (nombre,
  dirección o CUIT) en vez de bajar un desplegable con todo el padrón. Ve el
  documento que adjuntó el titular antes de aprobarlo, y para rechazar tiene
  que escribir el motivo. Ya no ve la papelera del padrón (el servidor no lo
  dejaba dar de baja).
- **Coordinación.** Botones de acción en la cédula en curso de cada local, en
  Notificaciones. Al asignar un notificador ve cuántas cédulas tiene cada uno
  en la calle. El pedido de prórroga del titular aparece en la ficha y en
  Prórrogas, y el formulario de otorgarla arranca con esos días y ese motivo.
- **Dirección.** El tablero le dice "situación del área" (no actúa) y tiene a
  mano el acceso a Usuarios.
- **Todos los que editan el padrón.** "Editar datos" desde la ficha del local.
- **Titular.** Adjunta el documento (PDF o foto), ve por qué se rechazó una
  presentación y que su pedido de prórroga está en evaluación.

**Reportes por período**: mes en curso, ayer (el reporte diario), hoy, mes
anterior, todo u otras fechas (`indicadoresDelPeriodo`). Lo que es una foto
de hoy (composición del padrón, por generar, vigentes) lo dice en su título.

**Arreglos.** El listado de relevamientos mostraba vacías las columnas Local y
Rubro, y "Control" leía datos que no existen ("undefined el …"). Lo mismo en la
ficha. Los formularios del padrón y de documentación se cerraban aunque el
servidor rechazara lo guardado: ahora quedan abiertos con lo escrito. El portal
decía "días hábiles" a una cuenta en días corridos.

**Cómo se probó.** Igual que el 1 de octubre, contra el MariaDB local de
prueba: 122 verificaciones de punta a punta, en cuatro etapas. La nueva etapa
cubre el documento adjunto, el rechazo con motivo y la prórroga pedida y
otorgada. Además, la prueba de humo y los 64 criterios del dominio.

## 10. Cambios del 5 de octubre de 2026: lo que faltaba de la guía y revisión por rol

**Lo nuevo (nada se borró):**
- **Corregir una entrega** (6.2, corrección de cargas). El notificador corrige
  la suya el mismo día desde "Mis entregas" → "Entregadas hoy". Después la
  corrige coordinación desde la ficha, con motivo obligatorio. El plazo se
  recalcula y queda en el historial qué decía antes y qué dice ahora. Es el
  acto `corregir-entrega` de `src/dominio/reglas.js` (con `correccion: true`,
  que lo deja fuera de las bandejas).
- **La cédula desde la ficha** (6.4 y 9.6): toda cédula emitida tiene "Ver" en
  el historial. En el portal el titular la ve pero no la imprime.
- **Impresión por lote** (6.4): Notificaciones → "Imprimir N cédula(s) sin
  imprimir", una por hoja, con la constancia de cada una. Las que tienen datos
  sin completar no entran. El texto de la cédula sale de
  `src/dominio/textoCedula.js`, el mismo para la vista y para el lote. La hoja
  de ruta ahora incluye las cédulas no entregadas, que hay que volver a llevar.
- **Número definitivo de un expediente provisorio** (8.3): Expedientes →
  "Cargar número definitivo" en los `PROV-`.
- **Números de DDJJ y contrato sin repetir** (5.4).
- **Filtros combinables en el padrón** (6.1): estado, rubro y situación (faltan
  datos, sin ubicación, bloqueo, documentación vigente, en circuito).
- **Tablero**: cada fila suma "Editar datos" y "Dar de baja" (6.1).
- **Nombres de los estados editables** (3.1): Configuración → Parámetros →
  "Nombres de los estados". Se guardan en la tabla `parametro` (`sql/06`), clave
  `etiquetasEstado`. Cambia el texto, nunca el código.

**Permisos alineados con la tabla 7.2 de la guía:**
- Dirección: lectura total. Ya no edita el padrón, ni valida, ni fusiona, ni
  geocodifica, ni carga el informe 9 de Julio (el servidor se lo dejaba aunque
  la pantalla no lo mostrara).
- Coordinación puede guardar la plantilla de la cédula (la pantalla le ofrecía
  el botón y el servidor le respondía 403).
- El relevador ve "Mis entregas": coordinación le puede asignar cédulas y la
  guía dice que suele ser el mismo agente. Su Inicio muestra las cédulas solo
  si tiene alguna.
- La papelera del padrón y "Dar de baja": solo coordinación (y administrador).
- Imprimir una cédula (que deja constancia): la oficina y el agente al que se
  la asignaron. Dirección y el titular la ven sin imprimir.
- El agente de campo no ve "Registrar entrega" en una cédula de otro.

**Celular:** la barra de PRUEBA (rol y "Firmar como") hacía que toda la página
se corriera de costado en un teléfono (674px de ancho en una pantalla de 390).
Ahora entra.

**Cómo se probó.** Contra el MariaDB local de prueba, nunca contra la base del
área:
- 154 verificaciones de punta a punta en cinco etapas; la nueva cubre la
  corrección de entregas, los permisos de Dirección, el expediente provisorio,
  los números repetidos y los nombres de estados;
- un recorrido en Chrome con cada uno de los siete roles: menú, Inicio, las 23
  rutas, las acciones de la ficha y el celular;
- 27 chequeos de los flujos nuevos hechos desde la pantalla;
- la prueba de humo y los 64 criterios del dominio.

**En la base no hay que agregar nada nuevo**: todo usa los scripts opcionales
`sql/04` a `sql/08`. Si todavía no se corrieron en la base del área, ese es el
paso que falta (ver la sección 3).

**Si la base no responde.** Si el backend no llega a la base, la consola lo dice
en una línea cada 30 segundos (`[base] ...`), en vez de una traza por pedido. La
pantalla muestra qué revisar: con `ETIMEDOUT`, que la computadora no está en la
red de la municipalidad o en la VPN; con `ECONNREFUSED`, que MariaDB está
apagado; con `ER_ACCESS_DENIED_ERROR`, que el usuario o la clave del `.env` son
otros. Ojo: en ese caso la línea de arranque marca todas las capacidades en
"NO" porque no pudo revisarlas, no porque falten los scripts. Al volver la red,
se corrigen solas en menos de 5 minutos, o al reiniciar el backend.

## 11. Emisión automática de cédulas (sección 9.6), 6 de octubre de 2026

La guía deja abierto si la emisión es manual o automática. Ahora funcionan las
dos y se elige en Configuración → Parámetros (solo Dirección):

- **Manual** (como viene): coordinación emite desde Notificaciones, de a una o
  toda la cola. Opcional, el **respaldo**: "Si a las 12 la cola sigue sin
  emitir" → "La emite el sistema".
- **Automática diaria**: el sistema emite toda la cola los días hábiles a las 7.

Lo hace `backend/tareas-programadas.js` (`emitirColaAutomatica`), con la misma
función que usa la emisión manual (`emitirCedula` en `rutas/notificaciones.js`):
mismos controles de estado, bloqueo y datos registrales. Lo que emite el sistema
queda en el historial con el autor "Sistema" y el motivo "Emisión automática
diaria …" o "Emisión automática de respaldo …", como pide la guía. No corre en
fines de semana ni feriados. Un local sin datos registrales o bloqueado queda en
la cola. Si el servidor estaba apagado a esa hora, la corrida no se recupera al
arrancar (para no emitir a deshora): la toma la del día siguiente. `GET /salud`
muestra la última corrida y las próximas.

Las dos opciones vienen **apagadas** (`emisionAutomatica` y `emisionRespaldo` en
false): emitir es un acto administrativo y lo decide la Dirección de Ambiente.
Probado en una sexta etapa de la prueba de punta a punta (14 verificaciones).

## El módulo Informe 9 de Julio (modelo de foto)

El informe que manda la prestataria es una **foto de su padrón de contratos**:
la primera carga produjo las altas históricas (los 260 contratos con
`origen = 'INFORME_9DJ'` que se cargaron a mano en la base); cada carga
siguiente dice quién sigue, quién se suma y quién ya no está.

Las piezas:

| Pieza | Qué hace |
| --- | --- |
| `lector-informe-9dj.js` | archivo → filas normalizadas. CSV/XLSX/PDF con texto; dígito verificador de CUIT; OCR previsto, no implementado |
| `rutas/informe-9dj.js` | cargas, decisión fila por fila, aplicar, descartar, anular |
| `sql/09-tablas-informe-9dj.sql` | las dos tablas del módulo (`informe_9dj`, `informe_9dj_fila`), con su justificación en el encabezado |
| `pruebas/lector-informe.mjs` | `npm run lector` — 45 pruebas de la lectura, sin base |
| `pruebas/informe-9dj.mjs` | `npm run informe` — los 16 criterios de aceptación, contra la API; lo que aplica, lo anula |

Reglas que el resto del backend respeta:

- Un contrato `INFORME_9DJ` **no se rige por fecha**: está vigente mientras la
  última foto lo sostenga (su trámite en VIGENTE). Lo implementa
  `documentoVigente()` en `mapeo.js`.
- Esos contratos **no se tocan desde la ficha del local**:
  `rutas/documentacion.js` rechaza validarlos, rechazarlos o crear uno a mano
  con ese origen. La única puerta es el informe siguiente o la anulación de la
  carga.
- **Nada se da de baja solo**: la foto propone las bajas con nombre y
  dirección, y solo salen las que el agente tilda.

TODO-DEFINICION pendientes del área (sección 7 de la especificación): el
margen de la alarma de informe incompleto (hoy 20%), si la ausencia repetida
debería sugerir baja sola, si el contrato cubre a la empresa o a cada
establecimiento, y el formato real del archivo (ajustar el lector con el
primer informe verdadero).

## 12. Cédulas y hoja de ruta en PDF (sección 6.4), 7 de octubre de 2026

La impresión ya no depende del navegador: se arma un PDF en el front con
`jspdf` y `jspdf-autotable` (`src/components/pdfCedulas.js`). Después de traer
este cambio hay que correr `npm install` en la carpeta del proyecto.

- **Cédula** (una por hoja, A4): el texto de Configuración → Plantilla de
  cédula, completado con los datos del local, y al pie la **constancia de
  notificación** que llena el notificador en el domicilio: fecha y hora,
  resultado (las mismas cuatro opciones que se cargan en el sistema), quién
  recibió y su DNI, la relación con el local, las firmas y las observaciones.
  Con `COPIAS_POR_CEDULA = 2` salen ORIGINAL y DUPLICADO.
- **Hoja de ruta** (A4 vertical: apaisada, la impresora la cortaba del lado derecho; `HOJA_DE_RUTA_APAISADA` la vuelve a poner así): una hoja por notificador, con su recorrido
  ordenado por cercanía (la última, las cédulas sin notificador, con el nombre
  para completar a mano). Número de orden, cédula, instancia, local, dirección
  y lugar para resultado y firma; el encabezado se repite en cada hoja.
- **Pie de cada hoja:** abajo a la izquierda, "Generado el dd/mm/aaaa a las
  hh:mm por …", con el usuario de la barra de arriba (con "Firmar como", su
  legajo; con CiDiTuc, el de su inicio de sesión). Desde el 27/10/2026 las
  cédulas ya no lo llevan (sección 20); la hoja de ruta y los listados, sí.
- **Dónde:** en Notificaciones ("Imprimir hoja de ruta", "Hoja de ruta en
  PDF", "Imprimir N cédula(s)", "Cédulas en PDF") y en la vista de cada cédula
  ("Imprimir" y "Descargar PDF"). Imprimir abre el PDF en otra pestaña con el
  diálogo de impresión; descargar lo guarda.
- La constancia de impresión (quién y cuándo) se registra al imprimir o
  descargar, solo para quien imprime: la oficina y el agente asignado.
  Dirección y el titular pueden descargar la cédula sin que cuente como impresa.
- Una cédula con datos sin completar no se imprime ni se descarga.
- `IMPRESION_EN_PDF = false` en `VistaCedula.jsx` y `Notificaciones.jsx` vuelve
  a la impresión del navegador.
- `vite.config.js` deja afuera del build tres librerías que jsPDF solo usa para
  convertir HTML a PDF (`html2canvas`, `canvg`, `dompurify`): ~380 KB menos.
- **Papel:** los PDF salen en tamaño Carta (`PAPEL` en `pdfCedulas.js`: 'carta',
  'a4' u 'oficio'), con todo el contenido dentro de la zona que comparten Carta
  y A4 (210 x 279 mm). Armados en A4, en una impresora con papel Carta se
  perdían casi 2 cm de abajo, justo donde está el pie con quién lo generó.
- **El botón verde "Imprimir" de todas las tablas** también arma un PDF
  (`pdfDeTabla`): las filas que quedaron después de buscar y filtrar, en el
  orden de la tabla, con todas las columnas visibles menos los botones, los
  estados y resultados con su nombre y el mismo pie con quién lo generó. Antes
  salía la tabla del navegador, con la barra de herramientas y las columnas de
  la derecha cortadas. El título lo da la prop `tituloImpresion` de la grilla
  (si no está, sale del nombre del archivo). `IMPRESION_EN_PDF = false` en
  `ui/Grilla.jsx` vuelve a la impresión del navegador.

## 13. Verificar la base y editar observaciones (8 de octubre de 2026)

**`npm run verificar`** (en `backend/`): revisa la base del `.env` en **solo
lectura** (cada conexión se abre con `SET SESSION TRANSACTION READ ONLY` y al
empezar lo comprueba; si la base aceptara escribir, se detiene). Informa:
scripts opcionales corridos; cantidades de locales, trámites y documentos (para
comparar con el Excel de AppSheet); huérfanos; numeración de cédulas (repetidas,
saltos y cuál sigue), de expedientes (sin número, PROV-, repetidos) y DDJJ
repetidas; estados calculados; locales en expediente sin las dos entregas
efectivas (error B-1); padrón sin CUIT, con CUIT inválido, sin razón social,
sin rubro o sin ubicación, y posibles duplicados; cédulas no entregadas sin
foto; y todo lo hecho desde la aplicación según el historial, para separar
pruebas de datos reales. Opciones: `-- --desde=2026-08-01` y `-- --archivo`
(guarda `verificacion-base-AAAA-MM-DD.txt`, que no se sube al repositorio).

**Editar observaciones** (ficha del local → historial de actuaciones →
"Editar observaciones"): solo coordinación (y administrador). Vacío las
borra. Con la tabla `auditoria` (sql/05), en el historial de estados queda
quién las cambió, cuándo y qué decían, y la actuación muestra "Observaciones
editadas por … el …". Sin esa tabla se puede editar igual, pero lo anterior no
queda guardado; para exigirla, `EXIGIR_HISTORIAL_OBSERVACIONES=si` en el `.env`. No se editan los contratos del informe 9 de Julio.
Ruta: `PUT /actuaciones/:id/observaciones`.

**Edición del padrón con historial** (9 de octubre): cada dato que se cambia
desde "Editar datos" (CUIT, razón social, nombre, rubro, dirección, domicilio
fiscal, correo, teléfono, observaciones) deja una línea en el historial de
estados del local, con quién, cuándo, qué decía y qué dice ahora, por ejemplo
`Padrón · CUIT: decía "30-99999999-9", ahora "30-71234567-1"`. Antes solo
quedaba si la edición cambiaba el estado del local, y sin los valores. Usa la
misma tabla `auditoria` (sql/05): sin ella, la edición se hace igual y no se
anota. Los cambios de configuración que no son de un local (usuarios, permisos,
parámetros, rubros, feriados) no entran en esa tabla: para registrarlos
haría falta un script nuevo.

## 14. Expediente de trámite numerado por la aplicación (9 de octubre de 2026)

La guía (sección 4.5) supone que el número de expediente de cada presentación
lo da CiDiTuc. CiDiTuc registra a las personas y no numera trámites, así que
lo numera esta aplicación: **TRAM-<año>-<correlativo de 6 cifras>**
(`TRAM-2026-000001`), que vuelve a 1 cada año. Sale de MAX + 1 dentro de la
transacción del acto y con los actos en fila, igual que las cédulas: no se
repite. Si una presentación ya trae número de otro sistema, se guarda ese.
En el formulario de la oficina el campo quedó opcional (vacío = lo asigna el
sistema); el titular no lo ve. Queda en el historial y en la ficha.
Código: `siguienteExpedienteTramite` en `consultas.js`.

**Campos obligatorios con aviso:** en bloqueo manual, reingreso al circuito y
otorgar prórroga, el botón ya no se desactiva en silencio: el campo dice
"(obligatorio)" y al confirmar sin completarlo aparece qué falta.

## Los dos expedientes

Significan cosas opuestas y por eso van en campos y tipos de actuación
separados: el **de trámite** documenta que el titular presentó (cumple); el
**de multa**, que no cumplió y se lo sanciona.

**De trámite**: obligatorio en cada presentación documental
(`tramite.numero_referencia`). El sistema NO lo autogenera ni inicia trámites:
el trámite se constituye por fuera y acá solo se registra. Las presentaciones
históricas sin número llevan la marca `SIN REGISTRO`. PENDIENTE con la
Dirección (corrección al pliego 4.5): CiDiTuc no asigna números ni cobra
timbrado; falta saber qué pasa realmente al presentar. No hay medios de pago.

**De multa**: la secuencia es habilitado (lo decide el sistema al recalcular,
sin trámite) → SOLICITADO (un agente pidió el número: fecha, agente y canal) →
GENERADO (llegó y se cargó) → EN TRÁMITE / CERRADO (PENDIENTE confirmar los
estados reales de la dependencia). Cada movimiento queda en
`expediente_novedad` (sql/10) con su marca `publica`: el titular ve el estado y
las novedades públicas, nunca las observaciones internas ni los autores. El
reingreso al circuito deja su novedad para que expediente e intimación nueva
convivan con explicación visible. El correo de la dependencia es el parámetro
`correoSolicitudExpedientes` (PENDIENTE: a quién se le pide). La regla que no
se puede violar: la carga manual del número funciona SIEMPRE; una integración
futura solo puede sumarse como camino alternativo.

Pruebas: `npm run expedientes` (24 verificaciones, limpia lo que toca).

## 15. La aplicación en el teléfono (15 de octubre de 2026)

Probado en tamaños de iPhone SE, iPhone 14, iPhone 15 Pro Max, Android chico
(360 px) y Pixel 7, y en la PC.

**Las tablas** (`src/components/ui/Grilla.jsx`, cambia en todas a la vez):

- La barra de Columnas, Filtros, Densidad y Exportar ocupaba 248 px en el
  teléfono, con huecos enormes. La causa: `gap: 8` en el estilo de MUI no son
  8 px sino 8 × el espaciado del tema = 64 px. Ahora es `'8px'`.
- En el teléfono, y en la PC cuando la tabla es más angosta que 560 px, la barra
  va en un renglón y los botones muestran solo el ícono.
- En el teléfono, todas las tablas miden lo que ocupan sus filas: ya no tienen
  scroll propio y al deslizar el dedo se mueve la página, así se llega al pie
  con el cambio de página.
- Se apaga con `AJUSTE_CELULAR = false`. La densidad no se tocó: nueve
  pantallas tienen celdas de dos renglones que en modo compacto se cortarían.

**Las pantallas** (`src/App.css`, sección 14.25): menos margen en el teléfono,
los tres filtros del padrón en una sola fila, y la ficha del local en una
columna con el historial deslizable de costado (antes ensanchaba la página).

**El rol de PRUEBA queda recordado** (`src/auth/RolProvider.jsx`): el rol y el
"Firmar como" se guardan en el dispositivo. Antes cada recarga volvía a
coordinación (volver a abrir la app en el teléfono, deslizar hacia abajo,
Responsively al cambiar de dirección) y el agente cargaba a nombre de otro. Se
apaga con `RECORDAR_EN_EL_DISPOSITIVO = false`. Se va con el login de CiDiTuc.

PENDIENTE: la cola sin conexión envía cada carga con el usuario elegido AL
ENVIAR, no con el que la cargó. Con el rol recordado ya no pasa al recargar,
pero sí si dos agentes comparten el teléfono y cambian el "Firmar como" antes
de que vuelva la señal.

**Cada sección abre arriba** (`src/components/Layout.jsx`): al cambiar de
sección desde el menú o un botón, la pantalla nueva quedaba con el scroll de la
anterior (Notificaciones abría 1.300 px más abajo) y parecía cortada. Ahora
vuelve arriba. Se probó en iPhone SE, iPhone 15 Pro Max y Android chico: en
todas las pantallas se llega al final bajando.

**Responsively**: si el teléfono simulado es más alto que el monitor, la parte
de abajo queda debajo de la barra de tareas de Windows y parece cortada. No es
la app: se achica con el menú ⋮ → Zoom (−), o con Ctrl y la tecla menos.

## 16. Android e iPhone: instalar, trabajar sin señal y publicar (15 de octubre de 2026)

Todo se probó en un teléfono simulado (390 px, pantalla táctil) contra la base
de PRUEBA, por `http://localhost` y por una dirección HTTPS de prueba (túnel):
19 controles, todos bien. Cada cambio se apaga con su marca.

| Qué | Dónde | Marca para apagarlo |
|---|---|---|
| Se puede instalar: íconos PNG (192, 512, maskable), ícono del iPhone y etiquetas para pantalla completa | `public/icono-app-*.png`, `public/apple-touch-icon.png`, `public/manifest.webmanifest`, `index.html` | sacar las líneas nuevas de `index.html` |
| El teléfono no borra lo guardado sin enviar (`navigator.storage.persist`), solo en pantallas táctiles | `src/main.jsx` | `PEDIR_ALMACENAMIENTO_PERSISTENTE` |
| El iPhone no agranda la pantalla al tocar un campo: campos a 16px en pantallas táctiles | `src/App.css` 14.26 | borrar el bloque |
| Foto de la entrega solo con la cámara, en el momento (no al corregir desde la oficina). Decidido con DITEC el 15/10/2026 | `src/components/FormEntrega.jsx`, `ui/Campo.jsx` (`soloCamara`) | `FOTO_SOLO_CAMARA` |
| Las cargas sin señal salen a nombre de quien las hizo, aunque después cambie el "Firmar como". La lista dice "Cargó: Legajo …" si es de otro | `src/datos/DatosProvider.jsx`, `api.js`, `colaSinConexion.js` | `ENVIAR_A_NOMBRE_DE_QUIEN_CARGO` |
| Padrón en tarjetas en el teléfono: buscador, de a 20, Ficha / Cómo llegar / Editar | `src/components/ListaTarjetasLocales.jsx` (nuevo), `pages/Local.jsx` | `TARJETAS_EN_CELULAR` |
| Aviso en el Inicio para instalar la app (botón Instalar en Android; instrucciones en iPhone). Solo en teléfono y si no está instalada; "Ahora no" lo oculta en ese teléfono | `src/components/AvisoInstalar.jsx` (nuevo), `pages/Home.jsx` | `MOSTRAR_AVISO_INSTALAR` |
| El backend puede servir también la app: una sola dirección para todo | `backend/servidor.js` | `CARPETA_FRONT` vacía (como antes) |

PENDIENTE CON EL LOGIN (CiDiTuc): no se va a poder mandar una carga a nombre de
otro. La regla pasa a ser: se envían solo las cargas del que inició sesión, y
las de los demás esperan a que ellos entren.

LIMITES DEL IPHONE (no se pueden resolver con código):
- La cola se envía solo con la app abierta: el iPhone no deja que una página
  trabaje cerrada. Al volver la señal, el agente tiene que abrir la app.
- Si no se instala en la pantalla de inicio, Safari puede borrar lo guardado
  si la página no se abre en 7 días. Instalada, no.

### Publicarla en una dirección (lo que hay que pedirle a Sistemas)

Los teléfonos SOLO permiten el GPS y abrir sin señal en una dirección con
**HTTPS**, y la dirección tiene que **verse desde los datos móviles** (una IP
interna como 172.16.x.x no se ve desde la calle). Hay que pedir:

1. Un nombre, por ejemplo `gg.smt.gob.ar`, con certificado HTTPS.
2. Que ese nombre lleve al servidor donde corre el backend (un proxy inverso
   hacia el puerto del backend, por ejemplo 3000). Una sola dirección para
   todo: el backend entrega la app y la API.
3. Que la base del área (MariaDB) quede accesible SOLO para el backend, no
   desde afuera.
4. Que el backend quede corriendo siempre (servicio de Windows o pm2): de eso
   dependen también la emisión automática y el recálculo diario.

Y de nuestro lado:

```powershell
# 1. compilar la app para que hable con su misma dirección (en PowerShell)
$env:VITE_API_URL='/'; npm run build
# (en Git Bash: MSYS_NO_PATHCONV=1 VITE_API_URL=/ npm run build — sin eso,
#  Git Bash cambia la "/" por "C:/Program Files/Git/" y la app no encuentra la API)

# 2. en backend/.env
CARPETA_FRONT=../dist
ACEPTAR_ROL_DECLARADO=no   # en producción: solo entran los agentes cargados
```

Antes de publicar con la base del área: hoy el usuario lo declara el
navegador (selector de PRUEBA). Con la dirección abierta a internet, cualquiera
con el link podría elegir un rol. Hasta que esté CiDiTuc, conviene que
Sistemas limite el acceso (VPN, o la red municipal más los datos móviles de
los teléfonos de los agentes).

### Probar en teléfonos de verdad antes de que esté Sistemas

Un túnel de Cloudflare (gratis, `cloudflared.exe`) da una dirección HTTPS
temporal hacia la PC. SOLO con la base de PRUEBA, nunca con la del área (por
lo del párrafo anterior):

```
cloudflared.exe tunnel --url http://localhost:3001
```

El backend de prueba tiene que estar corriendo con `CARPETA_FRONT` apuntando a
un build hecho con `VITE_API_URL=/`. La dirección cambia cada vez que se abre
el túnel y deja de andar al cerrarlo.

## 17. Correcciones de la prueba en el teléfono (20 de octubre de 2026)

**Campos más angostos en "Nuevo local"** (Razón social, Rubro, Domicilio
fiscal, Teléfono). En pantallas de hasta 900px los formularios van a una
columna, pero los campos que piden dos (`ancho={2}`: nombre, observaciones)
forzaban una segunda columna escondida y el resto quedaba apareado de a dos.
Ahora cada campo ocupa todo el ancho (`src/App.css`, 14.29). Vale para todos
los formularios, también el de la entrega.

**El CUIL del titular habilitado no se guardaba.** La tabla `local` de la base
del área no tiene la columna: se escribía, se mandaba y se perdía; al volver a
abrir aparecía vacío. Ahora:
- `backend/sql/12-titular-cuil.sql` (OPCIONAL, aditivo) agrega la columna.
  **Hay que correrlo en HeidiSQL en la base del área.**
- Sin el script, el campo aparece bloqueado y dice que falta correrlo.
- Con el script, se guarda, aparece al volver a abrir y el cambio queda en el
  historial del local ("CUIL del titular habilitado: decía…, ahora…").
- `capacidades.js` lo detecta solo (bandera `titularCuil`) y
  `npm run verificar` informa si están corridos sql/10 y sql/12.

**La dirección corregida no aparecía en el mapa.** El backend sí vuelve a
buscar la coordenada al cambiar la dirección, pero no avisaba si no la
encontraba. Ahora:
- En el formulario del local hay un botón **"Ubicar la dirección en el mapa"**
  que la busca ANTES de guardar y muestra dónde quedó (con un link al mapa) o
  por qué no se encontró. No guarda nada (`POST /herramientas/ubicar-direccion`).
- Al guardar, el cartel dice si la dirección se ubicó en el mapa o no, y por qué.
- Si no se encuentra, el local queda en Herramientas → Geocodificación
  pendiente, para ubicarlo a mano.
- En el túnel de prueba no aparecía porque ese backend corría con
  `GEOCODIFICADOR=ninguno`; ahora corre con Nominatim, como el del área.

**Locales dados de baja:** la baja es lógica (`local.habilita = 0`, y también
sus trámites). Hoy NO se ven en la aplicación, solo en HeidiSQL:
`SELECT id_local, nombre_local, direccion_local FROM local WHERE habilita = 0;`

**Correo para pedir números de expediente:** el parámetro
`correoSolicitudExpedientes` está en la parte de Parámetros que se ocultó
(`MOSTRAR_PLAZOS_Y_DECISIONES = false`). Mientras tanto se carga en HeidiSQL:
`INSERT INTO parametro (clave, valor) VALUES ('correoSolicitudExpedientes', '"correo@smt.gob.ar"')`
(el valor va entre comillas dobles: es JSON).

**Volver a notificar** (decidido con DITEC, 20/10/2026). Para los locales que
llegaron a "Generar expediente" (o "Expediente solicitado") SIN las dos
notificaciones con entrega efectiva, casos de AppSheet (error B-1). Antes
quedaban trabados: la app ofrecía pedir el número e iniciar el expediente, y
el backend lo rechazaba. Ahora:
- Coordinación ve **Volver a notificar** en las opciones de esos locales (y en
  Expedientes → Expedientes para generar). Pide un motivo obligatorio.
- El local vuelve a **1° Notificación pendiente** con un ciclo nuevo, como el
  reingreso. Lo anterior queda en el historial con el motivo.
- A esos locales ya no se les ofrece "Solicitar N° de expediente" ni
  "Registrar expediente de multa".
- `POST /locales/:id/volver-a-notificar` (coordinación). Si el local SÍ tiene
  las dos entregas, responde 409: corresponde el expediente.
- La cuenta de entregas está en `dosEntregasEfectivas()` de
  `src/dominio/actuaciones.js`, con el mismo criterio que el backend.

**Reactivar un local dado de baja** (no hay pantalla: se hace en HeidiSQL
cuando el área avisa cuál). La baja desactiva el local y TODOS sus trámites:
```sql
-- 1. Confirmar que es el local (y que no es una ficha fusionada en Duplicados:
--    si la observación dice "FUSIONADO EN LOCAL ...", NO se reactiva).
SELECT id_local, nombre_local, direccion_local, observacion FROM local WHERE id_local = 123;
-- 2. Reactivar el local.
UPDATE local SET habilita = 1 WHERE id_local = 123;
-- 3. Reactivar sus trámites, MENOS las presentaciones rechazadas, que estaban
--    desactivadas desde antes de la baja.
UPDATE tramite SET habilita = 1
 WHERE id_local = 123 AND habilita = 0
   AND (observaciones IS NULL OR observaciones NOT LIKE '%Rechazada por%');
```
Lo hecho en HeidiSQL no queda en el historial de la app: conviene anotar en la
observación del local quién lo pidió y cuándo.

**Otros ajustes del 20/10:**
- La ayuda de "Otorgar prórroga" decía "solo con las dos notificaciones
  agotadas"; desde el 14/10 vale también con la primera.
- El estado `INACTIVO_CERRADO` (lo usa el área) se muestra como "Inactivo /
  cerrado" en vez del código.
- "Solicitar N° de expediente" ya no manda a Parámetros a cargar el correo
  (esa parte está oculta): dice que el pedido se hace por correo, por teléfono
  o en persona, y el canal se elige en la ventana.
- En pantallas táctiles, botones y enlaces miden al menos 40px de alto
  (`src/App.css`, 14.30).

## 18. Local cerrado y compresión (21 de octubre de 2026)

**El comercio cerró: "Marcar como cerrado" / "Reabrir local".** Solo el
**administrador** del sistema (decidido con DITEC; coordinación no, por ahora).
- Usa el estado INACTIVO que la base del área ya tenía (`local.id_estado = 6`,
  en pantalla "Inactivo / cerrado"). No hace falta ningún script.
- El local sale del **padrón**, del **mapa**, de las **bandejas** y de la
  **emisión automática**. No se borra nada: conserva todo su historial.
- Se lo encuentra en el padrón con **Situación → Cerrados** (o eligiendo el
  estado "Inactivo / cerrado"). Desde su ficha, **Reabrir local**.
- Las dos acciones piden motivo, que queda en el historial.
- Al reabrir vuelve al estado que tenía: el estado anterior sale del historial
  del cierre. Un exento vuelve a exento; uno con trámites, a lo que digan sus
  trámites. Un local que ya venía cerrado de AppSheet vuelve a "Revisión de
  datos" y desde ahí deciden sus trámites.
- Distinto de la **baja** (error de carga o duplicado: oculta también el
  historial, se revierte solo en HeidiSQL) y del **bloqueo manual** (una pausa
  mientras se revisa algo: el local sigue en el padrón).
- Backend: `POST /locales/:id/cierre` y `POST /locales/:id/reapertura`
  (`backend/rutas/locales.js`). Acciones `cerrar-local` y `reabrir-local` en
  `src/dominio/reglas.js` (con `roles: []`: solo el administrador).
- El local que en la base del área ya figuraba como inactivo dejó de verse en
  el padrón: está en Situación → Cerrados.

**Compresión.** El backend manda todo comprimido (paquete `compression`,
`backend/servidor.js`). Con los datos del área, lo que la app baja al abrirse y
después de cada guardado pasó de unos 1.970 KB a 188 KB; la app compilada, de
1,9 MB a unos 580 KB. En el teléfono con poca señal es la diferencia entre
esperar 15 segundos y uno o dos, y gasta diez veces menos datos. Se apaga con
`COMPRIMIR=no` en `backend/.env` (si el servidor de Sistemas ya comprime).
**Quien baje estos cambios tiene que correr `npm install` en `backend/`** (es
una dependencia nueva).

`npm audit` avisa de una vulnerabilidad moderada en `uuid`, que ya estaba (no
la trae `compression`).

## 19. Arreglos después de mezclar las dos ramas (22 de octubre de 2026)

Revisado todo lo mezclado (las pruebas del circuito, las de cande, las del
repositorio y un recorrido de todas las pantallas por rol en 5 tamaños). Lo que
había que arreglar:

- **La app se colgaba si el tipo de usuario titular estaba deshabilitado.** La
  app arranca como titular (rol por defecto), y el Inicio tenía DOS
  redirecciones al portal: una controlaba que el titular pudiera entrar, la
  otra (agregada al arreglar la mezcla) no. Con el titular deshabilitado en
  Accesos, el Inicio mandaba al portal y el portal devolvía al Inicio, sin fin:
  el navegador se trababa. Queda solo la redirección con el control
  (`src/pages/Home.jsx`); deshabilitado, el Inicio muestra el aviso.
- **La dirección de la API ya no es la IP de una PC.** El `.env` compartido
  tenía `VITE_API_URL=http://172.16.11.98:3000` (la PC de cande), y la app de
  la otra PC le pedía los datos a esa. Ahora `VITE_API_URL` va vacía y la app
  busca la API en la misma máquina desde la que se abrió, puerto 3000:
  `localhost:3000` en cada PC, `IP-de-la-PC:3000` desde un celular de la red
  (`src/datos/api.js`). `/` y una dirección completa siguen andando igual.
- **El backend rechazaba a la app en el puerto nuevo.** Vite pasó al 5174 y el
  `backend/.env` de cada uno tenía `ORIGEN_FRONT=http://localhost:5173`: en
  desarrollo va VACÍO (acepta la PC y los celulares de la red). Hay que
  cambiarlo en el `backend/.env` de cada PC (no se sube a git).
- **Dos scripts con el número 11.** El del CUIL del titular pasó a ser
  `backend/sql/12-titular-cuil.sql` (el 11 es la corrección de fechas de
  cande). Si ya se había corrido con el nombre viejo, no hace falta nada: no
  repite la columna.
- Textos que mandaban a "Herramientas → Geocodificación pendiente", que ahora
  está dentro del Mapa.
- Expedientes: la tabla no se rearmaba al cambiar de rol (faltaba una
  dependencia del useMemo): el botón de cargar el número podía quedar mal.

## 20. La cédula con el modelo oficial de la Dirección (26 de octubre de 2026)

La Dirección de Ambiente pasó el modelo de la PRIMERA y la SEGUNDA
NOTIFICACION y la cédula se imprime así (decidido con DITEC):

- **Formato oficial fijo:** título y número arriba (`N°: 0001 - 000675`: la
  serie y el número de seis cifras), los dos logos, Fecha / Hora / Sr./a para
  completar a mano, los datos del local (razón social, comercio, CUIT,
  domicilio comercial, rubro), el texto con el plazo en número y letras
  (`5 (CINCO)` en la primera, `3 (tres)` en la segunda; sale del plazo de la
  cédula), las cuatro ordenanzas con su casillero **vacío** (se tildan a mano
  según el rubro), las firmas y las observaciones. La primera lleva las tres
  firmas en una fila; la segunda, la del Director arriba y las de recepción y
  notificador abajo, como en el modelo.
- **Tres copias iguales** de cada cédula, una por hoja: para el local, para la
  Dirección de Ambiente y para el expediente. Vale para "Imprimir" / "Descargar
  PDF" de cada cédula y para "Cédulas en PDF" (el lote) de Notificaciones.
- **"Ver cédula" muestra lo mismo que se imprime:** el texto sale de un solo
  lugar, `src/dominio/cedulaOficial.js`, que usan la pantalla y el PDF.
- Las cédulas **no** llevan el "Generado el ... por ..." de abajo a la
  izquierda (lo pidió la Dirección el 27/10/2026); la hoja de ruta y los
  listados en PDF sí. Quién imprimió y cuándo queda igual en la constancia de
  impresión. `PIE_GENERADO_EN_CEDULAS = true` en `src/dominio/cedulaOficial.js`
  lo vuelve a poner.
- La plantilla editable de Configuración → Plantilla de cédula queda guardada
  pero no se usa: la pantalla lo avisa. `FORMATO_OFICIAL = false` en
  `src/dominio/cedulaOficial.js` vuelve al formato anterior.

**LOS LOGOS:** `src/assets/cedula/logo-municipio.png` (Municipio San Miguel
de Tucumán) y `src/assets/cedula/logo-ambiente.png` (Secretaría de Ambiente y
Desarrollo Sustentable · Dirección de Ambiente), recortados de la imagen del
encabezado que pasó la Dirección. Van **dentro de la app** (Vite los incrusta
en el `index.html`): salen también sin señal y abriendo el archivo con doble
clic. No se deforman: cada uno se ajusta a su lugar, y el de Ambiente queda un
poco más de la mitad de alto que el del Municipio, como en el modelo. Para
cambiarlos, reemplazar esos dos archivos (mismo nombre, PNG) y compilar de
nuevo. Si una imagen no carga, en su lugar va el nombre en texto y la cédula
se imprime igual.

## 21. Qué pide cada cédula (26 de octubre de 2026)

**La primera cédula solo pide el nombre del local y la dirección** (lo decidió
la Dirección): lo primero es asegurarse de que le llegue, y muchos locales no
tienen el resto de los datos o no los dan. La **segunda** ya pide todo:
además, CUIT, razón social y rubro. Antes las dos pedían CUIT, razón social y
rubro.

- La regla está en un solo lugar, `faltantesParaCedula` de
  `src/dominio/reglas.js`, y la usan las pantallas (generar cédula, habilitar
  la notificación, la cola de Notificaciones, la impresión) y el servidor (la
  emisión manual, la automática y la regeneración, con
  `faltantesParaEmitir` de `backend/mapeo.js`).
- `PRIMERA_SOLO_NOMBRE_Y_DIRECCION = false` en `src/dominio/reglas.js` vuelve
  a pedir todo en las dos.
- Cande hizo el mismo cambio en paralelo (`requiereDatosRegistrales` con la
  instancia, PR #20). Al mezclar (27/10/2026) quedó una sola regla:
  `faltantesParaCedula` pide nombre y dirección, y para CUIT, razón social y
  rubro le pregunta a `requiereDatosRegistrales`. De cande quedaron además el
  botón "Generar cédula" deshabilitado cuando faltan datos y sus textos.
- En esa mezcla `src/App.css` chocaba entero: un salto de línea mal formado
  (`\r\r\n`) hizo que Git dejara de tratarlo como texto y el commit lo subió
  con saltos de Windows. Se dejó con saltos normales (`\n`), como en `main`.
- En la primera cédula impresa, lo que falta sale como **renglón de puntos**
  para completarlo a mano si el titular lo da en la entrega.
- Pasar a la segunda sigue igual: si al vencer la primera faltan CUIT, razón
  social o rubro, el local queda en "Completar datos".
- El rubro "SIN INFORMAR" (así guarda la base un rubro vacío) ahora cuenta
  como faltante también en las pantallas, igual que en el servidor.

## 22. La documentación del portal la completa coordinación (28 de octubre de 2026)

**El titular ya no carga el tipo de documentación ni el número de
expediente.** Presenta el documento (número, fecha de emisión, el PDF o la
foto y observaciones) y coordinación, al aprobarlo, elige el tipo y carga el
expediente: ese número existe recién cuando coordinación inicia el trámite.

- Mientras espera, la presentación entra como "DDJJ de reciclaje"
  (`TIPO_PROVISORIO_PORTAL`): es el Form D.A 03, lo que presenta casi todo el
  mundo, y así la plantilla de cande sigue apareciendo en el portal. No cuenta
  para nada hasta que se aprueba.
- **Sin expediente no se aprueba.** En el diálogo de Aprobar de la bandeja
  (Documentación) están el tipo, el N° de expediente y, si es un contrato, su
  vencimiento. Si el tipo cambia, el vencimiento se calcula con el tipo nuevo
  y se vuelve a controlar que el número no esté repetido. El historial dice
  qué expediente cargó y con qué tipo se había presentado.
- **Aprueba o rechaza solo coordinación** (`ROLES_QUE_VALIDAN`), también en
  el servidor. Administrativo sigue viendo la bandeja, sin la columna de
  decisión. El administrador pasa siempre.
- La carga desde la oficina (Documentación y ficha del local) sigue igual:
  pide tipo y expediente.
- `COORDINACION_COMPLETA_PRESENTACION = false` en `src/dominio/reglas.js`
  vuelve a pedirle las dos cosas al titular.

**Botón "Constancia ARCA"** (`src/components/ConstanciaArca.jsx`, nuevo).
Al lado del CUIT, en la bandeja de validación y en la ficha del local. Abre la
consulta de constancias de inscripción de ARCA en otra pestaña y copia el
CUIT: esa página pide el CUIT y un captcha, así que no se puede abrir con el
CUIT ya puesto; se pega con Ctrl+V. Lo ve solo coordinación
(`ROLES_CONSTANCIA_ARCA`) y el administrador.

**Inicio de coordinación (30 de octubre de 2026).** En las acciones rápidas,
coordinación ya no tiene "Nuevo relevamiento" (no releva: se le sacó la
tarjeta, el módulo de campo sigue en su menú) y tiene una tarjeta
**"Constancia de Inscripción ARCA"** que abre la página de ARCA en otra
pestaña. Las tarjetas que llevan a una página de afuera usan `externa` y
`logo` en `ACCIONES_RAPIDAS` (`src/config/modulos.js`); quién la ve sale de
`ROLES_CONSTANCIA_ARCA`.

**Más tarde el mismo 30 de octubre.** Dos cambios más, a pedido de coordinación:

- **ARCA, solo en la ficha.** La tarjeta "Constancia de Inscripción ARCA" salió
  del Inicio y de la bandeja de validación. Ahora está en la ficha de cada local,
  debajo de las acciones, con el mismo aspecto que tenía en el Inicio. Al
  tocarla, además de abrir ARCA, copia el CUIT del local. El botón chico que
  estaba al lado del CUIT también se sacó, para que no haya dos en la ficha.
  Con `CONSTANCIA_ARCA_SOLO_EN_FICHA = false` (`src/dominio/reglas.js`) la
  tarjeta vuelve al Inicio y el botón chico a la bandeja.
- **El titular tampoco carga el número del documento.** El portal ya no muestra
  el campo "Número del documento": lo carga coordinación al aprobar, en el mismo
  cuadro donde elige el tipo y carga el expediente. Sin número no se puede
  aprobar. Al aprobar se controla que el número no esté ya cargado (en otro
  local si es una DDJJ, o en el mismo local si es un contrato). En la base, la
  presentación queda con `documentacion.numero` en NULL hasta que se aprueba;
  la columna ya acepta NULL, así que no hace falta ningún script. Esto lo maneja
  la misma opción que el tipo y el expediente: `COORDINACION_COMPLETA_PRESENTACION`.
  La carga desde la oficina sigue pidiendo el número, como siempre.

## 23. Accesos para administrativo (3 de noviembre de 2026)

A pedido del área, el administrativo también entra a **Accesos**:

- **Usuarios:** da de alta, edita y da de baja a la gente, igual que Dirección.
- **Tipos de usuario:** los ve para consulta (qué módulos tiene cada tipo), pero
  no mueve las llaves. Los permisos los cambia solo el administrador, y el
  backend ya los aceptaba solo de él (`/configuracion/permisos`, `requiereRol('administrador')`).

**Los administradores no se tocan.** Quien no es administrador (administrativo y
Dirección) no ve a los administradores en la lista de usuarios ni el tipo
"Administrador" en Tipos de usuario, y el formulario no le ofrece ese rol. El
backend rechaza con 403, aunque alguien arme el pedido a mano: dar el rol
administrador, cambiarle el rol a un administrador, darlo de baja o eliminarlo
(`controlarUsuario` y la baja, en `backend/rutas/configuracion.js`). No es un
permiso que se pueda prender desde Tipos de usuario: está fijo en el código, así
que nadie puede darse ese acceso.

Archivos: `src/config/modulos.js` (módulo `accesos`), `src/pages/Accesos.jsx`,
`src/pages/accesos/Usuarios.jsx`, `src/pages/accesos/TiposUsuario.jsx` y
`backend/rutas/configuracion.js` (catálogo `usuarios`).

## 24. Sin permiso para el padrón, no se ofrece la ficha (4 de noviembre de 2026)

En la base del área, el relevador tiene **Padrón de locales** en "no" (se cambió
desde Accesos → Tipos de usuario). Igual veía "Abrir la ficha del local" en el
Mapa, y al tocarlo la app lo devolvía al Inicio: la ficha (`/locales/:id`) está
protegida con el mismo permiso que el padrón.

Ahora el enlace a la ficha sale solo si el rol la puede abrir. Si no puede:

- el nombre del local se sigue leyendo, pero como texto común (tablas del Mapa,
  Relevamientos y "Mis relevamientos");
- "Abrir la ficha del local" (globo del Mapa) y el botón "Ficha" (Mis entregas)
  no aparecen.

Se hace con `EnlaceFicha`, en `src/components/RutaProtegida.jsx`: hace el mismo
control que la ruta. Se usa en `src/pages/Mapa.jsx`, `src/pages/Relevamiento.jsx`,
`src/pages/campo/Relevar.jsx` y `src/pages/campo/Entregas.jsx`. Las pantallas de
oficina siguen con el enlace común: si algún día se le saca el padrón a un rol de
oficina, se cambia ahí `<Link to={`/locales/${id}`}>` por `<EnlaceFicha id={id}>`.

Si se quiere que el relevador SÍ abra la ficha, no hace falta tocar código:
el administrador pone "Padrón de locales" en "ver" para ese tipo de usuario.

## 25. Las notificaciones con la documentación a presentar y el QR (12 de noviembre de 2026)

La Dirección pasó un modelo nuevo de notificación. Se aplica a las dos (primera y
segunda), en el PDF y en "Ver cédula":

- **Texto nuevo:** más corto, las ordenanzas con viñeta (ya no con casillero) y
  "sita en calle" en lugar de "cita". La segunda conserva su plazo y sus firmas.
- **Recuadro antes de las firmas:** "DOCUMENTACIÓN QUE DEBE PRESENTAR · CUATRO (4)
  DOCUMENTOS" con los cuatro ítems. El modelo decía "CINCO (5)" y se corrigió.
- **QR a las plantillas:** a la derecha del recuadro. Lleva a
  `https://campsite.bio/grandesgeneradores`, la página de la Dirección con la DDJJ
  de Generadores Menores, el Formulario de Contrato y la DDJJ de separación de
  residuos. Es la misma dirección del QR del modelo (con su `?qrcode=`, para que
  la Dirección siga contando los escaneos). En pantalla, el QR también se puede
  tocar.

Todo entra en una hoja, con la misma letra de antes.

**Dónde está:** el texto, el recuadro y la dirección del QR, en
`src/dominio/cedulaOficial.js`. El dibujo en el PDF, en
`src/components/pdfCedulas.js` (`recuadroDocumentacion`). La pantalla, en
`src/components/VistaCedula.jsx`, con estilos en `src/App.css` (bloque 14.31).

**Archivo nuevo:** `src/assets/cedula/qr-plantillas.png`, la imagen del QR. Va
dentro de la app, como los logos, así sale también sin señal.

**Para apagarlo,** en `src/dominio/cedulaOficial.js`:

- `TEXTO_NOVIEMBRE = false` vuelve al texto del 26/10 (sigue en el archivo);
- `RECUADRO_DOCUMENTACION = false` saca el recuadro con el QR.

**Si cambia la dirección del QR,** se cambia `URL_PLANTILLAS` en ese archivo y se
vuelve a generar la imagen desde la carpeta del proyecto (no instala nada en el
proyecto):

```
npx --yes qrcode -o src/assets/cedula/qr-plantillas.png -w 400 -e M -q 0 "LA-DIRECCIÓN-NUEVA"
```

## 26. El ícono de la pestaña: el logo de Ciudad SMT (13 de noviembre de 2026)

**Qué cambió:** el ícono que se ve en la pestaña del navegador. Antes salía el
rayo violeta de Vite: el `favicon.svg` de la plantilla seguía declarado y Chrome
lo prefería al PNG "GG". Ahora es el símbolo de Ciudad SMT, el mismo de la barra
azul.

**Dónde está:** en `index.html`, la línea `<link rel="icon" ...>`. Apunta a
`src/assets/logo-ciudad-smt.png`, el logo que ya usaba la barra, así que no hay
archivo nuevo. Al compilar, Vite lo copia a `dist/` con un nombre propio
(`logo-ciudad-smt-XXXX.png`): **al subir el build hay que subir la carpeta
`dist/` completa**, no solo el `index.html`.

**No cambió:** el ícono de la app instalada en el teléfono o la PC sigue siendo
el cuadrado azul "GG SMT" (`public/icono-app-*.png`, `manifest.webmanifest`).

**Si no se ve el cambio:** Chrome guarda el ícono viejo. Recargar con Ctrl+F5 o
cerrar y volver a abrir la pestaña.

**Para volver atrás:** en `index.html`, borrar la línea nueva y descomentar una
de las dos de abajo (el `favicon.svg` o el `icono-app-32.png`).

## 27. El nombre de la persona arriba a la derecha (13 de noviembre de 2026)

**Qué cambió:** volvió a la barra azul el bloque de la derecha con el nombre y el
ícono redondo, como estaba hasta el 06/11. El desplegable "Elegí tu usuario…" no
vuelve: el nombre sale de la sesión de CiDiTuc (el inicio de sesión que agregó
cande el 12/11).

**Qué se lee:**

| Situación | La barra dice |
|---|---|
| Se está consultando la sesión | Ingresando… |
| CiDiTuc mandó el nombre | el nombre (en mayúsculas; si es largo se corta con "…" y se lee entero al pasar el mouse) |
| Entró por CiDiTuc pero sin nombre | Persona N.º 151880 (el número de persona) |
| Sin token, o CiDiTuc apagado en el servidor | Sin identificar |

En el teléfono queda solo el ícono, como antes.

**OJO, el nombre todavía no llega:** al 13/11 el token real de CiDiTuc trae solo
`{ id }` (el número de persona) y la tabla `usuario` no tiene columna de nombre.
Por eso hoy la barra muestra el número. Para que salga el nombre hay que pedirle a
Sistemas que **sume el nombre al token** (por ejemplo `"nombre": "Juan Pérez"`):
`backend/cidituc.js` ya lo lee del campo `nombre`, sin tocar código. Si viene con
otro nombre de campo, se indica en el `.env` del backend:

```
CIDITUC_CAMPO_NOMBRE=nombre_completo
```

Si viene en dos campos (nombre y apellido) o hay que pedirlo a otra dirección de
CiDiTuc, sí hay que tocar `backend/cidituc.js`.

**Dónde está:** `src/components/Navbar.jsx` (lee `usuario.nombreCompleto` de
`useRol()`), estilos en `src/App.css` sección 2 (`.navbar-usuario`). El dato lo
arma `src/auth/RolProvider.jsx` con lo que devuelve `GET /sesion`.

**Para sacarlo:** en `src/components/Navbar.jsx`, `MOSTRAR_PERSONA = false`.
