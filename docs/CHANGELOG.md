# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado con
[SemVer](https://semver.org/lang/es/).

## [No publicado]

## [0.4.0] - 2026-10-13

### Agregado

- `rollup`: celdas padre desde celdas hijas, sin los puntos, con los reductores integrados.
- `rollup` en `fromCellProvider`: si el zoom pide una resolución más gruesa que las del servidor, se
  sube la más gruesa disponible (`mean` ponderado por `count`).
- Corrección por latitud en el selector de resolución (`pick(zoom, latitude)`), activa por defecto; la
  capa usa la latitud del centro de la vista.
- `createWorkerWfsSource`: descarga, parseo y agregación del WFS dentro del worker; solo las celdas
  llegan al hilo principal y los miembros se piden al seleccionar.
- `openChannel`: el agregador y varias fuentes comparten un worker con ids por canal y cancelación.
- Workflow de GitHub Pages para el demo.

### Cambiado

- El protocolo del worker tiene mensajes con tipo e ids de texto.
- La paginación del WFS vive en un módulo sin OpenLayers (`fetchWfsPages`), compartido con el worker.

## [0.3.0] - 2026-10-13

### Agregado

- Selección de celdas: `cellAt` por índice H3 (sin depender del render), `select`, `bindCellClick` con
  alternancia y `selection` en el snapshot con miembros y estado. La selección sobrevive al reagrupado
  mientras la celda exista.
- `loadMembers` en `fromCellProvider` para traer los miembros de una celda en modo servidor.
- `selected` en el contexto de estilo y `setStyle` en la capa.
- `@ghegar/panal/react`: `useHexbinLayer` y `useHexbinSnapshot`.
- `sortBy` en `fromWfs`.
- Espera configurable (`debounce`, 150 ms) en los pedidos por extensión del modo servidor.
- Pruebas e2e con Playwright contra el demo; el demo muestra la celda seleccionada.

## [0.2.0] - 2026-10-13

### Agregado

- `fromWfs`: `GetFeature` en GeoJSON paginado con `startIndex`, `CQL_FILTER`, `propertyName`, tope
  `maxFeatures` con aviso de truncado, estado (`idle`, `loading`, `ready`, `error`) y recarga.
- `fromCellProvider`: modo servidor con celdas ya agregadas (`h3Index`, `value`, `count`), resoluciones
  disponibles y pedido por extensión opcional; el hexágono se dibuja desde el índice.
- `@ghegar/panal/worker` y `@ghegar/panal/worker/runtime`: agregación en Web Worker con arreglos
  transferibles.
- `packInputs`, `aggregatePacked` y `unpackCells` en el núcleo.
- La capa acepta `aggregator` y `setAggregator`; su snapshot suma `status` y `error`. Cada pedido
  async aborta el anterior y descarta respuestas viejas.
- Demo: fuente WFS (`sf:bugsites`), servidor simulado, casilla de worker y preselección por URL.

### Cambiado

- `aggregate` empaqueta y desempaqueta por dentro: local y worker comparten el mismo camino.

## [0.1.0] - 2026-10-13

### Agregado

- `@ghegar/panal/classify`, sin dependencias: cuantiles con interpolación, Fisher-Jenks exacto con
  muestra determinista arriba de 4 000 valores, intervalos iguales, desviación estándar (1 σ o ½ σ,
  hasta 3 σ) y cortes manuales; `classOf` con intervalos `[min, max)` y la última clase cerrada;
  `legend` con conteo por clase; aviso de clases fundidas (`requested` contra `actual`).
- Vectores de referencia de la clasificación en `test/fixtures/classify/`.
- `aggregate`: puntos en lon/lat a celdas H3 con `count`, `sum`, `mean`, `min`, `max` o una función
  propia; cada miembro cuenta una vez por celda que toca.
- `createResolutionPicker` con histéresis y `defaultResolutionTable` derivada del tamaño de celda.
- `cellRing`: anillo cerrado y desenvuelto en el antimeridiano.
- `@ghegar/panal/ol`: `createHexbinLayer` con fuentes `fromVectorSource` y `fromGeoJSON`, snapshot
  con resolución, celdas, clasificación y leyenda, reagrupado en `moveend` y por frame al cambiar la
  fuente.
- Demo en Vite con puntos sintéticos y piel propia.
