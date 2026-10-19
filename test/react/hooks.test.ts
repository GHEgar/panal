import { act, renderHook } from '@testing-library/react';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import OlMap from 'ol/Map.js';
import MapBrowserEvent from 'ol/MapBrowserEvent.js';
import { fromLonLat } from 'ol/proj.js';
import VectorSource from 'ol/source/Vector.js';
import Style from 'ol/style/Style.js';
import View from 'ol/View.js';
import { describe, expect, it, vi } from 'vitest';
import { aggregate } from '../../src/core/index.js';
import type { Aggregator } from '../../src/core/index.js';
import { fromVectorSource } from '../../src/ol/index.js';
import type { ArbiterPointer, HexbinEvent, HexbinSource } from '../../src/ol/index.js';
import { useHexbinLayer, useHexbinSnapshot } from '../../src/react/index.js';
import type { UseHexbinLayerOptions } from '../../src/react/index.js';

const GDL = fromLonLat([-103.35, 20.67]);
const style = () => new Style();

const world = () => {
    const map = new OlMap({ view: new View({ center: GDL, zoom: 9 }) });
    const vector = new VectorSource<Feature>({
        features: [
            new Feature({ geometry: new Point(GDL), pop: 2 }),
            new Feature({ geometry: new Point(GDL), pop: 5 }),
            new Feature({ geometry: new Point(fromLonLat([-100.31, 25.67])), pop: 1 }),
        ],
    });
    return { map, source: fromVectorSource(vector) };
};

const useBoth = (options: UseHexbinLayerOptions | null) => {
    const hexbin = useHexbinLayer(options);
    return { hexbin, snapshot: useHexbinSnapshot(hexbin) };
};

describe('useHexbinLayer', () => {
    it('stays empty without options and creates the layer once they arrive', () => {
        const { map, source } = world();
        const { result, rerender } = renderHook(({ options }) => useBoth(options), {
            initialProps: { options: null as UseHexbinLayerOptions | null },
        });
        expect(result.current.hexbin).toBeNull();
        expect(result.current.snapshot).toBeNull();
        rerender({ options: { map, source, style, resolution: { fixed: 7 } } });
        expect(map.getLayers().getArray()).toContain(result.current.hexbin?.layer);
        expect(result.current.snapshot?.cellCount).toBe(2);
    });

    it('applies option changes without recreating the layer, and aggregates once on mount', () => {
        const { map, source } = world();
        const resolutions: number[] = [];
        const aggregator: Aggregator = (inputs, options) => {
            resolutions.push(options.resolution);
            return aggregate(inputs, options);
        };
        const base = { map, source, style, aggregator, resolution: { fixed: 7 } } as const;
        const { result, rerender } = renderHook(({ options }) => useBoth(options), {
            initialProps: { options: { ...base, classification: { method: 'quantile' as const, classes: 3 } } as UseHexbinLayerOptions },
        });
        const first = result.current.hexbin;
        expect(resolutions).toEqual([7]);
        rerender({ options: { ...base, classification: { method: 'quantile', classes: 3 } } });
        expect(resolutions).toEqual([7]);
        rerender({ options: { ...base, classification: { method: 'equalInterval', classes: 2 } } });
        expect(result.current.snapshot?.classification?.method).toBe('equalInterval');
        expect(resolutions).toEqual([7]);
        rerender({ options: { ...base, classification: { method: 'equalInterval', classes: 2 }, reducer: 'sum', value: 'pop' } });
        expect(result.current.hexbin).toBe(first);
        expect(result.current.hexbin?.layer.getSource()?.getFeatureById('87498c96effffff')?.get('value')).toBe(7);
        expect(resolutions).toEqual([7, 7]);
    });

    it('recreates the layer when the source changes and destroys it on unmount', () => {
        const { map, source } = world();
        const other: HexbinSource = world().source;
        const { result, rerender, unmount } = renderHook(({ options }) => useBoth(options), {
            initialProps: { options: { map, source, style, resolution: { fixed: 7 } } as UseHexbinLayerOptions },
        });
        const first = result.current.hexbin;
        rerender({ options: { map, source: other, style, resolution: { fixed: 7 } } });
        expect(result.current.hexbin).not.toBe(first);
        expect(map.getLayers().getArray()).not.toContain(first?.layer);
        const second = result.current.hexbin;
        unmount();
        expect(map.getLayers().getArray()).not.toContain(second?.layer);
    });

    it('binds clicks when asked to', () => {
        const { map, source } = world();
        const { result } = renderHook(() => useBoth({ map, source, style, resolution: { fixed: 7 }, selectOnClick: true }));
        const event = new MapBrowserEvent('singleclick', map, new PointerEvent('pointerdown'));
        event.coordinate = GDL;
        act(() => {
            map.dispatchEvent(event);
        });
        expect(result.current.snapshot?.selection?.members).toHaveLength(2);
    });

    it('passes the arbiter through selectOnClick and forwards events to the latest onEvent', () => {
        const { map, source } = world();
        const clicks: ((e: ArbiterPointer) => void)[] = [];
        const release = vi.fn();
        const arbiter = { claim: (_tool: string, handlers: { click?(e: ArbiterPointer): void }) => {
            if (handlers.click) clicks.push(handlers.click);
            return release;
        } };
        const first = vi.fn<(event: HexbinEvent) => void>();
        const second = vi.fn<(event: HexbinEvent) => void>();
        const { result, rerender, unmount } = renderHook(({ onEvent }) => useBoth({
            map, source, style, resolution: { fixed: 7 }, selectOnClick: { arbiter }, onEvent,
        }), { initialProps: { onEvent: first } });
        rerender({ onEvent: second });
        act(() => {
            clicks[0]?.({ coordinate: [-103.35, 20.67] });
        });
        expect(result.current.snapshot?.selection?.members).toHaveLength(2);
        expect(second).toHaveBeenCalledWith(expect.objectContaining({ type: 'select' }));
        expect(clicks).toHaveLength(1);
        unmount();
        expect(release).toHaveBeenCalled();
    });
});
