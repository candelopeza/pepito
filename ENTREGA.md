# Puesta en marcha para la entrega

Qué hay que hacer —y en qué orden— para que el Sistema Grandes Generadores
quede operando con usuarios reales, sin perfiles de prueba, listo para sumarse
a CiDiTuc como un portal más.

## 1. Los usuarios (YA EJECUTADO el 2026-10-15)

La identidad es el **id_persona**: el mismo identificador que usa CiDiTuc. La
base ya tiene un perfil por cada rol, listo para operar:

| id_persona | Rol |
| --- | --- |
| 140849, 140850 | Administrador del sistema |
| RELEVADOR-1 | Relevador de campo |
| NOTIFICADOR-1 | Notificador |
| ADMINISTRATIVO-1 | Administrativo |
| COORDINACION-1 | Coordinación |
| DIRECCION-1 | Dirección |
| TITULAR-1 | Titular (portal) |

**Lo único que queda para Dirección**: cuando cada agente esté registrado en
CiDiTuc, entrar a **Accesos → Usuarios** y reemplazar el identificador de
arranque (RELEVADOR-1, etc.) por el id_persona real de esa persona, o crearle
su usuario con el rol que corresponda. Nada más: el rol lo determina la base,
no el navegador.

## 2. Los perfiles de prueba (YA ELIMINADOS)

No existen más usuarios de fantasía ni selector de rol de prueba: se eliminó
el código (no se apagó). La barra tiene un único desplegable **"Elegí tu
usuario…"** con los usuarios reales de la base, y el backend corre con
`ACEPTAR_ROL_DECLARADO=no` (ya puesto en `backend/.env`): un navegador que
declare un rol sin ser un usuario de la base recibe "Falta identificar al
usuario" en toda escritura.

> Para correr las suites de prueba (`npm run expedientes`, `npm run informe`,
> etc.) hace falta un backend en modo prueba: cambiar esa línea a
> `ACEPTAR_ROL_DECLARADO=si` y reiniciar (y volver a `no` al terminar).
> Las suites usan usuarios declarados a propósito, para no firmar actos con
> identidades reales.

## 3. Revisar la configuración (pantalla Parámetros)

- **Correo para solicitar expedientes de multa**: a qué dependencia se pide el
  número (PENDIENTE de confirmar con la Dirección).
- **¿El portal muestra los números de expediente?**: por defecto NO; es
  decisión de la Dirección.
- Los plazos (5 y 3 días hábiles) y el resto ya están según el pliego.

## 4. La base de datos

- Las tablas del sistema ya están creadas (scripts `backend/sql/03` a `10`,
  todos idempotentes: correrlos de nuevo no rompe nada).
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

Ese `dist/index.html` es la aplicación entera: se aloja donde indique la
Dirección de Innovación Tecnológica (el mismo esquema que cualquier portal
municipal). Antes de compilar, poner en el `.env` de la raíz la dirección
real de la API:

```
VITE_API_URL=https://<donde-corra-el-backend>
```

El backend corre con Node 22:

```
cd backend
npm install
npm run start        →  escucha en el puerto 3000 (o PUERTO= en el .env)
```

con su `backend/.env` apuntando a la base real (ya existe; **nunca** se sube a
git) más la línea del paso 2. Conviene dejarlo como servicio de Windows o del
servidor que asigne DITEC, para que arranque solo.

## 6. Qué queda afuera de esta entrega (pendientes conocidos)

| Pendiente | De quién depende |
| --- | --- |
| Ingreso por CiDiTuc (login único, titular incluido) | Dirección de Innovación Tecnológica |
| KML oficial del ejido | Dirección de Ambiente |
| Correo y estados reales de la dependencia de multas | Dirección |
| Primer informe real de 9 de Julio (ajustar el lector si el formato difiere) | Prestataria |
| ¿Portal muestra números de expediente? | Dirección |

Ninguno bloquea la operación diaria: el sistema funciona completo con la
identificación por legajo y la carga manual.
