# <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/icon-dark.svg"><img src=".github/assets/icon-light.svg" width="36" height="36" alt=""></picture> panal

[![npm](https://img.shields.io/npm/v/@ghegar/panal)](https://www.npmjs.com/package/@ghegar/panal)
[![size](https://img.shields.io/bundlejs/size/@ghegar/panal)](https://bundlejs.com/?q=@ghegar/panal)
[![license](https://img.shields.io/github/license/GHEgar/panal)](LICENSE)

Headless H3 hexbin for OpenLayers: local, worker or server aggregation, zoom-driven resolution and classification.

![20 000 points as H3 cells: zooming in from r3 to r6 over central Mexico, switching from quantiles to Jenks and equal interval, and zooming back out](.github/assets/demo.gif)

**[Live demo](https://ghegar.github.io/panal/)**

panal owns the numbers — the [H3](https://h3geo.org) cell of each point, the value of each cell (count,
sum, mean, min, max or your own function), the resolution for the zoom with hysteresis, the class breaks
and the legend as data — and you own every pixel: it ships no colors and no CSS, only a style function
that receives `classIndex`, `value`, `count` and `selected`. Points are grouped on the main thread, in a
Web Worker or by your server.

## Install

```bash
npm install @ghegar/panal
```

| Entry | What it is | Needs |
|---|---|---|
| `@ghegar/panal/classify` | Breaks, class of a value, legend data | nothing |
| `@ghegar/panal` | Aggregation per cell, rollup, zoom → resolution picker, cell rings | `h3-js` (bundled dependency) |
| `@ghegar/panal/ol` | Hexbin layer, selection; GeoJSON, `VectorSource`, WFS and server-side cell inputs | `ol >= 10` |
| `@ghegar/panal/worker` | Client that runs the aggregation in a Web Worker | a module worker |
| `@ghegar/panal/worker/runtime` | `installAggregationWorker(self)` for your worker file | `h3-js` |
| `@ghegar/panal/react` | `useHexbinLayer` and `useHexbinSnapshot` | `react >= 19` |

## Quick start

```ts
import { createHexbinLayer, fromVectorSource } from '@ghegar/panal/ol';
import { Fill, Style } from 'ol/style.js';

const colors = ['#fde8d0', '#f9b97c', '#ef7d43', '#b8442a', '#5a1a14'];
const styles = colors.map(color => new Style({ fill: new Fill({ color }) }));

const hexbin = createHexbinLayer({
    map,
    source: fromVectorSource(points),
    classification: { method: 'jenks', classes: 5 },
    style: (_, { classIndex }) => styles[classIndex],
});

hexbin.subscribe(() => renderLegend(hexbin.getSnapshot().legend));
```

## Classification

```ts
import { classify, classOf, legend } from '@ghegar/panal/classify';

const result = classify(values, { method: 'jenks', classes: 5 });
classOf(42, result.breaks);
legend(result, values);
```

`classify` returns `{ method, breaks, requested, actual, stats }`; `legend` returns
`[{ classIndex, min, max, count, closed: 'left' | 'both' }]`.

| Method | Breaks |
|---|---|
| `quantile` | Linear interpolation at `(n - 1) · i / k` |
| `jenks` | Exact Fisher-Jenks; each break is the first value of the upper class. Above 4 000 values it runs on a deterministic sample (sorted values at a fixed step, extremes included) |
| `equalInterval` | `classes` intervals of the same width between minimum and maximum |
| `stdDev` | Classes of `interval` standard deviations (`1` or `0.5`), the middle one centered on the mean, up to three deviations; `classes` is ignored |
| `manual` | Your breaks as they are, strictly increasing |

- `breaks` holds `actual + 1` numbers, minimum and maximum included.
- Every class is `[min, max)` except the last one, `[min, max]`: the rule SLD range filters use (`>=`
  lower, `<` upper, `<=` on the last class), so a map and an SLD built from the same breaks agree.
- When the data cannot fill the requested classes (repeated values, fewer values than classes),
  repeated breaks collapse and `actual < requested` tells you so. A last class made only of the
  maximum is kept as `[max, max]`.
- Non-finite values are ignored and get class `-1`.

`test/fixtures/classify/*.json` holds reference vectors to check other implementations against: input
values (non-finite ones as the strings `"NaN"` and `"Infinity"`), options and expected breaks with a
relative tolerance.

## Aggregation and resolution

```ts
import { aggregate, createResolutionPicker } from '@ghegar/panal';

const cells = aggregate([{ coordinates: [[-103.35, 20.67]], member: 'a', value: 12 }], { resolution: 7, reducer: 'mean' });
const picker = createResolutionPicker({ hysteresis: 0.3 });
picker.pick(map.getView().getZoom() ?? 0);
```

`aggregate` returns a `Map<h3Index, { h3Index, count, valueCount, sum, min, max, value, members }>`. A
member with several coordinates (a multipoint) counts once in every cell it touches.

| Piece | Behavior |
|---|---|
| Default table | About 40 cells across a 1 000 px viewport at the equator. Pass your own `table` (`[{ maxZoom, resolution }]`) to change it |
| Hysteresis | With `hysteresis: h` the resolution only changes once the zoom goes `h` levels past a threshold |
| Latitude | `pick(zoom, latitude)` adds `log2(1 / cos φ)` to the zoom, because Web Mercator stretches cells away from the equator; the layer passes the latitude of the view center. Off with `latitudeCorrection: false` |
| `rollup(cells, { resolution, reducer })` | Parent cells from finer ones without the points: counts, sums and value counts add up, min and max combine, the mean is `sum / valueCount`. Custom reducers cannot be rolled up |
| `resolution: { hierarchical: true }` | The layer aggregates the points once, at the finest resolution of the table (or `hierarchical: { base }`), and derives every coarser one with `rollup`. Zooming out no longer walks the points, and a zoom level always shows the same cells however it was reached. Custom reducers bypass it |
| `resolution: { fixed: 7 }` | Pins the resolution |

## OpenLayers

```ts
import { bindCellClick, createHexbinLayer, fromVectorSource } from '@ghegar/panal/ol';

const hexbin = createHexbinLayer({
    map,
    source: fromVectorSource(points),
    value: 'population',
    reducer: 'sum',
    style: (feature, { classIndex, selected }) => (selected ? highlight : myStyles[classIndex]),
});

hexbin.setClassification({ method: 'jenks' });
hexbin.setReducer('mean');
const unbind = bindCellClick(hexbin, map, { toggle: true });
hexbin.destroy();
```

The layer adds itself to `map`, defaults to `reducer: 'count'`, quantiles in 5 classes and hysteresis
0.3, and reaggregates when the resolution changes on `moveend` and, at most once per frame, when the
vector source changes. Each cell feature carries `h3Index`, `value`, `count` and `classIndex`, and its id
is the H3 index. Members are not stored on the feature, so cell features stay plain data that can be
serialized (to GeoJSON, to a MapLibre source); read them with `getCell(h3Index)`, `cellAt(coordinate)`
or from `getSnapshot().selection`.

The selection, `{ h3Index, cell, members, status, error } | null`, is set with `select(h3Index)` or a
click. The clicked cell is found by its H3 index, not by hit-testing pixels, so it works on transparent
fills and in tests. It survives reaggregation while its cell still exists. In server mode, members come
from the optional `loadMembers` of the cell provider and the selection reports `loading` meanwhile.

### Sources

| Source | Where the points live |
|---|---|
| `fromGeoJSON(data)` | A GeoJSON object or string, read in the projection of the view |
| `fromVectorSource(source)` | An OpenLayers `VectorSource`; changes are picked up |
| `fromWfs(options)` | Pages of a WFS, on the main thread |
| `createWorkerWfsSource(thread, options)` | Pages of a WFS, kept inside the worker |
| `fromCellProvider(options)` | No points: cells already counted by your server |

`fromWfs({ url, typeName, cql, propertyNames, sortBy, version, pageSize, maxFeatures })` defaults to
WFS `'2.0.0'` (or `'1.1.0'`), pages of 5000 and 100 000 features at most; `cql` is a filter such as
`'year = 2025'`. Nothing is requested until the layer reads the source. Pages are fetched as GeoJSON
with `startIndex` and `count` (`maxFeatures` on WFS 1.1.0), in the projection of the view, so axis order
never gets in the way. `getState()` returns `{ status, loaded, truncated, error }`; `truncated` turns
true when the layer has more features than `maxFeatures`.

### Server-side cells

```ts
import { fromCellProvider } from '@ghegar/panal/ol';

const source = fromCellProvider({
    resolutions: [3, 4, 6, 7],
    extentDependent: false,
    load: async ({ resolution, extent, signal }) => {
        const response = await fetch(`/cells?r=${resolution}&bbox=${extent.join(',')}`, { signal });
        return response.json();
    },
});
```

`load` returns `[{ h3Index, value, count? }]`; panal only classifies and draws, and the hexagon comes
from the index, so the server sends no geometry. With `resolutions`, panal asks for the finest available
resolution that does not exceed the one the zoom wants (or the coarsest when none fits). Add
`rollup: 'sum' | 'min' | 'max' | 'mean'` and, when the zoom wants a coarser resolution than the server
has, panal rolls the coarsest one up; `mean` is weighted by `count`. A superseded request is aborted and
its answer ignored. `getSnapshot().status` is `loading` while waiting and `error` (with `error`) if the
provider throws.

## Web Worker

```ts
import { installAggregationWorker } from '@ghegar/panal/worker/runtime';
installAggregationWorker(self);
```

```ts
import { createAggregationWorker } from '@ghegar/panal/worker';

const thread = new Worker(new URL('./hexbin.worker.ts', import.meta.url), { type: 'module' });
const worker = createAggregationWorker(thread);
createHexbinLayer({ map, source, style, aggregator: worker.aggregate });
```

The first block is your `hexbin.worker.ts`, compiled with the `WebWorker` lib. Coordinates travel as transferable typed arrays and the
worker returns per-cell statistics and member ids. Local and worker aggregation share the same code, so
they return the same cells; custom reducers work too, because the final reduction runs on the main
thread. `hexbin.setAggregator(undefined)` goes back to local aggregation.

### WFS inside the worker

For large layers the cost is downloading and parsing, not grouping. `createWorkerWfsSource` pages the
WFS inside the worker (in `EPSG:3857`, converted with an inverse Mercator), aggregates there, and only
cells cross to the main thread. Clicked cells fetch their members from the worker and rebuild them as
features.

```ts
import { createWorkerWfsSource } from '@ghegar/panal/ol';

const source = createWorkerWfsSource(thread, { url, typeName: 'ws:points', value: 'population', reducer: 'sum' });
createHexbinLayer({ map, source, style });
source.setReducer('mean');
```

The aggregator and any number of worker sources can share one `Worker`; `getState()` works as in
`fromWfs`. Add `bbox: { geometryName: 'geom', margin: 0.5 }` to download only the view, grown by
`margin` on each side so the cells along the visible edge are complete. The box goes into the CQL as
`BBOX(geom, …, 'EPSG:3857')`, joined with your own `cql`. While the view stays inside what was
downloaded nothing is fetched again; leaving it fetches the new area and aborts the previous one.
`lonLatToMercatorExtent`, `expandExtent`, `containsExtent` and `bboxCql` are exported to count the same
view before downloading it.

## React

```tsx
import { useHexbinLayer, useHexbinSnapshot } from '@ghegar/panal/react';

const hexbin = useHexbinLayer(map && { map, source, style, classification, reducer, value, selectOnClick: true });
const snapshot = useHexbinSnapshot(hexbin);
```

The layer is created in an effect and destroyed on unmount; a new `map` or `source` recreates it.
Style, classification (compared by value), reducer, value field, aggregator and click binding are
applied in place. Custom reducers and style functions are compared by identity: memoize them.

## Known limitations

- Custom reducers cannot be rolled up, bypass the hierarchical mode and do not run in
  `createWorkerWfsSource`, which takes only built-in reducers.
- H3 children overhang their parent, so a rolled-up cell is the H3 hierarchy's answer, not the same as
  aggregating the points straight at the coarse resolution: in a test over central Mexico about 6 % of
  points land in a different coarse cell. Totals are preserved.
- WFS needs GeoJSON output (`application/json`) and paging with `startIndex`. `cql` and `bbox` travel
  as `CQL_FILTER`, a GeoServer vendor parameter.

## Development

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run demo
npm run e2e
```

`npm run e2e` runs Playwright; set `CDP_URL` to drive an already running Chrome. The demo shows 20 000
synthetic points over Mexico, the `sf:bugsites` WFS of a public GeoServer on the main thread or inside
the worker, and a simulated server with resolutions 3 to 7; it switches reducer (including a custom
range), classification method and number of classes, and selects cells on click.

## Contributing

Issues are welcome. Open one before sending a pull request.

## License

AGPL-3.0-only © GHEgar
