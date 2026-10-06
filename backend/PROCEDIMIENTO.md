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
   Mientras tanto, en producción poner `ACEPTAR_ROL_DECLARADO=no` en el `.env`.
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
