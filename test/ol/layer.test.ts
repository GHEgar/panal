import Feature from 'ol/Feature.js';
import MultiPoint from 'ol/geom/MultiPoint.js';
import Point from 'ol/geom/Point.js';
import LineString from 'ol/geom/LineString.js';
import OlMap from 'ol/Map.js';
import { fromLonLat } from 'ol/proj.js';
import VectorSource from 'ol/source/Vector.js';
import Style from 'ol/style/Style.js';
import View from 'ol/View.js';
import { describe, expect, it, vi } from 'vitest';
import { createHexbinLayer, fromGeoJSON, fromVectorSource, toInputs } from '../../src/ol/index.js';
import type { CellStyleContext } from '../../src/ol/index.js';

const GDL: [number, number] = [-103.35, 20.67];
const MTY: [number, number] = [-100.31, 25.67];
const CDMX: [number, number] = [-99.13, 19.43];

const pointAt = (lonLat: number[], properties: Record<string, unknown> = {}): Feature =>
    new Feature({ geometry: new Point(fromLonLat(lonLat)), ...properties });

const setup = (zoom = 9) => {
    const map = new OlMap({ view: new View({ center: fromLonLat(GDL), zoom }) });
    const vector = new VectorSource<Feature>({
        features: [
            pointAt(GDL, { pop: 10 }),
            pointAt([GDL[0] + 0.0001, GDL[1]], { pop: 30 }),
            pointAt(MTY, { pop: 5 }),
            pointAt(CDMX, { pop: '7' }),
        ],
    });
    return { map, vector };
};

const nextFrame = () => new Promise(resolve => setTimeout(resolve, 50));

describe('toInputs', () => {
    it('reads points and multipoints in the view projection and skips other geometries', () => {
        const features = [
            pointAt(GDL, { pop: 1 }),
            new Feature({ geometry: new MultiPoint([fromLonLat(GDL), fromLonLat(MTY)]) }),
            new Feature({ geometry: new LineString([[0, 0], [1, 1]]) }),
            new Feature(),
        ];
        const inputs = toInputs(features, 'EPSG:3857', 'pop');
        expect(inputs).toHaveLength(2);
        expect(inputs[0]?.coordinates[0]?.[0]).toBeCloseTo(GDL[0], 6);
        expect(inputs[0]?.value).toBe(1);
        expect(inputs[1]?.coordinates).toHaveLength(2);
    });
});

describe('createHexbinLayer', () => {
    it('adds its layer, aggregates and classifies on creation', () => {
        const { map, vector } = setup();
        const hexbin = createHexbinLayer({ map, source: fromVectorSource(vector), style: () => new Style(), resolution: { fixed: 7 } });
        expect(map.getLayers().getArray()).toContain(hexbin.layer);
        const snapshot = hexbin.getSnapshot();
        expect(snapshot.resolution).toBe(7);
        expect(snapshot.cellCount).toBe(3);
        expect(snapshot.classification?.method).toBe('quantile');
        expect(snapshot.legend.reduce((total, entry) => total + entry.count, 0)).toBe(3);
        const gdl = hexbin.layer.getSource()?.getFeatureById('87498c96effffff');
        expect(gdl?.get('count')).toBe(2);
        expect(gdl?.get('members')).toHaveLength(2);
    });

    it('passes the cell context to the consumer style', () => {
        const { map, vector } = setup();
        const style = vi.fn<(feature: unknown, context: CellStyleContext) => Style>(() => new Style());
        const hexbin = createHexbinLayer({ map, source: fromVectorSource(vector), style, resolution: { fixed: 7 } });
        const feature = hexbin.layer.getSource()?.getFeatureById('87498c96effffff');
        if (!feature) throw new Error('missing cell');
        hexbin.layer.getStyleFunction()?.(feature, 1);
        expect(style.mock.calls[0]?.[1]).toMatchObject({ h3Index: '87498c96effffff', count: 2, value: 2 });
        expect(style.mock.calls[0]?.[1].classIndex).toBeGreaterThanOrEqual(0);
    });

    it('switches reducer and value field', () => {
        const { map, vector } = setup();
        const hexbin = createHexbinLayer({ map, source: fromVectorSource(vector), style: () => new Style(), resolution: { fixed: 7 } });
        hexbin.setReducer('sum', 'pop');
        const source = hexbin.layer.getSource();
        expect(source?.getFeatureById('87498c96effffff')?.get('value')).toBe(40);
        hexbin.setReducer('mean');
        expect(source?.getFeatureById('87498c96effffff')?.get('value')).toBe(20);
        expect(hexbin.getSnapshot().classification?.stats.max).toBe(20);
    });

    it('reclassifies without reaggregating and notifies subscribers', () => {
        const { map, vector } = setup();
        const hexbin = createHexbinLayer({ map, source: fromVectorSource(vector), style: () => new Style(), resolution: { fixed: 7 } });
        const listener = vi.fn();
        hexbin.subscribe(listener);
        hexbin.setClassification({ method: 'manual', breaks: [0, 1.5, 3] });
        expect(listener).toHaveBeenCalledTimes(1);
        expect(hexbin.getSnapshot().legend.map(entry => entry.count)).toEqual([2, 1]);
    });

    it('follows the zoom through the resolution picker', () => {
        const { map, vector } = setup(5);
        const table = [{ maxZoom: 6, resolution: 3 }, { maxZoom: Infinity, resolution: 7 }];
        const hexbin = createHexbinLayer({ map, source: fromVectorSource(vector), style: () => new Style(), resolution: { table, hysteresis: 0.5 } });
        expect(hexbin.getSnapshot().resolution).toBe(3);
        map.getView().setZoom(6.3);
        map.dispatchEvent('moveend');
        expect(hexbin.getSnapshot().resolution).toBe(3);
        map.getView().setZoom(6.8);
        map.dispatchEvent('moveend');
        expect(hexbin.getSnapshot().resolution).toBe(7);
    });

    it('reaggregates once per frame when the vector source changes', async () => {
        const { map, vector } = setup();
        const hexbin = createHexbinLayer({ map, source: fromVectorSource(vector), style: () => new Style(), resolution: { fixed: 7 } });
        const listener = vi.fn();
        hexbin.subscribe(listener);
        vector.addFeature(pointAt([-86.85, 21.16]));
        vector.addFeature(pointAt([-89.62, 20.97]));
        await nextFrame();
        expect(listener).toHaveBeenCalledTimes(1);
        expect(hexbin.getSnapshot().cellCount).toBe(5);
    });

    it('reads GeoJSON in the view projection', () => {
        const { map } = setup();
        const data = {
            type: 'FeatureCollection',
            features: [GDL, MTY].map(coordinates => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates } })),
        };
        const hexbin = createHexbinLayer({ map, source: fromGeoJSON(data), style: () => new Style(), resolution: { fixed: 7 } });
        expect(hexbin.getSnapshot().cellCount).toBe(2);
        expect(hexbin.layer.getSource()?.getFeatureById('87498c96effffff')).toBeTruthy();
    });

    it('cleans up on destroy', async () => {
        const { map, vector } = setup();
        const hexbin = createHexbinLayer({ map, source: fromVectorSource(vector), style: () => new Style(), resolution: { fixed: 7 } });
        const listener = vi.fn();
        hexbin.subscribe(listener);
        hexbin.destroy();
        vector.addFeature(pointAt(GDL));
        map.dispatchEvent('moveend');
        await nextFrame();
        expect(listener).not.toHaveBeenCalled();
        expect(map.getLayers().getArray()).not.toContain(hexbin.layer);
    });
});
