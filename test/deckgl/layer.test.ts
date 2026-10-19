import type { PickingInfo } from '@deck.gl/core';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import { ScatterplotLayer } from '@deck.gl/layers';
import { getHexagonEdgeLengthAvg, latLngToCell } from 'h3-js';
import { describe, expect, it, vi } from 'vitest';
import { aggregate } from '../../src/core/index.js';
import { classify } from '../../src/classify/index.js';
import type { HexbinDeckCell, HexbinDeckDatum, HexbinDeckLayerOptions } from '../../src/deckgl/index.js';
import { createHexbinDeckLayer } from '../../src/deckgl/index.js';

type Accessor<T> = (datum: HexbinDeckDatum) => T;

const a = latLngToCell(20.67, -103.35, 6);
const b = latLngToCell(19.43, -99.13, 6);
const c = latLngToCell(25.67, -100.31, 6);
const cells = [
    { h3Index: a, value: 10, count: 2 },
    { h3Index: b, value: 40, count: 8 },
    { h3Index: c, value: 20, count: 4 },
];
const classification = { breaks: [0, 15, 30, 40] };
const colors = [[255, 0, 0], [0, 255, 0], [0, 0, 255]] as const;
const edge = getHexagonEdgeLengthAvg(6, 'm');

const make = (options: Partial<HexbinDeckLayerOptions> = {}) =>
    createHexbinDeckLayer({ cells, classification, colors: [...colors], ...options });

const props = (layer: ReturnType<typeof make>) => layer.props as unknown as Record<string, unknown>;
const datum = (layer: ReturnType<typeof make>, h3Index: string) =>
    (props(layer).data as HexbinDeckDatum[]).find(item => item.h3Index === h3Index) as HexbinDeckDatum;
const call = <T>(layer: ReturnType<typeof make>, name: string, h3Index: string): T =>
    (props(layer)[name] as Accessor<T>)(datum(layer, h3Index));

describe('createHexbinDeckLayer', () => {
    it('draws columns by default, extruded by value and scaled to the resolution', () => {
        const layer = make();
        expect(layer).toBeInstanceOf(H3HexagonLayer);
        expect(layer.id).toBe('panal-hexbin');
        expect(props(layer).extruded).toBe(true);
        expect(props(layer).coverage).toBe(0.9);
        expect(props(layer).pickable).toBe(true);
        expect(call<string>(layer, 'getHexagon', a)).toBe(a);
        expect(call<number>(layer, 'getElevation', b)).toBeCloseTo(edge * 10);
        expect(call<number>(layer, 'getElevation', a)).toBeCloseTo(edge * 10 / 4);
    });

    it('draws flat hexagons without extrusion', () => {
        const layer = make({ style: 'flat' });
        expect(layer).toBeInstanceOf(H3HexagonLayer);
        expect(props(layer).extruded).toBe(false);
        expect(props(layer).coverage).toBe(1);
    });

    it('draws dots at the cell center with an area proportional radius', () => {
        const layer = make({ style: 'dots', maxRadius: 1000 });
        expect(layer).toBeInstanceOf(ScatterplotLayer);
        expect(layer.id).toBe('panal-hexbin:dots');
        expect(props(layer).radiusUnits).toBe('meters');
        const [lon, lat] = call<[number, number]>(layer, 'getPosition', a);
        expect(latLngToCell(lat, lon, 6)).toBe(a);
        expect(call<number>(layer, 'getRadius', b)).toBeCloseTo(1000);
        expect(call<number>(layer, 'getRadius', a)).toBeCloseTo(500);
    });

    it('colors by class with the classify interval rule', () => {
        const layer = make();
        expect(call(layer, 'getFillColor', a)).toEqual([255, 0, 0]);
        expect(call(layer, 'getFillColor', c)).toEqual([0, 255, 0]);
        expect(call(layer, 'getFillColor', b)).toEqual([0, 0, 255]);
    });

    it('spreads a longer ramp over the classes and accepts a color function', () => {
        const ramp: [number, number, number][] = [[0, 0, 0], [1, 1, 1], [2, 2, 2], [3, 3, 3], [4, 4, 4]];
        const spread = make({ colors: ramp });
        expect(call(spread, 'getFillColor', a)).toEqual([0, 0, 0]);
        expect(call(spread, 'getFillColor', c)).toEqual([2, 2, 2]);
        expect(call(spread, 'getFillColor', b)).toEqual([4, 4, 4]);
        const fn = make({ colors: (index, classes) => [index, classes, 0] });
        expect(call(fn, 'getFillColor', c)).toEqual([1, 3, 0]);
    });

    it('uses the no-class color outside the breaks and without classification', () => {
        const outside = make({ classification: { breaks: [0, 15] }, noClassColor: [9, 9, 9, 9] });
        expect(call(outside, 'getFillColor', b)).toEqual([9, 9, 9, 9]);
        expect(call(make({ classification: null }), 'getFillColor', a)).toEqual([0, 0, 0, 0]);
    });

    it('paints the selected cell', () => {
        const layer = make({ selected: c, selectedColor: [1, 2, 3] });
        expect(call(layer, 'getFillColor', c)).toEqual([1, 2, 3]);
        expect(call(layer, 'getFillColor', a)).toEqual([255, 0, 0]);
    });

    it('scales by count and clamps negative values', () => {
        const byCount = make({ metric: 'count', maxElevation: 800 });
        expect(call<number>(byCount, 'getElevation', c)).toBeCloseTo(400);
        const negative = createHexbinDeckLayer({
            cells: [{ h3Index: a, value: -5 }, { h3Index: b, value: 5 }],
            classification,
            colors: [...colors],
            maxElevation: 100,
        });
        expect(call<number>(negative, 'getElevation', a)).toBe(0);
        expect(call<number>(negative, 'getElevation', b)).toBe(100);
        expect(datum(negative, a).count).toBe(1);
    });

    it('reads the Map returned by aggregate', () => {
        const map = aggregate([{ coordinates: [[-103.35, 20.67]], member: 'x' }], { resolution: 6 });
        const layer = createHexbinDeckLayer({ cells: map, classification: classify([1], { method: 'quantile' }), colors: [[5, 5, 5]] });
        expect(props(layer).data).toHaveLength(1);
        expect(call(layer, 'getFillColor', a)).toEqual([5, 5, 5]);
    });

    it('selects with the picked cell and its class', () => {
        const onSelect = vi.fn();
        const layer = make({ onSelect });
        const onClick = props(layer).onClick as (info: PickingInfo<HexbinDeckDatum>) => void;
        onClick({ object: datum(layer, c) } as PickingInfo<HexbinDeckDatum>);
        onClick({ object: undefined } as unknown as PickingInfo<HexbinDeckDatum>);
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect.mock.calls[0]?.[0]).toEqual<HexbinDeckCell>({ h3Index: c, value: 20, count: 4, classIndex: 1 });
        expect(props(make({ pickable: false })).pickable).toBe(false);
    });

    it('merges extra props last', () => {
        const layer = make({ id: 'mine', props: { opacity: 0.4, extruded: false } });
        expect(layer.id).toBe('mine');
        expect(props(layer).opacity).toBe(0.4);
        expect(props(layer).extruded).toBe(false);
    });
});
