import { H3HexagonLayer } from '@deck.gl/geo-layers';
import { ColumnLayer, ScatterplotLayer } from '@deck.gl/layers';
import { cellToLatLng, getHexagonEdgeLengthAvg, latLngToCell } from 'h3-js';
import { describe, expect, it } from 'vitest';
import type { HexbinBaseCell, HexbinDeckDatum, HexbinDeckLayerOptions } from '../../src/deckgl/index.js';
import { createHexbinDeckLayer, hexbinLayerId, RELIEF_SUFFIX } from '../../src/deckgl/index.js';

const a = latLngToCell(20.67, -103.35, 8);
const b = latLngToCell(20.70, -103.30, 8);
const cells = [{ h3Index: a, value: 10 }, { h3Index: b, value: 20 }];
const ground: Record<string, number> = { [a]: 1550, [b]: 1620 };
const base = ({ h3Index }: HexbinBaseCell): number | null => ground[h3Index] ?? null;

const make = (options: Partial<HexbinDeckLayerOptions> = {}) =>
    createHexbinDeckLayer({ cells, classification: { breaks: [0, 15, 30] }, colors: [[1, 1, 1], [2, 2, 2]], ...options });

const props = (layer: ReturnType<typeof make>) => layer.props as unknown as Record<string, unknown>;
const position = (layer: ReturnType<typeof make>, h3Index: string): number[] => {
    const data = props(layer).data as HexbinDeckDatum[];
    return (props(layer).getPosition as (datum: HexbinDeckDatum) => number[])(data.find(datum => datum.h3Index === h3Index) as HexbinDeckDatum);
};

describe('base elevation', () => {
    it('keeps the H3 layer without getBaseElevation', () => {
        expect(make()).toBeInstanceOf(H3HexagonLayer);
    });

    it('raises each column to the ground of its cell', () => {
        const layer = make({ getBaseElevation: base, baseTrigger: 3 });
        expect(layer).toBeInstanceOf(ColumnLayer);
        expect(layer.id).toBe('panal-hexbin:relief');
        const [lon, lat, z] = position(layer, b);
        const [cellLat, cellLon] = cellToLatLng(b);
        expect([lon, lat]).toEqual([cellLon, cellLat]);
        expect(z).toBe(1620);
        expect(props(layer).extruded).toBe(true);
        expect(props(layer).coverage).toBe(0.9);
        expect((props(layer).updateTriggers as Record<string, unknown>).getPosition).toBe('base|3');
    });

    it('builds the hexagon outline in meters around the cell center', () => {
        const layer = make({ getBaseElevation: base });
        const vertices = props(layer).vertices as [number, number][];
        expect(vertices).toHaveLength(6);
        expect(props(layer).diskResolution).toBe(6);
        const edge = getHexagonEdgeLengthAvg(8, 'm');
        for (const [x, y] of vertices) expect(Math.hypot(x, y)).toBeGreaterThan(edge * 0.8);
        for (const [x, y] of vertices) expect(Math.hypot(x, y)).toBeLessThan(edge * 1.2);
    });

    it('falls back to the ground for unknown cells and lifts dots too', () => {
        const unknown = make({ getBaseElevation: () => Number.NaN, style: 'flat' });
        expect(props(unknown).extruded).toBe(false);
        expect(position(unknown, a)[2]).toBe(0);
        const dots = make({ getBaseElevation: base, style: 'dots' });
        expect(dots).toBeInstanceOf(ScatterplotLayer);
        expect(position(dots, a)[2]).toBe(1550);
    });

    it('never reuses the H3 layer id, so deck.gl does not hand the H3 state to a ColumnLayer', () => {
        const flat = make({ id: 'hex' });
        const lifted = make({ id: 'hex', getBaseElevation: base });
        expect(flat.id).toBe('hex');
        expect(lifted.id).toBe(`hex${RELIEF_SUFFIX}`);
        expect(make({ id: 'hex', getBaseElevation: base, style: 'flat' }).id).toBe('hex:relief');
        expect(make({ id: 'hex', getBaseElevation: base, style: 'dots' }).id).toBe(make({ id: 'hex', style: 'dots' }).id);
        expect([flat.id, lifted.id, 'hex:dots'].map(hexbinLayerId)).toEqual(['hex', 'hex', 'hex']);
        expect(hexbinLayerId('hex:other')).toBe('hex:other');
    });

    it('keeps the same outline array across renders so the column geometry is not rebuilt', () => {
        const first = props(make({ getBaseElevation: base, baseTrigger: 1 })).vertices;
        const second = props(make({ getBaseElevation: () => 0, baseTrigger: 2, style: 'flat' })).vertices;
        expect(second).toBe(first);
        expect(props(make({ cells: [...cells], getBaseElevation: base })).vertices).not.toBe(first);
    });

    it('puts the ground in the position and leaves elevationScale to the column height', () => {
        const layer = make({ getBaseElevation: base, maxElevation: 100, props: { elevationScale: 3 } });
        expect(position(layer, b)[2]).toBe(1620);
        expect(props(layer).elevationScale).toBe(3);
        const data = props(layer).data as HexbinDeckDatum[];
        const top = (props(layer).getElevation as (datum: HexbinDeckDatum) => number)(data.find(datum => datum.h3Index === b) as HexbinDeckDatum);
        expect(top).toBe(100);
        expect(props(layer).radius).toBe(1);
        expect(props(layer).radiusUnits ?? 'meters').toBe('meters');
    });
});
