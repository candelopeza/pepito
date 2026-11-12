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

## 2. La identificación: CiDiTuc (desde el 2026-11-12)

No hay roles de prueba ni usuarios inventados. La identidad la da CiDiTuc:
abre el sistema con un **token** en el parámetro `auth` de la dirección, el
front lo guarda en el navegador (localStorage) y lo saca de la dirección, lo
manda en cada pedido, y el backend lo verifica con el secreto compartido y
saca el **número de persona** (`id_persona`). Con ese número:

- si está en la tabla `usuario` con `habilita = 1`, es personal del área y
  entra con el rol de su tipo de usuario (lo que puede hacer lo define
  Accesos → Tipos de usuario);
- si no está, es público: portal del titular, con el CUIL que traiga el token.

**Lo que hay que configurar en `backend/.env` del servidor** (una sola vez):
el secreto con el que CiDiTuc firma el token, el mismo que usan estadísticas
y reclamos. Lo tiene Sistemas; **no se escribe en el código ni en git**:

```
CIDITUC_SECRETO=<el secreto compartido de CiDiTuc>
```

Si el número de persona no viniera con el nombre `id_persona`, el nombre real
va en `CIDITUC_CAMPO_PERSONA` (también `CIDITUC_CAMPO_CUIL` y
`CIDITUC_CAMPO_NOMBRE`). Las otras formas de verificación (clave pública o
consulta a CiDiTuc) están implementadas por si cambian el mecanismo; ver
`backend/.env.ejemplo`.

**Cómo comprobar que quedó bien**, sin adivinar:

1. `https://grangenerador.smt.gob.ar:3344/salud` tiene que decir `"cidituc":`
   con el modo elegido, no `"apagado"`.
2. Entrar desde CiDiTuc. Si la aplicación sigue mostrando el portal del
   titular a una persona cargada como administrador, abrir la consola del
   navegador (F12): aparece `[CiDiTuc] No se pudo identificar a la persona:`
   seguido del motivo (no llegó token, token inválido o vencido, o CiDiTuc no
   configurado). Si no llegó token, CiDiTuc lo está mandando con otro nombre
   o en otro lugar de la dirección: ver `src/auth/sesion.js`.

La variable `ACEPTAR_ROL_DECLARADO` del `.env` queda en `no` (o sin la
línea). Solo se pone en `si` para correr las pruebas automáticas contra un
backend de prueba o para desarrollar sin CiDiTuc; **nunca en producción**.

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
