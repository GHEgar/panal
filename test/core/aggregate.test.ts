import { describe, expect, it } from 'vitest';
import { aggregate, cellOf, clampResolution } from '../../src/core/index.js';
import type { AggregateInput, LonLat } from '../../src/core/index.js';

const GDL: LonLat = [-103.35, 20.67];
const NEAR: LonLat = [-103.3501, 20.6701];
const FAR: LonLat = [-99.13, 19.43];

const point = (coordinates: LonLat, member: string, value?: number): AggregateInput<string> =>
    ({ coordinates: [coordinates], member, value });

describe('aggregate', () => {
    it('matches the cell Python h3 computes for the same point', () => {
        expect(cellOf(GDL, 7)).toBe('87498c96effffff');
    });

    it('counts members per cell', () => {
        const cells = aggregate([point(GDL, 'a'), point(NEAR, 'b'), point(FAR, 'c')], { resolution: 7 });
        expect(cells.size).toBe(2);
        const gdl = cells.get('87498c96effffff');
        expect(gdl).toMatchObject({ count: 2, value: 2, members: ['a', 'b'] });
    });

    it('applies the built in reducers', () => {
        const inputs = [point(GDL, 'a', 4), point(NEAR, 'b', 10), point(NEAR, 'c')];
        const pick = (reducer: 'sum' | 'mean' | 'min' | 'max'): number =>
            aggregate(inputs, { resolution: 7, reducer }).get('87498c96effffff')?.value as number;
        expect(pick('sum')).toBe(14);
        expect(pick('mean')).toBe(7);
        expect(pick('min')).toBe(4);
        expect(pick('max')).toBe(10);
        const cell = aggregate(inputs, { resolution: 7 }).get('87498c96effffff');
        expect(cell).toMatchObject({ count: 3, valueCount: 2, sum: 14 });
    });

    it('gives NaN to value reducers when no member has a value', () => {
        const cell = aggregate([point(GDL, 'a')], { resolution: 7, reducer: 'mean' }).get('87498c96effffff');
        expect(cell?.value).toBeNaN();
    });

    it('passes values and members to a custom reducer', () => {
        const cells = aggregate([point(GDL, 'a', 3), point(NEAR, 'b', 5)], {
            resolution: 7,
            reducer: (values, members) => values.reduce((a, b) => a * b, 1) + members.length,
        });
        expect(cells.get('87498c96effffff')?.value).toBe(17);
    });

    it('counts a multipoint once per cell it touches', () => {
        const cells = aggregate([{ coordinates: [GDL, NEAR, FAR], member: 'm', value: 1 }], { resolution: 7, reducer: 'sum' });
        expect(cells.size).toBe(2);
        expect(cells.get('87498c96effffff')).toMatchObject({ count: 1, sum: 1, members: ['m'] });
    });

    it('skips invalid coordinates', () => {
        const cells = aggregate([point([NaN, 1], 'a'), point([200, 0], 'b'), point([0, 95], 'c')], { resolution: 5 });
        expect(cells.size).toBe(0);
    });

    it('clamps and rounds the resolution', () => {
        expect(clampResolution(-2)).toBe(0);
        expect(clampResolution(7.4)).toBe(7);
        expect(clampResolution(99)).toBe(15);
        expect(() => clampResolution(NaN)).toThrow(RangeError);
    });
});
