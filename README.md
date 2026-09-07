# Sistema Grandes Generadores — front end

Aplicación web para el circuito de Grandes Generadores de la Dirección de Ambiente
(Secretaría de Ambiente y Sustentabilidad, San Miguel de Tucumán).

Reemplaza al sistema actual de Google Sheets + AppSheet + Apps Script. Está construida
siguiendo la *Guía de construcción de la aplicación web*, v2.2, y cada archivo cita la
sección del pliego que implementa.

> **No hay backend todavía.** Todo el estado vive en `src/datos/` y se guarda en el
> almacenamiento del navegador. Es una maqueta funcional: las reglas de negocio son las
> definitivas, la persistencia no.

## Cómo correrlo

```bash
npm install
npm run dev      # servidor de desarrollo
npm test         # criterios de aceptación del capítulo 10 del pliego
npm run lint     # oxlint
npm run build    # arma dist/index.html en UN SOLO archivo (se abre desde el disco)
```

El build queda en un único `index.html` con el JS y el CSS incrustados
(`vite-plugin-singlefile`), para poder mandarlo por correo y abrirlo con doble clic. Por
eso las URLs llevan `#` (`HashRouter`) y no hay ninguna dependencia de red: si se pasa a
`BrowserRouter` o se agrega una capa de mapa que baje tiles, eso se rompe.

## Cómo está organizado

El código está en cuatro capas y la dependencia va siempre en un sentido:
**dominio ← datos ← componentes ← páginas**. El dominio no sabe que existe React.

```
src/
├── dominio/        LAS REGLAS. Sin React, sin pantallas, sin datos.
│   ├── estados.js       los 24 estados del local (cap. 3)
│   ├── fechas.js        días hábiles y feriados (sec. 4.1)
│   ├── vigencias.js     vencimiento de DDJJ y contratos (sec. 4.2)
│   ├── reglas.js        *** el motor de estados y las acciones (cap. 4) ***
│   ├── actuaciones.js   los tipos de acto administrativo (sec. 5.1)
│   ├── geo.js           geocodificación, validación territorial y ruteo (sec. 9.2)
│   └── duplicados.js    detección de locales cargados dos veces (sec. 9.4)
│
├── datos/          EL STORE. Hoy reemplaza al backend.
│   ├── semilla.js       datos de prueba: un local en cada estado del circuito
│   ├── DatosProvider.jsx  todo lo que MODIFICA datos. Un endpoint por función.
│   ├── datosContexto.js   el hook useDatos()
│   └── vistas.js        lo que se DERIVA de los datos (bandejas, indicadores)
│
├── auth/           quién es el usuario y con qué rol entró (cap. 7)
├── config/
│   ├── modulos.js       *** LA TABLA DE PERMISOS: qué ve cada rol ***
│   └── catalogos.js     enumerados del dominio que no son tablas
├── components/     piezas reutilizables (ui/) y las de este dominio
└── pages/          una carpeta por ámbito: oficina, campo/, herramientas/, config/
```

### Las tres cosas que hay que entender antes de tocar nada

**1. El estado del local es un valor calculado, no un campo.**
No existe una columna `estado` que alguien pueda dejar desactualizada. Se deduce del
historial de actuaciones cada vez que se necesita, con `resolverEstado()` de
`dominio/reglas.js`. Las funciones del store registran ACTUACIONES; el estado sale de
eso. Es lo que hace imposible el bug crónico del sistema viejo.

**2. Los permisos se definen en un solo archivo.**
`src/config/modulos.js`. De ahí salen a la vez las tarjetas del inicio, los ítems del
menú lateral y el bloqueo por URL. Sacar un rol de un módulo lo saca de los tres lugares.
Ojo: **esto no es seguridad**, es interfaz. La restricción de verdad va en el backend.

**3. Las acciones disponibles se definen en un solo lugar.**
La tabla `ACCIONES` de `dominio/reglas.js` dice qué acto se habilita en qué estado y para
qué rol. `components/AccionesLocal.jsx` la ejecuta. Por eso el tablero, la ficha del local
y la cola de emisión ofrecen exactamente lo mismo: no hay forma de que se desalineen.

## Lo que el pliego marca como pendiente

Nada de esto está resuelto en el código a propósito: quedó como parámetro editable en
**Configuración → Parámetros**, para no tener que reprogramar cuando se defina.

| Tema | Con quién | Dónde está hoy |
|---|---|---|
| Si el día de la entrega cuenta como día uno | Área legal | `contarDiaEntrega` |
| Cuándo vence una DDJJ emitida un 29 de febrero | Área legal | `modoBisiesto` |
| Exigir datos registrales antes del expediente | Ambiente + legal | `exigirDatosSiempre` |
| Emisión de cédulas manual o automática | Dirección de Ambiente | `emisionAutomatica` |
| Tope de días y cantidad de prórrogas | Área legal | `topeProrrogaDias`, `maxProrrogasPorLocal` |
| Timbrado de las presentaciones | Dirección Técnica | asume pago íntegro en CiDiTuc |
| Vínculo titular ↔ local en CiDiTuc | Dirección Técnica | campo `titularCuil`, cargado a mano |
| Integración con expedientes municipales | Dirección Técnica | número manual + reconciliación |

Además hay dos cosas que **hay que reemplazar** antes de producción:

- **`dominio/geo.js`**: el polígono del ejido municipal es una aproximación. Va la capa
  KML de límites que tiene la Dirección de Ambiente. La función `geocodificar()` es
  simulada: va el servicio del municipio.
- **`components/SelectorRol.jsx`**: el selector de rol de la barra superior es una
  herramienta de prueba. Cualquiera puede auto-asignarse Coordinación. Se borra entero
  cuando exista el login de CiDiTuc.

## Pruebas

`npm test` corre los criterios de aceptación del capítulo 10 escritos como pruebas
concretas: cómputo de plazos con feriados, vigencias, prórrogas, debido proceso y las
transiciones de la máquina de estados. **Si tocás el dominio, corrélas antes de dar el
cambio por bueno**: cada línea de ahí es un acto administrativo que puede salir mal.
