# Puesta en marcha para la entrega

Qué hay que hacer —y en qué orden— para que el Sistema Grandes Generadores
quede operando con usuarios reales, sin perfiles de prueba, listo para sumarse
a CiDiTuc como un portal más.

## 1. Los usuarios reales (se cargan desde la base, una sola vez)

Decisión de la Dirección (2026-11-06): los usuarios se cargan **solo desde la
base de datos**, no desde la aplicación. Sin usuarios cargados la aplicación
abre directo en el portal del titular y la barra no ofrece nada.

1. Correr una vez `backend/sql/14-vaciar-usuarios.sql` en HeidiSQL: saca a
   todos los usuarios de prueba (a los que firmaron trámites los deja dados de
   baja, para no romper el historial).
2. Cargar a cada agente del área con un INSERT como el que está al final de
   ese mismo script: su **número de persona** (id_persona, el identificador
   del padrón municipal, el mismo que usará CiDiTuc) y su tipo (2 relevador,
   3 notificador, 4 administrativo, 5 coordinación, 6 dirección,
   8 administrador). El backend lo toma solo en menos de un minuto.
3. Con un administrador cargado, entrar y verificar en **Accesos** que cada
   tipo de usuario tenga habilitados los módulos que le corresponden (ya
   vienen con el reparto del pliego; solo revisar). Desde **Accesos →
   Usuarios** también se puede dar de alta o de baja, pero lo acordado es
   hacerlo desde la base.

## 2. Los perfiles de prueba ya están apagados

Desde el 2026-11-06 no hay roles de prueba ni usuarios inventados: no hay
nada que configurar.

- El servidor **solo reconoce a los usuarios cargados en la base**, por su
  número de persona. Un nombre que no está en la base no puede escribir.
- La aplicación no tiene forma de identificarse todavía: todo el que entra
  es público (portal del titular). Decisión de la Dirección del 2026-11-06:
  los tipos de usuario se vinculan directamente cuando el sistema se sume a
  CiDiTuc. Hasta entonces el personal del área no puede operar desde la app.
- La variable `ACEPTAR_ROL_DECLARADO` del `.env` queda en `no` (o sin la
  línea). Solo se pone en `si` para correr las pruebas automáticas contra un
  backend de prueba; **nunca en producción**.

Cuando el sistema se sume al login único, la identidad la provee CiDiTuc y se
cambian dos archivos: `backend/middlewares/usuario.js` (leer el token en vez
de los headers) y `src/auth/RolProvider.jsx` (llamar a `elegirAgente` con la
persona de la sesión). Las rutas y las pantallas no se tocan.

## 3. Revisar la configuración (pantalla Parámetros)

- **Correo para solicitar expedientes de multa**: a qué dependencia se pide el
  número (PENDIENTE de confirmar con la Dirección).
- **¿El portal muestra los números de expediente?**: por defecto NO; es
  decisión de la Dirección.
- Los plazos (5 y 3 días hábiles) y el resto ya están según el pliego.

## 4. La base de datos

- Las tablas del sistema ya están creadas (scripts `backend/sql/03` a `13`,
  todos idempotentes: correrlos de nuevo no rompe nada). El `14` es el que
  vacía los usuarios de prueba (paso 1).
- Los datos de prueba (locales "cande", cargas de ensayo del informe 9DJ,
  trámites de ensayo) quedaron dados de baja lógica el 2026-10-15: no se ven
  en el sistema, pero están en la base con `habilita = 0` por si hace falta
  revisar algo.
- **Pendiente de datos**: el KML oficial del límite municipal (copiarlo a
  `backend/datos/limite-municipal.kml` y reiniciar; mientras tanto valida
  contra el límite de OpenStreetMap, que es el real).

## 5. Publicar el sistema

El front se compila a **un solo archivo**:

```
npm install
npm run build        →  deja dist/index.html
```

Ese `dist/index.html` es la aplicación entera. No hay que tocar nada antes de
compilar: `.env.production` ya trae la dirección de la API del servidor.

Cómo está armado el servidor (verificado el 2026-11-06 contra lo publicado):

| | |
| --- | --- |
| Servidor | **181.105.6.205** |
| La aplicación | **https://grangenerador.smt.gob.ar** (puerto 443): la sirve **Apache**, que entrega el `dist/index.html` copiado en su carpeta |
| La API | **https://grangenerador.smt.gob.ar:3344** : el backend Node escucha en el 3344 con su propio HTTPS (certificado del municipio, igual que CiDiTuc y el turnero; ver `servidor.js`) |
| Cómo se unen | el front compilado lleva `VITE_API_URL=https://grangenerador.smt.gob.ar:3344/` (`.env.production`), y el backend acepta ese origen con `ORIGEN_FRONT` |

**Cada vez que se actualiza el sistema**, en el servidor:

```
git pull
npm install           (solo si cambió package.json)
npm run build         →  copiar dist/index.html a la carpeta que sirve Apache
cd backend
npm install           (solo si cambió backend/package.json)
reiniciar el backend
```

Si se olvida el paso de copiar el `dist/index.html`, la dirección sigue
mostrando la versión anterior aunque el código ya esté actualizado.

El backend corre con Node 22 (`npm run start` en `backend/`), con su
`backend/.env` (se arma copiando `backend/.env.ejemplo`; **nunca** se sube a
git) con los datos de la base real y además:

```
PUERTO=3344
ORIGEN_FRONT=https://grangenerador.smt.gob.ar
CARPETA_ARCHIVOS=<la carpeta que asigne Sistemas, incluida en el respaldo>
ACEPTAR_ROL_DECLARADO=no
```

Conviene dejar el backend como servicio del servidor, para que arranque solo.

## 6. Qué queda afuera de esta entrega (pendientes conocidos)

| Pendiente | De quién depende |
| --- | --- |
| Ingreso por CiDiTuc (login único, titular incluido) | Dirección de Innovación Tecnológica |
| KML oficial del ejido | Dirección de Ambiente |
| Correo y estados reales de la dependencia de multas | Dirección |
| Primer informe real de 9 de Julio (ajustar el lector si el formato difiere) | Prestataria |
| ¿Portal muestra números de expediente? | Dirección |

Ninguno bloquea la operación diaria: el sistema funciona completo con la
identificación por número de persona y la carga manual.
