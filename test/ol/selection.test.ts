import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import OlMap from 'ol/Map.js';
import MapBrowserEvent from 'ol/MapBrowserEvent.js';
import { fromLonLat } from 'ol/proj.js';
import VectorSource from 'ol/source/Vector.js';
import Style from 'ol/style/Style.js';
import View from 'ol/View.js';
import { describe, expect, it, vi } from 'vitest';
import { bindCellClick, createHexbinLayer, fromCellProvider, fromVectorSource } from '../../src/ol/index.js';
import type { CellStyleContext, MembersRequest } from '../../src/ol/index.js';

const GDL = fromLonLat([-103.35, 20.67]);
const MTY = fromLonLat([-100.31, 25.67]);
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

const setup = () => {
    const map = new OlMap({ view: new View({ center: GDL, zoom: 9 }) });
    const features = [new Feature({ geometry: new Point(GDL) }), new Feature({ geometry: new Point(GDL) }), new Feature({ geometry: new Point(MTY) })];
    const vector = new VectorSource<Feature>({ features });
    const hexbin = createHexbinLayer({ map, source: fromVectorSource(vector), style: () => new Style(), resolution: { fixed: 7 } });
    return { map, vector, features, hexbin };
};

const click = (map: OlMap, coordinate: number[]) => {
    const event = new MapBrowserEvent('singleclick', map, new PointerEvent('pointerdown'));
    event.coordinate = coordinate;
    map.dispatchEvent(event);
};

describe('selection', () => {
    it('finds the cell under a coordinate without rendering', () => {
        const { hexbin } = setup();
        expect(hexbin.cellAt(GDL)?.h3Index).toBe('87498c96effffff');
        expect(hexbin.cellAt(fromLonLat([0, 0]))).toBeNull();
    });

    it('selects a cell with its members and marks it for the style', () => {
        const { hexbin, features } = setup();
        const style = vi.fn((_feature: unknown, context: CellStyleContext) => {
            void context;
            return new Style();
        });
        hexbin.setStyle(style);
        hexbin.select('87498c96effffff');
        const { selection } = hexbin.getSnapshot();
        expect(selection).toMatchObject({ h3Index: '87498c96effffff', status: 'ready' });
        expect(selection?.members).toEqual([features[0], features[1]]);
        const cell = hexbin.layer.getSource()?.getFeatureById('87498c96effffff');
        if (!cell) throw new Error('missing cell');
        hexbin.layer.getStyleFunction()?.(cell, 1);
        expect(style.mock.calls.at(-1)?.[1].selected).toBe(true);
        hexbin.select('nope');
        expect(hexbin.getSnapshot().selection).toBeNull();
    });

    it('keeps the selection while the cell survives and drops it when it disappears', async () => {
        const { hexbin, vector, features } = setup();
        hexbin.select('87498c96effffff');
        vector.addFeature(new Feature({ geometry: new Point(GDL) }));
        await settle();
        expect(hexbin.getSnapshot().selection?.members).toHaveLength(3);
        vector.removeFeature(features[0] as Feature);
        vector.removeFeature(features[1] as Feature);
        vector.removeFeature(vector.getFeatures().find(feature => feature !== features[2]) as Feature);
        await settle();
        expect(hexbin.getSnapshot().selection).toBeNull();
    });

    it('selects and toggles on map clicks', () => {
        const { map, hexbin } = setup();
        const unbind = bindCellClick(hexbin, map);
        click(map, GDL);
        expect(hexbin.getSnapshot().selection?.h3Index).toBe('87498c96effffff');
        click(map, GDL);
        expect(hexbin.getSnapshot().selection).toBeNull();
        click(map, MTY);
        click(map, fromLonLat([0, 0]));
        expect(hexbin.getSnapshot().selection).toBeNull();
        unbind();
        click(map, GDL);
        expect(hexbin.getSnapshot().selection).toBeNull();
    });

    it('loads members from the server provider', async () => {
        const map = new OlMap({ view: new View({ center: GDL, zoom: 9 }) });
        const member = new Feature();
        const loadMembers = vi.fn(async (request: MembersRequest) => {
            void request;
            return [member];
        });
        const source = fromCellProvider({ load: async () => [{ h3Index: '87498c96effffff', value: 3 }], loadMembers });
        const hexbin = createHexbinLayer({ map, source, style: () => new Style(), resolution: { fixed: 7 } });
        await settle();
        hexbin.select('87498c96effffff');
        expect(hexbin.getSnapshot().selection?.status).toBe('loading');
        await settle();
        expect(loadMembers.mock.calls[0]?.[0]).toMatchObject({ h3Index: '87498c96effffff', resolution: 7 });
        expect(hexbin.getSnapshot().selection).toMatchObject({ status: 'ready', members: [member] });
    });

    it('reports member loading errors', async () => {
        const map = new OlMap({ view: new View({ center: GDL, zoom: 9 }) });
        const source = fromCellProvider({
            load: async () => [{ h3Index: '87498c96effffff', value: 3 }],
            loadMembers: async () => { throw new Error('down'); },
        });
        const hexbin = createHexbinLayer({ map, source, style: () => new Style(), resolution: { fixed: 7 } });
        await settle();
        hexbin.select('87498c96effffff');
        await settle();
        expect(hexbin.getSnapshot().selection).toMatchObject({ status: 'error' });
        expect(hexbin.getSnapshot().selection?.error?.message).toBe('down');
    });
});
