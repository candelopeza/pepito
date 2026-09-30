# Backend Grandes Generadores: cómo se armó y cómo seguir

API en **Node 24 + Express 5** sobre **MariaDB**. Las tablas se administran con
**HeidiSQL**. Este documento explica qué hay en cada archivo, por qué está ahí y
cómo se hizo, paso a paso.

## 1. Qué hay en la carpeta

```
backend/
├── package.json              dependencias y scripts del servidor (aparte del front)
├── servidor.js               ARRANQUE: crea Express, monta rutas, escucha el puerto
├── conexion-bd.js            la conexión a MariaDB (pool) y las funciones para consultar
├── .env                      credenciales de la base y puerto. NO se sube a git
├── .env.ejemplo              copia del .env sin datos reales, para el repo
├── middlewares/
│   └── usuario.js            quién pide y con qué rol; requiereRol() para proteger rutas
├── rutas/                    un archivo por recurso, cada uno dice qué función del store reemplaza
│   ├── locales.js               padrón, bloqueo
│   ├── relevamientos.js         campo y control administrativo
│   ├── notificaciones.js        cédulas: emisión, impresión, asignación, entrega
│   ├── documentacion.js         DDJJ y contratos, validación del portal
│   ├── prorrogas-expedientes.js prórroga, expediente de multa, reingreso
│   ├── configuracion.js         usuarios, rubros, feriados, parámetros, plantilla
│   └── herramientas.js          fusiones, geocodificación, informe 9 de Julio, auditoría
├── sql/
│   ├── 01-crear-tablas.sql   el esquema completo, para correr en HeidiSQL
│   └── 02-datos-iniciales.sql parámetros, secuencias, rubros, feriados y usuarios
└── PROCEDIMIENTO.md          este archivo
```

## 2. Cómo se hizo cada cosa

### 2.1 Análisis previo

Antes de escribir nada se leyó el front:

- `src/datos/DatosProvider.jsx`: cada función es un endpoint. De ahí sale la lista
  de rutas que hay que escribir (25 funciones).
- `src/datos/semilla.js`: la forma de los datos. De ahí salen las tablas.
- `src/dominio/*.js`: se comprobó que no importa React ni usa `window`,
  `localStorage` ni `fetch`. Por eso el servidor lo puede importar tal cual.

### 2.2 package.json propio

Se creó dentro de `backend/` para que las dependencias del servidor no se mezclen
con las del front (Vite, React, MUI). Tiene `"type": "module"` porque el dominio
del front usa `import`/`export`, y el servidor lo importa.

Scripts:

```bash
npm run dev     # arranca y se reinicia solo al guardar un archivo (--watch)
npm start       # arranca sin recarga
```

Se usa `--env-file-if-exists=.env` de Node en vez de la librería `dotenv`: Node 24
lee el `.env` solo.

Dependencias instaladas con `npm install`:

| Paquete   | Para qué |
|-----------|----------|
| `express` | el servidor HTTP y las rutas |
| `mysql2`  | el driver de MariaDB/MySQL con soporte de promesas y pool |
| `cors`    | permitir que el front en el puerto 5173 le pegue a la API en el 3000 |

### 2.3 servidor.js

1. Crea la app de Express.
2. Middlewares generales: `cors`, `express.json` (lee el body), `identificarUsuario`.
3. Ruta `/salud` para comprobar que está vivo sin tocar la base.
4. Monta cada archivo de `rutas/` en su prefijo.
5. Un manejador de 404 y otro de errores: cualquier `throw` o `next(e)` en una ruta
   termina en un JSON `{ error }` con código 500 (o el que traiga el error).

### 2.4 conexion-bd.js

- `createPool` de `mysql2/promise` con los datos del `.env`.
- `dateStrings: true`: las fechas vuelven como texto `YYYY-MM-DD`, que es el
  formato que usa `src/dominio/fechas.js`. Sin esto llegan como `Date` con zona
  horaria y los plazos se corren un día.
- `consultar(sql, params)`: SELECT con parámetros `?` (nunca concatenar texto en el
  SQL) y devuelve las filas con columnas en camelCase.
- `ejecutar(sql, params)`: INSERT/UPDATE/DELETE, devuelve `insertId` y `affectedRows`.
- `enTransaccion(fn)`: para operaciones que tocan varias tablas a la vez, por
  ejemplo emitir una cédula (inserta la actuación y avanza la secuencia).
- `aCamel` / `aSnake`: el único puente entre `nombre_local` (base) y `nombreLocal` (JS).

### 2.5 middlewares/usuario.js

Provisorio hasta CiDiTuc. El front manda dos headers en cada pedido:

```
x-usuario-nombre: Mariano Agustín
x-usuario-rol: coordinacion
```

- `identificarUsuario` deja `req.usuario = { nombre, rol }` o `null`.
- `requiereRol('coordinacion', 'direccion')` se pone en la ruta que lo necesite:
  devuelve 401 si no hay usuario y 403 si el rol no alcanza.
- `firmante(req)` da el nombre para firmar actuaciones y auditoría.

Cuando exista el login único cambia solo este archivo. Las rutas no se tocan.

### 2.6 rutas/

Cada archivo empieza con una tabla que dice **qué función de DatosProvider.jsx
reemplaza cada ruta**. Convenciones:

- `GET` lista o trae uno. `POST` crea o ejecuta una acción. `PUT` modifica. `DELETE` borra.
- Las acciones sobre un local van como sub-ruta: `POST /locales/:id/bloqueo`,
  `POST /locales/:id/prorrogas`.
- Toda ruta que toca la base va en `try/catch` y llama `next(e)` en el catch.
- Las rutas que todavía no están hechas responden **501** con el nombre de la
  función que reemplazan, así se ve enseguida qué falta.

Hechas en este paso: `GET /salud`, `GET /locales`, `GET /locales/:id` (con
estado calculado, actuaciones, relevamientos y auditoría), y los `GET` de
relevamientos, notificaciones, documentación pendiente, catálogos, parámetros,
plantilla, fusiones y auditoría.

### 2.7 El estado del local se calcula, no se guarda

Igual que en el front. `rutas/locales.js` importa `resolverEstado` de
`../../src/dominio/reglas.js` y lo aplica a cada local con la lista de
actuaciones. No hay columna `estado` en la tabla `locales`, a propósito.

### 2.8 sql/01-crear-tablas.sql

Una tabla por colección de la semilla:

| Tabla           | Origen en semilla.js        | Notas |
|-----------------|-----------------------------|-------|
| `locales`       | `LOCALES_INICIALES`         | sin columna estado; `estado_inicial` es el punto de partida del cálculo |
| `relevamientos` | `RELEVAMIENTOS_INICIALES`   | coordenada del dispositivo, no del local |
| `actuaciones`   | `ACTUACIONES_INICIALES`     | una sola tabla, columnas específicas por tipo en NULL |
| `usuarios`      | `USUARIOS_INICIALES`        | |
| `rubros`        | `RUBROS_INICIALES`          | |
| `feriados`      | `FERIADOS_INICIALES`        | tres alcances |
| `parametros`    | `PARAMETROS_INICIALES` + `PLANTILLA_INICIAL` | una sola fila, id = 1 |
| `secuencias`    | `SECUENCIAS_INICIALES`      | `cedula`, `expediente` |
| `auditoria`     | `auditoria: []`             | la escribe el servidor en cada cambio de estado |
| `fusiones`      | `fusiones: []`              | |

Convenciones: snake_case, `DATE` para fechas sin hora, `DATETIME` con hora,
`TINYINT(1)` para booleanos, `utf8mb4`. Las claves foráneas de `relevamientos` y
`actuaciones` a `locales` tienen `ON DELETE CASCADE`, que es lo que hace hoy
`eliminarLocal` en el front.

### 2.9 sql/02-datos-iniciales.sql

Carga lo necesario para que el sistema funcione: parámetros, plantilla,
secuencias (arrancan en 1284 y 96, los últimos números del sistema viejo),
rubros, feriados 2026 y usuarios. **No carga locales de prueba**: el padrón real
viene del Excel del área.

### 2.10 .gitignore

Se agregó `backend/.env` al `.gitignore` de la raíz. `node_modules` ya estaba.

### 2.11 Accesos: rol administrador, permisos_modulos y tipos_usuario

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

Rutas en `rutas/configuracion.js`: `GET /configuracion/permisos` ya funciona y
devuelve `{ modulos, rolesDeshabilitados }`. Las de escritura responden 501
hasta que se implementen y tienen que exigir rol administrador en el middleware:
`PUT /configuracion/permisos/:modulo/:rol`, `PUT /configuracion/permisos/rol/:rol`
y `DELETE /configuracion/permisos/rol/:rol`.

## 3. Cómo se probó

Se arrancó el servidor sin base de datos y se le pegó a varias rutas:

| Pedido | Respuesta | Qué demuestra |
|--------|-----------|---------------|
| `GET /salud` | 200 | el servidor levanta y Express responde |
| `GET /locales` | 500 `ECONNREFUSED 127.0.0.1:3306` | la ruta y el import del dominio funcionan; falta la base |
| `POST /locales` | 501 con el nombre de la función pendiente | el patrón de pendientes |
| `GET /configuracion/otro` | 404 | la lista blanca de catálogos |
| `GET /noexiste` | 404 | el manejador de rutas inexistentes |

## 4. Cómo ponerlo en marcha

1. **Base**: abrir HeidiSQL, conectarse al servidor MariaDB, cargar
   `sql/01-crear-tablas.sql` y ejecutarlo (F9). Después lo mismo con
   `sql/02-datos-iniciales.sql`.
2. **Credenciales**: editar `backend/.env` con host, puerto, usuario y clave que
   usa HeidiSQL. El nombre de la base es `grandes_generadores`.
3. **Arrancar**:
   ```bash
   cd backend
   npm install      # solo la primera vez
   npm run dev
   ```
4. **Comprobar**: abrir `http://localhost:3000/salud` y después
   `http://localhost:3000/configuracion/rubros`. Si el segundo devuelve los ocho
   rubros, la conexión a la base está bien.

## 5. Lo que sigue

1. Implementar las rutas que hoy responden 501, en este orden: locales,
   relevamientos, notificaciones, documentación, prórrogas/expedientes,
   configuración, herramientas. Cada una copia la lógica de la función
   correspondiente de `DatosProvider.jsx` y escribe la auditoría cuando cambia
   el estado.
2. Importador del Excel del área a `locales`, `relevamientos` y `actuaciones`.
   Antes de eso, revisar si el Excel trae columnas que las tablas no tienen.
3. Cambiar `src/datos/DatosProvider.jsx` para que haga `fetch` a esta API en
   vez de leer `localStorage`. Es el único archivo del front que se toca.
4. Reemplazar `middlewares/usuario.js` por la validación de CiDiTuc.
