import { describe, expect, it } from 'vitest';
import { aggregate } from '../../src/core/index.js';
import type { AggregateInput, LonLat } from '../../src/core/index.js';
import { createAggregationWorker } from '../../src/worker/index.js';
import { installAggregationWorker } from '../../src/worker/runtime-index.js';
import { createPortPair } from './ports.js';

const seeded = (seed: number): (() => number) => {
    let state = seed;
    return () => {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state / 2147483648;
    };
};

const sample = (): AggregateInput<number>[] => {
    const random = seeded(3);
    return Array.from({ length: 500 }, (_, member) => {
        const points: LonLat[] = Array.from({ length: member % 7 === 0 ? 3 : 1 }, () =>
            [-103.5 + random() * 0.6, 20.4 + random() * 0.6] as const);
        return { coordinates: points, member, value: member % 5 === 0 ? undefined : random() * 100 };
    });
};

const setup = () => {
    const { main, scope } = createPortPair();
    const uninstall = installAggregationWorker(scope);
    return { main, uninstall, aggregator: createAggregationWorker(main) };
};

describe('aggregation worker', () => {
    it('returns exactly what local aggregation returns, for every reducer', async () => {
        const { aggregator } = setup();
        const inputs = sample();
        const reducers = ['count', 'sum', 'mean', 'min', 'max', (values: readonly number[]) => values.length] as const;
        for (const reducer of reducers) {
            const local = aggregate(inputs, { resolution: 8, reducer });
            const remote = await aggregator.aggregate(inputs, { resolution: 8, reducer });
            expect([...remote.keys()]).toEqual([...local.keys()]);
            for (const [h3, cell] of local) expect(remote.get(h3)).toEqual(cell);
        }
    });

    it('keeps member identity on the main thread', async () => {
        const { aggregator } = setup();
        const member = { id: 'x' };
        const cells = await aggregator.aggregate([{ coordinates: [[-103.35, 20.67]], member }], { resolution: 7 });
        expect(cells.get('87498c96effffff')?.members[0]).toBe(member);
    });

    it('answers concurrent requests by id', async () => {
        const { aggregator } = setup();
        const inputs = sample();
        const [coarse, fine] = await Promise.all([
            aggregator.aggregate(inputs, { resolution: 5 }),
            aggregator.aggregate(inputs, { resolution: 9 }),
        ]);
        expect(coarse.size).toBeLessThan(fine.size);
    });

    it('reports worker errors', async () => {
        const { aggregator } = setup();
        await expect(aggregator.aggregate(sample(), { resolution: NaN })).rejects.toThrow('resolution');
    });

    it('rejects pending and new requests after terminate', async () => {
        const { aggregator, main, uninstall } = setup();
        uninstall();
        const pending = aggregator.aggregate(sample(), { resolution: 7 });
        aggregator.terminate();
        await expect(pending).rejects.toThrow('terminated');
        await expect(aggregator.aggregate(sample(), { resolution: 7 })).rejects.toThrow('terminated');
        expect(main.terminated).toBe(true);
    });
});
