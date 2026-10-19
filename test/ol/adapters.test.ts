import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import OlMap from 'ol/Map.js';
import MapBrowserEvent from 'ol/MapBrowserEvent.js';
import { fromLonLat } from 'ol/proj.js';
import VectorSource from 'ol/source/Vector.js';
import Style from 'ol/style/Style.js';
import View from 'ol/View.js';
import { describe, expect, it, vi } from 'vitest';
import { bboxCql, bindCellClick, createHexbinLayer, fromCellProvider, fromVectorSource } from '../../src/ol/index.js';
import type { ArbiterPointer, ClickArbiter, HexbinEvent } from '../../src/ol/index.js';

const GDL = fromLonLat([-103.35, 20.67]);
const CELL = '87498c96effffff';
const settle = () => new Promise(resolve => setTimeout(resolve, 30));

const setup = (onEvent?: (event: HexbinEvent) => void) => {
    const map = new OlMap({ view: new View({ center: GDL, zoom: 9 }) });
    const vector = new VectorSource<Feature>({ features: [new Feature({ geometry: new Point(GDL) })] });
    const hexbin = createHexbinLayer({ map, source: fromVectorSource(vector), style: () => new Style(), resolution: { fixed: 7 }, onEvent });
    return { map, vector, hexbin };
};

const fakeArbiter = () => {
    const claims: { tool: string; handlers: { click?(e: ArbiterPointer): void; escape?(): void } }[] = [];
    const release = vi.fn();
    const arbiter: ClickArbiter = {
        claim(tool, handlers) {
            claims.push({ tool, handlers });
            return release;
        },
    };
    return { arbiter, claims, release };
};

describe('bboxCql with a composer', () => {
    const extent: [number, number, number, number] = [0, 1, 2, 3];
    const box = "BBOX(geom, 0.00, 1.00, 2.00, 3.00, 'EPSG:3857')";

    it('writes the box alone into the bbox fragment and still returns the full CQL', () => {
        const set = vi.fn();
        expect(bboxCql('geom', extent, "kind = 'a'", { composer: { set } })).toBe(`${box} AND (kind = 'a')`);
        expect(set).toHaveBeenCalledWith('bbox', box);
    });

    it('uses a custom fragment name', () => {
        const set = vi.fn();
        bboxCql('geom', extent, undefined, { composer: { set }, fragment: 'view' });
        expect(set).toHaveBeenCalledWith('view', box);
    });
});

describe('bindCellClick with an arbiter', () => {
    it('claims the click as hexbin, selects from lon/lat, clears on escape and releases', () => {
        const { map, hexbin } = setup();
        const { arbiter, claims, release } = fakeArbiter();
        const unbind = bindCellClick(hexbin, map, { arbiter });
        expect(claims.map(claim => claim.tool)).toEqual(['hexbin']);
        claims[0]?.handlers.click?.({ coordinate: [-103.35, 20.67] });
        expect(hexbin.getSnapshot().selection?.h3Index).toBe(CELL);
        claims[0]?.handlers.escape?.();
        expect(hexbin.getSnapshot().selection).toBeNull();
        unbind();
        expect(release).toHaveBeenCalledTimes(1);
    });

    it('takes a custom tool name and ignores the map singleclick', () => {
        const { map, hexbin } = setup();
        const { arbiter, claims } = fakeArbiter();
        bindCellClick(hexbin, map, { arbiter, tool: 'identify' });
        expect(claims[0]?.tool).toBe('identify');
        const event = new MapBrowserEvent('singleclick', map, new PointerEvent('pointerdown'));
        event.coordinate = GDL;
        map.dispatchEvent(event);
        expect(hexbin.getSnapshot().selection).toBeNull();
    });
});

describe('onEvent', () => {
    it('reports resolution, classification and selection', () => {
        const events: HexbinEvent[] = [];
        const { hexbin } = setup(event => events.push(event));
        expect(events.map(event => event.type)).toEqual(['resolution', 'classification']);
        expect(events[0]).toEqual({ type: 'resolution', resolution: 7 });
        events.length = 0;
        hexbin.select(CELL);
        hexbin.select(CELL);
        hexbin.select(null);
        expect(events).toEqual([{ type: 'select', h3Index: CELL }, { type: 'select', h3Index: null }]);
        events.length = 0;
        hexbin.setClassification({ method: 'equalInterval' });
        expect(events.map(event => event.type)).toEqual(['classification']);
        hexbin.refresh();
        expect(events).toHaveLength(1);
    });

    it('reports status changes of an async source', async () => {
        const events: HexbinEvent[] = [];
        const failure = new Error('down');
        const source = fromCellProvider({ load: async () => Promise.reject(failure) });
        const map = new OlMap({ view: new View({ center: GDL, zoom: 9 }) });
        createHexbinLayer({ map, source, style: () => new Style(), resolution: { fixed: 7 }, onEvent: event => events.push(event) });
        await settle();
        expect(events.filter(event => event.type === 'status')).toEqual([
            { type: 'status', status: 'loading', error: null },
            { type: 'status', status: 'error', error: failure },
        ]);
    });
});
