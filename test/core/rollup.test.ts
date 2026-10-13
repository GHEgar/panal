import { cellToLatLng, cellToParent } from 'h3-js';
import { describe, expect, it } from 'vitest';
import { aggregate, cellOf, rollup } from '../../src/core/index.js';
import type { AggregateInput, LonLat } from '../../src/core/index.js';

const seeded = (seed: number): (() => number) => {
    let state = seed;
    return () => {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state / 2147483648;
    };
};

const points = (): AggregateInput<number>[] => {
    const random = seeded(11);
    return Array.from({ length: 2000 }, (_, member) => ({
        coordinates: [[-104 + random() * 2, 20 + random() * 2] as LonLat],
        member,
        value: member % 9 === 0 ? undefined : Math.round(random() * 1000) / 10,
    }));
};

describe('rollup', () => {
    it('equals assigning each point to the parent of its fine cell, for every built-in reducer', () => {
        const inputs = points();
        const hierarchical = inputs.map(input => ({
            ...input,
            coordinates: [cellToLatLng(cellToParent(cellOf(input.coordinates[0] as LonLat, 8) as string, 6))]
                .map(([lat, lon]) => [lon, lat] as LonLat),
        }));
        for (const reducer of ['count', 'sum', 'mean', 'min', 'max'] as const) {
            const rolled = rollup(aggregate(inputs, { resolution: 8, reducer }).values(), { resolution: 6, reducer });
            const expected = aggregate(hierarchical, { resolution: 6, reducer });
            expect([...rolled.keys()].sort()).toEqual([...expected.keys()].sort());
            for (const [h3, cell] of expected) {
                const other = rolled.get(h3);
                expect(other?.count).toBe(cell.count);
                expect(other?.valueCount).toBe(cell.valueCount);
                if (Number.isNaN(cell.value)) expect(other?.value).toBeNaN();
                else expect(other?.value).toBeCloseTo(cell.value, 9);
                expect(new Set(other?.members)).toEqual(new Set(cell.members));
            }
        }
    });

    it('keeps totals but not every cell of direct aggregation, because children overhang their parent', () => {
        const inputs = points();
        const rolled = rollup(aggregate(inputs, { resolution: 8, reducer: 'sum' }).values(), { resolution: 6, reducer: 'sum' });
        const direct = aggregate(inputs, { resolution: 6, reducer: 'sum' });
        const total = (cells: Map<string, { count: number; sum: number }>) => {
            let count = 0;
            let sum = 0;
            for (const cell of cells.values()) {
                count += cell.count;
                sum += cell.sum;
            }
            return { count, sum };
        };
        expect(total(rolled).count).toBe(total(direct).count);
        expect(total(rolled).sum).toBeCloseTo(total(direct).sum, 6);
        const moved = [...direct].filter(([h3, cell]) => rolled.get(h3)?.count !== cell.count).length;
        expect(moved).toBeGreaterThan(0);
    });

    it('keeps cells already at the target resolution and rejects coarser ones', () => {
        const fine = aggregate(points(), { resolution: 6 });
        expect(rollup(fine.values(), { resolution: 6 }).size).toBe(fine.size);
        expect(() => rollup(fine.values(), { resolution: 7 })).toThrow(RangeError);
    });

    it('lists a multipoint member once per parent but counts it per child', () => {
        const near: LonLat = [-103.35, 20.67];
        const neighbour: LonLat = [-103.36, 20.68];
        const cells = aggregate([{ coordinates: [near, neighbour], member: 'm' }], { resolution: 9 });
        expect(cells.size).toBe(2);
        const parent = [...rollup(cells.values(), { resolution: 5 }).values()][0];
        expect(parent?.members).toEqual(['m']);
        expect(parent?.count).toBe(2);
    });
});
