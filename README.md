# panal

Headless H3 hexbin for OpenLayers. panal groups points into [H3](https://h3geo.org) cells, reduces
each cell to a number (count, sum, mean, min, max or your own function), picks the H3 resolution from
the map zoom with hysteresis, classifies the cells (quantiles, Jenks, equal interval, standard
deviation or manual breaks) and hands you the legend as data. It ships no colors and no CSS: you own
every pixel through a style function.

```bash
npm install @ghegar/panal
```

| Entry | What it is | Needs |
|---|---|---|
| `@ghegar/panal/classify` | Breaks, class of a value, legend data | nothing |
| `@ghegar/panal` | Aggregation per cell, zoom → resolution picker, cell rings | `h3-js` (bundled dependency) |
| `@ghegar/panal/ol` | Hexbin layer; GeoJSON, `VectorSource`, WFS and server-side cell inputs | `ol >= 10` |
| `@ghegar/panal/worker` | Runs the aggregation in a Web Worker | a module worker |
| `@ghegar/panal/react` | `useHexbinLayer` and `useHexbinSnapshot` | `react >= 19` |

## Classification

```ts
import { classify, classOf, legend } from '@ghegar/panal/classify';

const result = classify(values, { method: 'jenks', classes: 5 });
// { method, breaks: [min, b1, b2, b3, b4, max], requested: 5, actual: 5, stats }

classOf(42, result.breaks);
legend(result, values);
// [{ classIndex, min, max, count, closed: 'left' | 'both' }, ...]
```

- `breaks` holds `actual + 1` numbers, minimum and maximum included.
- Every class is `[min, max)` except the last one, `[min, max]`. The same rule SLD range filters use
  (`>=` lower, `<` upper, `<=` on the last class), so a map and an SLD built from the same breaks agree.
- When the data cannot fill the requested classes (repeated values, fewer values than classes),
  repeated breaks collapse and `actual < requested` tells you so. A last class made only of the
  maximum is kept as `[max, max]`.
- Non-finite values are ignored and get class `-1`.
- `quantile` interpolates linearly at `(n - 1) · i / k`.
- `jenks` is exact Fisher-Jenks. Above 4 000 values it runs on a deterministic sample (sorted values
  at a fixed step, extremes included). Each break is the first value of the upper class.
- `stdDev` builds classes of `interval` standard deviations (`1` or `0.5`) with the middle class
  centered on the mean, up to three deviations; `classes` is ignored.
- `manual` takes your breaks as they are, strictly increasing.

`test/fixtures/classify/*.json` holds the reference vectors other implementations can be checked
against: input values (non-finite ones as the strings `"NaN"` and `"Infinity"`), options and expected
breaks with a relative tolerance.

## Aggregation

```ts
import { aggregate, createResolutionPicker } from '@ghegar/panal';

const cells = aggregate(
    [{ coordinates: [[-103.35, 20.67]], member: 'a', value: 12 }],
    { resolution: 7, reducer: 'mean' },
);
// Map<h3Index, { h3Index, count, valueCount, sum, min, max, value, members }>

const picker = createResolutionPicker({ hysteresis: 0.3 });
picker.pick(map.getView().getZoom());
```

A member with several coordinates (a multipoint) counts once in every cell it touches. Each cell
keeps `count` and `sum`, so the mean of a parent cell can be derived without the points.

The default zoom → resolution table aims at about 40 cells across a 1 000 px viewport at the equator.
Pass your own `table` (`[{ maxZoom, resolution }]`) to change it. With `hysteresis: h` the resolution
only changes once the zoom goes `h` levels past a threshold.

## OpenLayers

```ts
import { createHexbinLayer, fromVectorSource } from '@ghegar/panal/ol';

const hexbin = createHexbinLayer({
    map,
    source: fromVectorSource(points),
    value: 'population',
    reducer: 'sum',
    classification: { method: 'quantile', classes: 5 },
    resolution: { hysteresis: 0.3 },
    style: (feature, { classIndex, value, count, h3Index }) => myStyles[classIndex],
});

hexbin.subscribe(() => renderLegend(hexbin.getSnapshot().legend));
hexbin.setClassification({ method: 'jenks' });
hexbin.setReducer('mean');
hexbin.destroy();
```

The layer reaggregates when the resolution changes on `moveend` and, at most once per frame, when the
vector source changes. Each cell feature carries `h3Index`, `value`, `count`, `classIndex` and
`members`, and its id is the H3 index. Use `resolution: { fixed: 7 }` to pin the resolution.

## Selection

```ts
import { bindCellClick } from '@ghegar/panal/ol';

const unbind = bindCellClick(hexbin, map, { toggle: true });
hexbin.select('87498c96effffff');
hexbin.getSnapshot().selection; // { h3Index, cell, members, status, error } | null
hexbin.cellAt(coordinate);
```

The clicked cell is found by its H3 index, not by hit-testing pixels, so it works on transparent fills
and in tests. The style function receives `selected`. A selection survives reaggregation while its cell
still exists. In server mode, members come from the optional `loadMembers` of the cell provider and
the selection reports `loading` meanwhile.

## WFS

```ts
import { fromWfs } from '@ghegar/panal/ol';

const source = fromWfs({
    url: 'https://example.org/geoserver/wfs',
    typeName: 'ws:points',
    cql: 'year = 2025',
    propertyNames: ['the_geom', 'population'],
    pageSize: 5000,
    maxFeatures: 100_000,
});
source.getState(); // { status, loaded, truncated, error }
```

Nothing is requested until the layer reads the source. Pages are fetched as GeoJSON with
`startIndex` and `count` (`maxFeatures` on WFS 1.1.0), in the projection of the view, so axis order
never gets in the way. `truncated` turns true when the layer has more features than `maxFeatures`.

## Server-side cells

When a server already counted the points, hand panal the cells and it only classifies and draws them.
Each cell needs its H3 index and value; the hexagon is drawn from the index, so the server does not
have to send geometry.

```ts
import { fromCellProvider } from '@ghegar/panal/ol';

const source = fromCellProvider({
    resolutions: [3, 4, 6, 7],
    extentDependent: false,
    load: async ({ resolution, extent, signal }) => {
        const response = await fetch(`/cells?r=${resolution}&bbox=${extent.join(',')}`, { signal });
        return response.json(); // [{ h3Index, value, count? }]
    },
});
```

With `resolutions`, panal asks for the finest available resolution that does not exceed the one the
zoom wants (or the coarsest when none fits). A superseded request is aborted and its answer ignored.
`getSnapshot().status` is `loading` while waiting and `error` (with `error`) if the provider throws.

## Web Worker

```ts
// hexbin.worker.ts
import { installAggregationWorker } from '@ghegar/panal/worker/runtime';
installAggregationWorker(self);
```

```ts
import { createAggregationWorker } from '@ghegar/panal/worker';

const worker = createAggregationWorker(new Worker(new URL('./hexbin.worker.ts', import.meta.url), { type: 'module' }));
createHexbinLayer({ map, source, style, aggregator: worker.aggregate });
```

Coordinates travel as transferable typed arrays and the worker returns per-cell statistics and member
ids. Local and worker aggregation share the same code, so they return the same cells; custom reducers
work too, because the final reduction runs on the main thread. `hexbin.setAggregator(undefined)` goes
back to local aggregation.

## React

```tsx
import { useHexbinLayer, useHexbinSnapshot } from '@ghegar/panal/react';

const hexbin = useHexbinLayer(map && { map, source, style, classification, reducer, value, selectOnClick: true });
const snapshot = useHexbinSnapshot(hexbin);
```

The layer is created in an effect and destroyed on unmount; a new `map` or `source` recreates it.
Style, classification (compared by value), reducer, value field, aggregator and click binding are
applied in place. Custom reducers and style functions are compared by identity: memoize them.

## Development

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run demo
npm run e2e        # Playwright; set CDP_URL to drive an already running Chrome
```

## License

AGPL-3.0-only
