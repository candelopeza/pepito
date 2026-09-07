# Graph Report - pepito  (2026-09-04)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 326 nodes · 1157 edges · 12 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3ed30d24`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- AccionesLocal.jsx
- fechas.js
- useDatos
- dependencies
- useRol
- DatosProvider.jsx
- Documentacion.jsx
- Local.jsx
- Mapa.jsx
- duplicados.js
- .oxlintrc.json

## God Nodes (most connected - your core abstractions)
1. `useDatos()` - 59 edges
2. `fmtFecha()` - 41 edges
3. `useRol()` - 29 edges
4. `react` - 29 edges
5. `Aviso()` - 27 edges
6. `hoyISO()` - 26 edges
7. `PageHeader()` - 25 edges
8. `DatosProvider()` - 20 edges
9. `Badge()` - 19 edges
10. `Vacio()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `est()` --calls--> `resolverEstado()`  [EXTRACTED]
  pruebas/criterios.mjs → src/dominio/reglas.js
- `CrudCatalogo()` --calls--> `useDatos()`  [EXTRACTED]
  src/components/CrudCatalogo.jsx → src/datos/datosContexto.js
- `BadgeEstado()` --calls--> `colorEstado()`  [EXTRACTED]
  src/components/ui/Badge.jsx → src/dominio/estados.js
- `BadgeEstado()` --calls--> `etiquetaEstado()`  [EXTRACTED]
  src/components/ui/Badge.jsx → src/dominio/estados.js
- `FormDocumento()` --calls--> `useDatos()`  [EXTRACTED]
  src/components/FormDocumento.jsx → src/datos/datosContexto.js

## Import Cycles
- None detected.

## Communities (12 total, 0 thin omitted)

### Community 0 - "AccionesLocal.jsx"
Cohesion: 0.19
Nodes (17): react, CrudCatalogo(), Aviso(), Vacio(), Badge(), BadgeEstado(), Campo(), CampoSelect() (+9 more)

### Community 1 - "fechas.js"
Cohesion: 0.07
Nodes (42): conExpediente, conProrrogaVencida, conProrrogaVigente, docVigente, dosNotifs, est(), localCompleto, localIncompleto (+34 more)

### Community 2 - "useDatos"
Cohesion: 0.10
Nodes (39): App(), AccionesLocal(), cerrar(), terminar(), Dato(), completar(), VistaCedula(), ALCANCES_FERIADO (+31 more)

### Community 3 - "dependencies"
Cohesion: 0.05
Nodes (40): @emotion/react, @emotion/styled, @mui/icons-material, @mui/material, @mui/x-data-grid, oxlint, dependencies, @emotion/react (+32 more)

### Community 4 - "useRol"
Cohesion: 0.10
Nodes (24): RolContext, useRol(), esRolValido(), LISTA_ROLES, ROL_POR_DEFECTO, ROL_SISTEMA, ROLES, RolProvider() (+16 more)

### Community 5 - "DatosProvider.jsx"
Cohesion: 0.13
Nodes (31): DatosContext, conLocal(), DatosProvider(), leerAlmacen(), siguienteId(), crearSemilla(), bandejas(), cedulas() (+23 more)

### Community 6 - "Documentacion.jsx"
Cohesion: 0.18
Nodes (14): Detalle(), HistorialActuaciones(), documentosDe(), ETIQUETA_DOCUMENTO, notificacionesDe(), ordenarCronologico(), ORIGENES_DOCUMENTO, RESULTADOS_ENTREGA (+6 more)

### Community 7 - "Local.jsx"
Cohesion: 0.21
Nodes (9): FormLocal(), enviar(), validar(), ESTILO, Grilla(), puedeEditar(), LISTA_ESTADOS, Local() (+1 more)

### Community 8 - "Mapa.jsx"
Cohesion: 0.24
Nodes (10): local(), dentroDelMunicipio(), distancia(), geocodificar(), LIMITE_MUNICIPAL, ordenarPorProximidad(), RECUADRO_MUNICIPAL, COLOR_HEX (+2 more)

### Community 9 - "duplicados.js"
Cohesion: 0.39
Nodes (8): buscarDuplicados(), normalizarCuit(), normalizarNombre(), partirDireccion(), RUIDO, similitud(), Duplicados(), Informe9DJ()

### Community 10 - ".oxlintrc.json"
Cohesion: 0.25
Nodes (7): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema, oxc, warn

## Knowledge Gaps
- **68 isolated node(s):** `CAMPOS`, `COLOR_ALCANCE`, `CAMPOS`, `CAMPOS`, `COLOR_NIVEL` (+63 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 87 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useDatos()` connect `useDatos` to `AccionesLocal.jsx`, `fechas.js`, `useRol`, `Documentacion.jsx`, `Local.jsx`, `Mapa.jsx`, `duplicados.js`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Why does `react` connect `AccionesLocal.jsx` to `useDatos`, `useRol`, `DatosProvider.jsx`, `Documentacion.jsx`, `Local.jsx`, `Mapa.jsx`, `.oxlintrc.json`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `useRol()` connect `useRol` to `AccionesLocal.jsx`, `useDatos`, `DatosProvider.jsx`, `Documentacion.jsx`, `Local.jsx`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **What connects `CAMPOS`, `COLOR_ALCANCE`, `CAMPOS` to the rest of the system?**
  _68 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `fechas.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07312925170068027 - nodes in this community are weakly interconnected._
- **Should `useDatos` be split into smaller, more focused modules?**
  _Cohesion score 0.09574468085106383 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.04878048780487805 - nodes in this community are weakly interconnected._