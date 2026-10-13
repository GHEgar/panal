# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado con
[SemVer](https://semver.org/lang/es/).

## [No publicado]

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
