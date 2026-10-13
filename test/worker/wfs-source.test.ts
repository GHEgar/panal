import OlMap from 'ol/Map.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import Style from 'ol/style/Style.js';
import View from 'ol/View.js';
import { describe, expect, it, vi } from 'vitest';
import { createHexbinLayer, createWorkerWfsSource, fromWfs } from '../../src/ol/index.js';
import { createAggregationWorker } from '../../src/worker/index.js';
import { installAggregationWorker, mercatorToLonLat } from '../../src/worker/runtime-index.js';
import { createPortPair } from './ports.js';

const settle = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));
const style = () => new Style();

const lonLats: [number, number][] = [[-103.35, 20.67], [-103.3501, 20.6701], [-100.31, 25.67], [-99.13, 19.43], [-99.131, 19.431]];

const fakeWfs = () => {
    const urls: URL[] = [];
    const fetch = vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input));
        urls.push(url);
        const start = Number(url.searchParams.get('startIndex'));
        const count = Number(url.searchParams.get('count'));
        const features = lonLats.slice(start, start + count).map((lonLat, i) => ({
            type: 'Feature',
            id: `p.${start + i}`,
            properties: { pop: (start + i + 1) * 10 },
            geometry: { type: 'Point', coordinates: fromLonLat(lonLat) },
        }));
        return new Response(JSON.stringify({ type: 'FeatureCollection', numberMatched: lonLats.length, features }));
    });
    return { fetch: fetch as unknown as typeof globalThis.fetch, urls };
};

const setup = () => {
    const { main, scope } = createPortPair();
    const server = fakeWfs();
    installAggregationWorker(scope, { fetch: server.fetch });
    return { main, server };
};

const mapAt = () => new OlMap({ view: new View({ center: fromLonLat([-103.35, 20.67]), zoom: 9 }) });

describe('mercatorToLonLat', () => {
    it('matches OpenLayers', () => {
        for (const lonLat of lonLats) {
            const [lon, lat] = mercatorToLonLat(...(fromLonLat(lonLat) as [number, number]));
            const expected = toLonLat(fromLonLat(lonLat));
            expect(lon).toBeCloseTo(expected[0] as number, 9);
            expect(lat).toBeCloseTo(expected[1] as number, 9);
        }
    });
});

describe('createWorkerWfsSource', () => {
    it('downloads in the worker and gives the same cells as the main thread WFS source', async () => {
        const { main, server } = setup();
        const source = createWorkerWfsSource(main, { url: 'https://x/wfs', typeName: 'ws:p', pageSize: 2, value: 'pop', reducer: 'sum' });
        const states: string[] = [];
        source.subscribe(() => states.push(source.getState().status));
        const remote = createHexbinLayer({ map: mapAt(), source, style, resolution: { fixed: 7 } });
        await settle();
        expect(server.urls.map(url => url.searchParams.get('startIndex'))).toEqual(['0', '2', '4']);
        expect(server.urls[0]?.searchParams.get('srsName')).toBe('EPSG:3857');
        expect(source.getState()).toMatchObject({ status: 'ready', loaded: 5, truncated: false });
        expect(states[0]).toBe('loading');

        const local = createHexbinLayer({
            map: mapAt(),
            source: fromWfs({ url: 'https://x/wfs', typeName: 'ws:p', fetch: fakeWfs().fetch }),
            value: 'pop',
            reducer: 'sum',
            style,
            resolution: { fixed: 7 },
        });
        await settle();
        const values = (layer: typeof remote) => Object.fromEntries(
            (layer.layer.getSource()?.getFeatures() ?? []).map(feature => [feature.getId(), [feature.get('value'), feature.get('count')]]),
        );
        expect(values(remote)).toEqual(values(local));
        expect(values(remote)['87498c96effffff']).toEqual([30, 2]);
    });

    it('rebuilds members as features in the view projection', async () => {
        const { main } = setup();
        const source = createWorkerWfsSource(main, { url: 'https://x/wfs', typeName: 'ws:p' });
        const hexbin = createHexbinLayer({ map: mapAt(), source, style, resolution: { fixed: 7 } });
        await settle();
        hexbin.select('87498c96effffff');
        await settle();
        const members = hexbin.getSnapshot().selection?.members ?? [];
        expect(members.map(member => member.getId())).toEqual(['p.0', 'p.1']);
        expect(members[0]?.get('pop')).toBe(10);
        const coordinates = (members[0]?.getGeometry() as unknown as { getCoordinates: () => number[] }).getCoordinates();
        expect(toLonLat(coordinates)[0]).toBeCloseTo(-103.35, 6);
    });

    it('reaggregates in the worker when the reducer changes', async () => {
        const { main, server } = setup();
        const source = createWorkerWfsSource(main, { url: 'https://x/wfs', typeName: 'ws:p', value: 'pop' });
        const hexbin = createHexbinLayer({ map: mapAt(), source, style, resolution: { fixed: 7 } });
        await settle();
        source.setReducer('mean');
        await settle();
        expect(hexbin.layer.getSource()?.getFeatureById('87498c96effffff')?.get('value')).toBe(15);
        expect(server.urls).toHaveLength(1);
        source.reload();
        await settle();
        expect(server.urls).toHaveLength(2);
    });

    it('shares the worker with the aggregator', async () => {
        const { main } = setup();
        const aggregator = createAggregationWorker(main);
        const source = createWorkerWfsSource(main, { url: 'https://x/wfs', typeName: 'ws:p' });
        const [cells] = await Promise.all([
            aggregator.aggregate([{ coordinates: [[-103.35, 20.67]], member: 'a' }], { resolution: 7 }),
            source.load({ resolution: 7, extent: [-180, -90, 180, 90], projection: 'EPSG:3857', signal: new AbortController().signal }),
        ]);
        expect(cells.get('87498c96effffff')?.members).toEqual(['a']);
    });

    it('reports download errors and retries on reload', async () => {
        const { main, scope } = createPortPair();
        let fail = true;
        installAggregationWorker(scope, {
            fetch: (async (input: string | URL | Request) => (fail ? new Response('down', { status: 503 }) : fakeWfs().fetch(input))) as typeof fetch,
        });
        const source = createWorkerWfsSource(main, { url: 'https://x/wfs', typeName: 'ws:p' });
        const hexbin = createHexbinLayer({ map: mapAt(), source, style, resolution: { fixed: 7 } });
        await settle();
        expect(source.getState().status).toBe('error');
        expect(hexbin.getSnapshot().status).toBe('error');
        fail = false;
        source.reload();
        await settle();
        expect(hexbin.getSnapshot()).toMatchObject({ status: 'ready', cellCount: 3 });
    });

    it('cancels an aborted load request', async () => {
        const { main } = setup();
        const source = createWorkerWfsSource(main, { url: 'https://x/wfs', typeName: 'ws:p' });
        const controller = new AbortController();
        const pending = source.load({ resolution: 7, extent: [-180, -90, 180, 90], projection: 'EPSG:3857', signal: controller.signal });
        await settle();
        controller.abort();
        await expect(source.load({ resolution: 7, extent: [-180, -90, 180, 90], projection: 'EPSG:3857', signal: controller.signal })).rejects.toThrow('aborted');
        await expect(pending).resolves.toHaveLength(3);
    });
});
