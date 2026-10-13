import OlMap from 'ol/Map.js';
import { fromLonLat } from 'ol/proj.js';
import Style from 'ol/style/Style.js';
import View from 'ol/View.js';
import { describe, expect, it, vi } from 'vitest';
import { bboxCql, containsExtent, expandExtent, lonLatToMercatorExtent } from '../../src/ol/bbox.js';
import { createHexbinLayer, createWorkerWfsSource } from '../../src/ol/index.js';
import { installAggregationWorker } from '../../src/worker/runtime-index.js';
import { createPortPair } from './ports.js';

const settle = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms));

const setup = () => {
    const { main, scope } = createPortPair();
    const cqls: string[] = [];
    const fetch = vi.fn(async (input: string | URL | Request) => {
        cqls.push(new URL(String(input)).searchParams.get('CQL_FILTER') ?? '');
        const features = [{ type: 'Feature', id: 'p.1', properties: {}, geometry: { type: 'Point', coordinates: fromLonLat([-103.35, 20.67]) } }];
        return new Response(JSON.stringify({ type: 'FeatureCollection', numberMatched: 1, features }));
    }) as unknown as typeof globalThis.fetch;
    installAggregationWorker(scope, { fetch });
    const map = new OlMap({ view: new View({ center: fromLonLat([-103.35, 20.67]), zoom: 10 }) });
    map.setSize([800, 600]);
    return { main, map, cqls };
};

const parseBox = (cql: string) => (cql.match(/BBOX\(geom, ([^']+), 'EPSG:3857'\)/)?.[1] ?? '').split(', ').map(Number);

describe('bbox helpers', () => {
    it('converts, grows and compares extents', () => {
        const extent = lonLatToMercatorExtent([-1, -1, 1, 1]);
        expect(extent[0]).toBeCloseTo(fromLonLat([-1, -1])[0] as number, 3);
        expect(extent[3]).toBeCloseTo(fromLonLat([1, 1])[1] as number, 3);
        const grown = expandExtent([0, 0, 10, 20], 0.5);
        expect(grown).toEqual([-5, -10, 15, 30]);
        expect(containsExtent(grown, [0, 0, 10, 20])).toBe(true);
        expect(containsExtent([0, 0, 10, 20], grown)).toBe(false);
        expect(bboxCql('geom', [1, 2, 3, 4], "x = 'a'")).toBe("BBOX(geom, 1.00, 2.00, 3.00, 4.00, 'EPSG:3857') AND (x = 'a')");
    });
});

describe('worker WFS by bbox', () => {
    it('asks only for the grown view and reuses it while the view stays inside', async () => {
        const { main, map, cqls } = setup();
        const source = createWorkerWfsSource(main, { url: 'https://x/wfs', typeName: 'ws:p', cql: "kind = 'a'", bbox: { geometryName: 'geom', margin: 0.5 } });
        expect(source.extentDependent).toBe(true);
        const hexbin = createHexbinLayer({ map, source, style: () => new Style(), resolution: { fixed: 7 } });
        await settle();
        expect(cqls).toHaveLength(1);
        expect(cqls[0]).toContain("AND (kind = 'a')");
        const [minX, , maxX] = parseBox(cqls[0] ?? '');
        const view = map.getView().calculateExtent(map.getSize());
        const width = (view[2] as number) - (view[0] as number);
        expect((maxX as number) - (minX as number)).toBeCloseTo(width * 2, -1);
        expect(hexbin.getSnapshot().cellCount).toBe(1);

        map.getView().setCenter(fromLonLat([-103.3, 20.7]));
        map.dispatchEvent('moveend');
        await settle(250);
        expect(cqls).toHaveLength(1);

        map.getView().setCenter(fromLonLat([-99, 19.4]));
        map.dispatchEvent('moveend');
        await settle(250);
        expect(cqls).toHaveLength(2);
    });

    it('without bbox downloads everything once', async () => {
        const { main, map, cqls } = setup();
        const source = createWorkerWfsSource(main, { url: 'https://x/wfs', typeName: 'ws:p' });
        expect(source.extentDependent).toBe(false);
        createHexbinLayer({ map, source, style: () => new Style(), resolution: { fixed: 7 } });
        await settle();
        expect(cqls).toEqual(['']);
    });
});
