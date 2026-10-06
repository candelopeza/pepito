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
│   ├── configuracion.js         usuarios, rubros, feriados, parámetros, plantilla
│   └── herramientas.js          fusiones, geocodificación, informe 9 de Julio, auditoría
├── sql/
│   ├── 01-crear-tablas.sql      OBSOLETO — no correr, borra las tablas del área
│   ├── 02-datos-iniciales.sql   OBSOLETO — pertenece al esquema viejo
│   ├── 03-tabla-feriado.sql     la única tabla que agrega el sistema. Este sí se corre.
│   └── 04-columnas-opcionales.sql  OPCIONAL, habilita dos funciones desactivadas
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

## 3. Lo que agrega el sistema: la tabla de feriados y las del informe 9DJ

| Script | Tabla | Sin ella |
|---|---|---|
| `sql/03-tabla-feriado.sql` | `feriado` | no se pueden calcular días hábiles |
| `sql/04-tabla-auditoria.sql` | `auditoria` | toda acción que mueva un estado falla |

Todo lo demás sale de las diez tablas del área o se resuelve en el backend.

### `auditoria` — el historial de cambios de estado

La pide la sección 5.2 del pliego y es criterio de aceptación: *"Todo cambio de
estado queda registrado con actor, momento y motivo, y es consultable desde la
ficha"*.

La escribe el backend solo, a través de `conAuditoria()` en `consultas.js`, que
mide el estado del local **antes y después** de cada acción y anota si cambió.
Va envuelto así y no anotado a mano en cada ruta porque anotar a mano depende de
que quien escriba la próxima ruta se acuerde, y la que se olvide va a ser justo
la que haga falta el día de una impugnación.

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
| plazos, topes, plantilla de la cédula | `backend/parametros-sistema.js`, en código |
| numeración de cédulas sin repetidos | cola en memoria (`enFila` en `consultas.js`) + `MAX(correlativo)+1` |
| historial de lo que le pasó a un local | la propia tabla `tramite`, que ya lo registra |

**La condición de la numeración**: vale mientras corra **una sola instancia** del
backend. Si algún día se levantan dos procesos (PM2 en modo cluster, o detrás de
un balanceador), cada uno tendría su cola y podrían repetirse números. Ahí sí
haría falta una tabla `secuencia` con `SELECT ... FOR UPDATE`.

### Dos funciones desactivadas

Necesitan columnas que se decidió no agregar, y están en `sql/04-columnas-opcionales.sql`:

- **Constancia de impresión** de la cédula (`tramite.impresa_por`, `impresa_en`).
  `POST /notificaciones/:id/impresion` responde **501** en vez de fingir que
  guardó: si devolviera 200 sin persistir, el área reimprimiría cédulas creyendo
  que nunca salieron.
- **Fusión de duplicados**: funciona igual, pero deja el rastro como texto en
  `local.observacion` (`FUSIONADO EN LOCAL 567 ...`) en lugar de una columna.

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
   primero `sql/03-tabla-feriado.sql` y después `sql/04-tabla-auditoria.sql`.
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
| `GET /locales/:id` | ficha: local, actuaciones, relevamientos, auditoría | — |
| `POST /locales` | alta manual | administrativo+ |
| `PUT /locales/:id` | edición | administrativo+ |
| `DELETE /locales/:id` | baja lógica | coordinación |
| `POST · DELETE /locales/:id/bloqueo` | bloqueo manual | coordinación |
| `GET · POST /relevamientos` | campo | relevador |
| `POST /relevamientos/:localId/revision` | control administrativo | coordinación |
| `GET · POST /notificaciones` | cédulas y emisión | administrativo+ |
| `POST /notificaciones/:id/regenerar` | reemplazo por corrección de datos | administrativo+ |
| `PUT /notificaciones/:id/notificador` | asignación | coordinación |
| `POST /notificaciones/:id/impresion` | constancia de impresión | cualquiera identificado |
| `POST /notificaciones/:id/entrega` | resultado y **arranque del plazo** | notificador |
| `GET /documentacion` · `/pendientes` · `POST /documentacion` | DDJJ y contratos | — |
| `POST /documentacion/:id/validacion` | aprobar o rechazar | administrativo+ |
| `POST /locales/:id/prorrogas` | prórroga (días corridos) | coordinación |
| `POST /locales/:id/expedientes` | expediente de multa | administrativo+ |
| `POST /locales/:id/reingreso` | vuelve al circuito, sube el ciclo | coordinación |
| `GET · POST /configuracion/:catalogo` | rubros, usuarios, feriados | coordinación |
| `GET /configuracion/parametros` · `/plantilla` | plazos y plantilla (solo lectura: viven en el código) | — |
| `GET · POST /herramientas/fusiones` | duplicados | coordinación |
| `POST /herramientas/geocodificar` | coordenadas faltantes | administrativo+ |
| `POST /herramientas/informe-9dj` | carga del informe de la prestataria | administrativo+ |

Las reglas que el servidor hace cumplir y el front no puede garantizar:

- sin CUIT, razón social y rubro **no se emite** una cédula (la notificación
  sería impugnable, sección 4.3);
- el relevador **no puede** registrar CUIT ni razón social (sección 6.2);
- una presentación del portal entra **pendiente** y no suspende ningún plazo
  hasta que un agente la aprueba (sección 6.3);
- la prórroga solo se otorga con las dos notificaciones agotadas, y respeta el
  tope de días y el máximo por ciclo de Configuración;
- el vencimiento de una notificación se calcula **una sola vez**, al registrar la
  entrega, con los feriados y parámetros vigentes ese día.

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

**Tres cosas no están disponibles desde la aplicación**, y cada una avisa por
qué cuando se la intenta usar: la constancia de impresión (faltan las columnas),
y la edición de parámetros y de la plantilla (viven en el código).

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

## 8. El módulo Informe 9 de Julio (modelo de foto)

El informe que manda la prestataria es una **foto de su padrón de contratos**:
la primera carga produjo las altas históricas (los 260 contratos con
`origen = 'INFORME_9DJ'` que se cargaron a mano en la base); cada carga
siguiente dice quién sigue, quién se suma y quién ya no está.

Las piezas:

| Pieza | Qué hace |
| --- | --- |
| `lector-informe-9dj.js` | archivo → filas normalizadas. CSV/XLSX/PDF con texto; dígito verificador de CUIT; OCR previsto, no implementado |
| `rutas/informe-9dj.js` | cargas, decisión fila por fila, aplicar, descartar, anular |
| `sql/05-tablas-informe-9dj.sql` | las dos tablas del módulo (`informe_9dj`, `informe_9dj_fila`), con su justificación en el encabezado |
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
