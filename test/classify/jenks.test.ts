import { describe, expect, it } from 'vitest';
import { classify, classOf, JENKS_SAMPLE_SIZE } from '../../src/classify/index.js';
import { jenksSample } from '../../src/classify/jenks.js';

const squaredDeviation = (group: readonly number[]): number => {
    const mean = group.reduce((a, b) => a + b, 0) / group.length;
    return group.reduce((total, value) => total + (value - mean) ** 2, 0);
};

const bestPartition = (sorted: readonly number[], classes: number): number => {
    let best = Infinity;
    const walk = (start: number, left: number, cost: number): void => {
        if (left === 1) {
            best = Math.min(best, cost + squaredDeviation(sorted.slice(start)));
            return;
        }
        for (let end = start + 1; end <= sorted.length - left + 1; end += 1) {
            walk(end, left - 1, cost + squaredDeviation(sorted.slice(start, end)));
        }
    };
    walk(0, classes, 0);
    return best;
};

const partitionCost = (sorted: readonly number[], breaks: readonly number[]): number => {
    const groups: number[][] = breaks.slice(1).map(() => []);
    sorted.forEach(value => groups[classOf(value, breaks)]?.push(value));
    return groups.filter(group => group.length > 0).reduce((total, group) => total + squaredDeviation(group), 0);
};

const seeded = (seed: number): (() => number) => {
    let state = seed;
    return () => {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state / 2147483648;
    };
};

describe('jenks', () => {
    it('finds the optimal partition on random data', () => {
        const failures: string[] = [];
        for (let run = 0; run < 25; run += 1) {
            const random = seeded(run + 1);
            const size = 6 + Math.floor(random() * 7);
            const values = Array.from({ length: size }, () => Math.round(random() * 1000) / 10);
            const sorted = [...new Set(values)].sort((a, b) => a - b);
            const classes = 2 + (run % 3);
            const result = classify(sorted, { method: 'jenks', classes });
            const gap = Math.abs(partitionCost(sorted, result.breaks) - bestPartition(sorted, classes));
            if (gap > 1e-6) failures.push(JSON.stringify({ sorted, classes, breaks: result.breaks }));
        }
        expect(failures).toEqual([]);
    });

    it('keeps a last class made only of the maximum', () => {
        const result = classify([3.6, 41.4, 61.3, 61.4, 63.8, 69.9, 94.3], { method: 'jenks', classes: 3 });
        expect(result.breaks).toEqual([3.6, 41.4, 94.3, 94.3]);
        expect(classOf(69.9, result.breaks)).toBe(1);
        expect(classOf(94.3, result.breaks)).toBe(2);
    });

    it('puts the break at the first value of the upper class', () => {
        const result = classify([1, 2, 3, 10, 11, 12], { method: 'jenks', classes: 2 });
        expect(result.breaks).toEqual([1, 10, 12]);
        expect(classOf(10, result.breaks)).toBe(1);
    });

    it('never asks for more classes than values', () => {
        const result = classify([1, 5], { method: 'jenks', classes: 6 });
        expect(result.breaks).toEqual([1, 5, 5]);
        expect(result.actual).toBe(2);
        expect(classOf(1, result.breaks)).toBe(0);
        expect(classOf(5, result.breaks)).toBe(1);
    });

    it('samples large inputs deterministically and keeps the extremes', () => {
        const values = Array.from({ length: 10_000 }, (_, i) => i * i);
        const sample = jenksSample(values);
        expect(sample).toHaveLength(JENKS_SAMPLE_SIZE);
        expect(sample[0]).toBe(0);
        expect(sample.at(-1)).toBe(9999 * 9999);
        expect(jenksSample(values)).toEqual(sample);
        const result = classify(values, { method: 'jenks', classes: 5 });
        expect(result.breaks[0]).toBe(0);
        expect(result.breaks.at(-1)).toBe(9999 * 9999);
    });
});
