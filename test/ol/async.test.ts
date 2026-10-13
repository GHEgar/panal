import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import OlMap from 'ol/Map.js';
import { fromLonLat } from 'ol/proj.js';
import VectorSource from 'ol/source/Vector.js';
import Style from 'ol/style/Style.js';
import View from 'ol/View.js';
import { describe, expect, it, vi } from 'vitest';
import { aggregate } from '../../src/core/index.js';
import type { Aggregator } from '../../src/core/index.js';
import { createHexbinLayer, effectiveResolution, fromCellProvider, fromVectorSource, fromWfs } from '../../src/ol/index.js';
import type { CellRequest } from '../../src/ol/index.js';

const settle = () => new Promise(resolve => setTimeout(resolve, 30));
const style = () => new Style();
const mapAt = (zoom: number) => new OlMap({ view: new View({ center: fromLonLat([-103.35, 20.67]), zoom }) });

describe('effectiveResolution', () => {
    it('takes the finest available resolution not above the requested one', () => {
        expect(effectiveResolution(8, [3, 4, 6, 7])).toBe(7);
        expect(effectiveResolution(5, [3, 4, 6, 7])).toBe(4);
        expect(effectiveResolution(2, [3, 4, 6, 7])).toBe(3);
        expect(effectiveResolution(9, null)).toBe(9);
    });
});

describe('server mode', () => {
    it('loads cells for the effective resolution and draws them from the index', async () => {
        const requests: CellRequest[] = [];
        const source = fromCellProvider({
            resolutions: [4, 7],
            load: async (request) => {
                requests.push(request);
                return [
                    { h3Index: '87498c96effffff', value: 12, count: 3 },
                    { h3Index: '87498c968ffffff', value: 4 },
                ];
            },
        });
        const hexbin = createHexbinLayer({ map: mapAt(9), source, style, resolution: { table: [{ maxZoom: Infinity, resolution: 8 }] } });
        expect(hexbin.getSnapshot().status).toBe('loading');
        await settle();
        expect(requests[0]?.resolution).toBe(7);
        expect(requests[0]?.signal).toBeInstanceOf(AbortSignal);
        const snapshot = hexbin.getSnapshot();
        expect(snapshot).toMatchObject({ status: 'ready', resolution: 7, cellCount: 2 });
        const cell = hexbin.layer.getSource()?.getFeatureById('87498c96effffff');
        expect(cell?.get('value')).toBe(12);
        expect(cell?.get('count')).toBe(3);
        expect(cell?.getGeometry()?.getType()).toBe('Polygon');
    });

    it('drops stale answers and aborts superseded requests', async () => {
        const signals: AbortSignal[] = [];
        let call = 0;
        const source = fromCellProvider({
            extentDependent: true,
            debounce: 0,
            load: ({ signal }) => {
                signals.push(signal);
                call += 1;
                const value = call;
                return new Promise(resolve => setTimeout(() => resolve([{ h3Index: '87498c96effffff', value }]), value === 1 ? 20 : 1));
            },
        });
        const map = mapAt(9);
        const hexbin = createHexbinLayer({ map, source, style, resolution: { fixed: 7 } });
        map.dispatchEvent('moveend');
        await settle();
        expect(signals[0]?.aborted).toBe(true);
        expect(hexbin.layer.getSource()?.getFeatureById('87498c96effffff')?.get('value')).toBe(2);
    });

    it('debounces extent requests while the resolution stays put', async () => {
        const load = vi.fn(async () => [{ h3Index: '87498c96effffff', value: 1 }]);
        const map = mapAt(9);
        createHexbinLayer({ map, source: fromCellProvider({ extentDependent: true, debounce: 20, load }), style, resolution: { fixed: 7 } });
        map.dispatchEvent('moveend');
        map.dispatchEvent('moveend');
        map.dispatchEvent('moveend');
        expect(load).toHaveBeenCalledTimes(1);
        await settle();
        expect(load).toHaveBeenCalledTimes(2);
    });

    it('surfaces provider errors', async () => {
        const source = fromCellProvider({ load: async () => { throw new Error('nope'); } });
        const hexbin = createHexbinLayer({ map: mapAt(9), source, style, resolution: { fixed: 7 } });
        await settle();
        expect(hexbin.getSnapshot()).toMatchObject({ status: 'error' });
        expect(hexbin.getSnapshot().error?.message).toBe('nope');
    });
});

describe('async aggregator', () => {
    it('aggregates through the given aggregator and can switch back to local', async () => {
        const vector = new VectorSource<Feature>({ features: [new Feature({ geometry: new Point(fromLonLat([-103.35, 20.67])) })] });
        const calls: number[] = [];
        const spy: Aggregator = async (inputs, options) => {
            calls.push(options.resolution);
            return aggregate(inputs, options);
        };
        const hexbin = createHexbinLayer({ map: mapAt(9), source: fromVectorSource(vector), style, aggregator: spy, resolution: { fixed: 7 } });
        expect(hexbin.getSnapshot().status).toBe('loading');
        await settle();
        expect(calls).toEqual([7]);
        expect(hexbin.getSnapshot()).toMatchObject({ status: 'ready', cellCount: 1 });
        hexbin.setAggregator(undefined);
        expect(hexbin.getSnapshot()).toMatchObject({ status: 'ready', cellCount: 1 });
        expect(calls).toEqual([7]);
    });
});

describe('wfs into the layer', () => {
    it('aggregates once the WFS answers', async () => {
        const body = {
            type: 'FeatureCollection',
            numberMatched: 2,
            features: [[-103.35, 20.67], [-103.3501, 20.6701]].map(lonLat => ({
                type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: fromLonLat(lonLat) },
            })),
        };
        const fetch = vi.fn(async () => new Response(JSON.stringify(body))) as unknown as typeof globalThis.fetch;
        const hexbin = createHexbinLayer({ map: mapAt(9), source: fromWfs({ url: 'https://x/wfs', typeName: 'ws:p', fetch }), style, resolution: { fixed: 7 } });
        expect(hexbin.getSnapshot().cellCount).toBe(0);
        await settle();
        expect(hexbin.getSnapshot().cellCount).toBe(1);
        expect(hexbin.layer.getSource()?.getFeatureById('87498c96effffff')?.get('count')).toBe(2);
    });
});
