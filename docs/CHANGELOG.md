# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado con
[SemVer](https://semver.org/lang/es/).

## [No publicado]

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
