import type { MapLibreOverlay } from '@deck.gl/maplibre';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { DeckOverlayLike, OverlayMapLike } from '../../src/deckgl/index.js';
import { createHexbinOverlay, overlayProps } from '../../src/deckgl/index.js';

class FakeMap {
    style = { _loaded: true };
    controls: unknown[] = [];
    listeners = new Set<() => void>();
    addControl(control: unknown) { this.controls.push(control); }
    removeControl(control: unknown) { this.controls = this.controls.filter(item => item !== control); }
    on(_type: 'styledata', listener: () => void) { this.listeners.add(listener); }
    off(_type: 'styledata', listener: () => void) { this.listeners.delete(listener); }
    isStyleLoaded(): boolean { return false; }
}

const loadedDuringSetProps: boolean[] = [];
let lastMap: FakeMap | null = null;

class FakeOverlay {
    readonly props: Record<string, unknown>;
    readonly canvas = document.createElement('canvas');
    readonly _deck = { redraw: vi.fn() };
    calls: unknown[] = [];
    constructor(props: Record<string, unknown>) { this.props = props; }
    setProps(props: { layers?: readonly unknown[] }) {
        this.calls.push(props.layers);
        loadedDuringSetProps.push(Boolean(lastMap?.isStyleLoaded()));
    }
    getCanvas() { return this.canvas; }
}

describe('overlayProps', () => {
    it('asks for a preserved drawing buffer only when overlaid', () => {
        expect(overlayProps({ preserveDrawingBuffer: true })).toEqual({ interleaved: false, layers: [], deviceProps: { webgl: { preserveDrawingBuffer: true } } });
        expect(overlayProps({ interleaved: true, preserveDrawingBuffer: true, props: { pickingRadius: 4 } })).toEqual({ interleaved: true, layers: [], pickingRadius: 4 });
    });
});

describe('createHexbinOverlay', () => {
    it('places interleaved layers as soon as the style is parsed, without waiting for every tile', () => {
        const map = new FakeMap();
        lastMap = map;
        loadedDuringSetProps.length = 0;
        const hexbin = createHexbinOverlay(FakeOverlay, map, { interleaved: true });
        expect(map.controls).toEqual([hexbin.overlay]);
        hexbin.setLayers(['columns']);
        expect(loadedDuringSetProps).toEqual([true]);
        expect(map.isStyleLoaded()).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(map, 'isStyleLoaded')).toBe(false);
        map.listeners.forEach(listener => listener());
        expect(hexbin.overlay.calls).toEqual([['columns'], ['columns']]);
        expect(hexbin.canvases()).toEqual([]);
        hexbin.destroy();
        expect(map.controls).toEqual([]);
        expect(map.listeners.size).toBe(0);
    });

    it('leaves the check alone while the style itself is loading', () => {
        const map = new FakeMap();
        map.style._loaded = false;
        lastMap = map;
        loadedDuringSetProps.length = 0;
        createHexbinOverlay(FakeOverlay, map, { interleaved: true }).setLayers(['columns']);
        expect(loadedDuringSetProps).toEqual([false]);
    });

    it('redraws the overlaid canvas right before handing it out for a capture', () => {
        const map = new FakeMap();
        const hexbin = createHexbinOverlay(FakeOverlay, map, { preserveDrawingBuffer: true });
        expect(hexbin.overlay.props.deviceProps).toEqual({ webgl: { preserveDrawingBuffer: true } });
        expect(hexbin.canvases()).toEqual([]);
        hexbin.setLayers(['dots']);
        expect(hexbin.canvases()).toEqual([hexbin.overlay.canvas]);
        expect(hexbin.overlay._deck.redraw).toHaveBeenCalledWith('panal');
        expect(map.listeners.size).toBe(0);
    });

    it('accepts the MapLibre map and the deck.gl overlay', () => {
        expectTypeOf<MapLibreMap>().toExtend<OverlayMapLike>();
        expectTypeOf<MapLibreOverlay>().toExtend<DeckOverlayLike>();
        expectTypeOf<typeof MapLibreOverlay>().toExtend<Parameters<typeof createHexbinOverlay<MapLibreOverlay>>[0]>();
    });
});
