# Puesta en marcha para la entrega

Qué hay que hacer —y en qué orden— para que el Sistema Grandes Generadores
quede operando con usuarios reales, sin perfiles de prueba, listo para sumarse
a CiDiTuc como un portal más.

## 1. Los usuarios reales (lo hace Dirección, una sola vez)

Hoy la base tiene los usuarios cargados para las pruebas. Hay que cargar a
cada agente del área:

1. Entrar al sistema → **Accesos → Usuarios**.
2. Crear un usuario por persona, con su **número de persona** (id_persona,
   el identificador del padrón municipal) y su tipo (relevador,
   notificador, administrativo, coordinación, dirección).
3. Verificar en **Accesos** que cada rol tenga habilitados los módulos que le
   corresponden (ya vienen con el reparto del pliego; solo revisar).

## 2. Apagar los perfiles de prueba (una línea en el servidor)

En `backend/.env`, agregar:

```
ACEPTAR_ROL_DECLARADO=no
```

y reiniciar el backend. Con eso:

- El servidor deja de aceptar roles declarados por el navegador: **solo
  reconoce a los usuarios cargados en la base**, por su número de persona.
- La barra del sistema cambia sola: desaparecen el selector de rol de prueba y
  los nombres supuestos (Jorge Medina, Ana Gómez, etc.) y queda un único
  desplegable **"Elegí tu usuario…"** con los agentes reales.
- El buscador de prueba del portal del titular ("ver como el CUIT…") también
  se oculta.

Esta identificación por número de persona es provisoria **hasta CiDiTuc**: cuando el
sistema se sume al login único, la identidad la provee CiDiTuc y se reemplaza
un solo archivo del backend (`middlewares/usuario.js`) y el selector de la
barra. Las rutas no se tocan.

## 3. Revisar la configuración (pantalla Parámetros)

- **Correo para solicitar expedientes de multa**: a qué dependencia se pide el
  número (PENDIENTE de confirmar con la Dirección).
- **¿El portal muestra los números de expediente?**: por defecto NO; es
  decisión de la Dirección.
- Los plazos (5 y 3 días hábiles) y el resto ya están según el pliego.

## 4. La base de datos

- Las tablas del sistema ya están creadas (scripts `backend/sql/03` a `13`,
  todos idempotentes: correrlos de nuevo no rompe nada). El `13` (cédula por
  correo) además necesita el servidor SMTP en `backend/.env` (`CORREO_*`);
  sin eso la opción no aparece y todo sigue en papel.
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
identificación por número de persona y la carga manual.
