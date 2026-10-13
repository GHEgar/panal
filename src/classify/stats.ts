import type { ValueStats } from './types.js';

export const finiteSorted = (values: Iterable<number | null | undefined>): number[] => {
    const result: number[] = [];
    for (const value of values) {
        if (typeof value === 'number' && Number.isFinite(value)) result.push(value);
    }
    return result.sort((a, b) => a - b);
};

export const computeStats = (sorted: readonly number[]): ValueStats => {
    const n = sorted.length;
    if (n === 0) return { n: 0, min: NaN, max: NaN, mean: NaN, stdDev: NaN };
    let sum = 0;
    for (const value of sorted) sum += value;
    const mean = sum / n;
    let squares = 0;
    for (const value of sorted) squares += (value - mean) ** 2;
    return { n, min: sorted[0] as number, max: sorted[n - 1] as number, mean, stdDev: Math.sqrt(squares / n) };
};

export const at = (sorted: readonly number[], index: number): number => sorted[index] as number;
