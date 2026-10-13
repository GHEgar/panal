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
| `@ghegar/panal/ol` | Hexbin layer with GeoJSON and `VectorSource` inputs | `ol >= 10` |

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

## Development

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run demo
```

## License

AGPL-3.0-only
