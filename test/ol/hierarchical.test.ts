import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import OlMap from 'ol/Map.js';
import { fromLonLat } from 'ol/proj.js';
import VectorSource from 'ol/source/Vector.js';
import Style from 'ol/style/Style.js';
import View from 'ol/View.js';
import { describe, expect, it } from 'vitest';
import { aggregate, rollup } from '../../src/core/index.js';
import type { Aggregator } from '../../src/core/index.js';
import { createHexbinLayer, fromVectorSource, toInputs } from '../../src/ol/index.js';

const settle = () => new Promise(resolve => setTimeout(resolve, 30));
const style = () => new Style();
const table = [{ maxZoom: 6, resolution: 4 }, { maxZoom: 9, resolution: 6 }, { maxZoom: Infinity, resolution: 8 }];

const seeded = (seed: number): (() => number) => {
    let state = seed;
    return () => {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state / 2147483648;
    };
};

const setup = () => {
    const random = seeded(5);
    const features = Array.from({ length: 800 }, () => new Feature({
        geometry: new Point(fromLonLat([-104 + random() * 2, 20 + random() * 2])),
        pop: Math.round(random() * 100),
    }));
    const vector = new VectorSource<Feature>({ features });
    const map = new OlMap({ view: new View({ center: fromLonLat([-103, 21]), zoom: 10 }) });
    const calls: number[] = [];
    const aggregator: Aggregator = (inputs, options) => {
        calls.push(options.resolution);
        return aggregate(inputs, options);
    };
    return { vector, map, calls, aggregator, features };
};

const zoomTo = (map: OlMap, zoom: number) => {
    map.getView().setZoom(zoom);
    map.dispatchEvent('moveend');
};

const values = (hexbin: ReturnType<typeof createHexbinLayer>) => Object.fromEntries(
    (hexbin.layer.getSource()?.getFeatures() ?? []).map(feature => [feature.getId(), feature.get('value')]),
);

describe('hierarchical resolution', () => {
    it('aggregates once at the finest resolution and rolls up on zoom out', () => {
        const { vector, map, calls, aggregator, features } = setup();
        const hexbin = createHexbinLayer({
            map, source: fromVectorSource(vector), style, aggregator, value: 'pop', reducer: 'sum',
            resolution: { table, hysteresis: 0, latitudeCorrection: false, hierarchical: true },
        });
        expect(hexbin.getSnapshot().resolution).toBe(8);
        zoomTo(map, 8);
        zoomTo(map, 5);
        expect(hexbin.getSnapshot().resolution).toBe(4);
        expect(calls).toEqual([8]);

        const base = aggregate(toInputs(features, 'EPSG:3857', 'pop'), { resolution: 8, reducer: 'sum' });
        const expected = Object.fromEntries([...rollup(base.values(), { resolution: 4, reducer: 'sum' })].map(([h3, cell]) => [h3, cell.value]));
        expect(values(hexbin)).toEqual(expected);
    });

    it('gives the same cells at a zoom whichever way it was reached', () => {
        const { vector, map } = setup();
        const options = { table, hysteresis: 0, latitudeCorrection: false, hierarchical: true } as const;
        const fromFine = createHexbinLayer({ map, source: fromVectorSource(vector), style, resolution: options });
        zoomTo(map, 7);
        const other = new OlMap({ view: new View({ center: fromLonLat([-103, 21]), zoom: 7 }) });
        const direct = createHexbinLayer({ map: other, source: fromVectorSource(vector), style, resolution: options });
        expect(values(fromFine)).toEqual(values(direct));
    });

    it('skips the hierarchy for custom reducers', () => {
        const { vector, map, calls, aggregator } = setup();
        createHexbinLayer({
            map, source: fromVectorSource(vector), style, aggregator, reducer: values => values.length,
            resolution: { table, hysteresis: 0, latitudeCorrection: false, hierarchical: true },
        });
        zoomTo(map, 5);
        expect(calls).toEqual([8, 4]);
    });

    it('recomputes the base when the points change and honours an explicit base', async () => {
        const { vector, map, calls, aggregator } = setup();
        createHexbinLayer({
            map, source: fromVectorSource(vector), style, aggregator,
            resolution: { fixed: 5, hierarchical: { base: 7 } },
        });
        expect(calls).toEqual([7]);
        vector.addFeature(new Feature({ geometry: new Point(fromLonLat([-103, 21])) }));
        await settle();
        expect(calls).toEqual([7, 7]);
    });
});
