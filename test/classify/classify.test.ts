import { describe, expect, it } from 'vitest';
import { classify, classOf, legend } from '../../src/classify/index.js';

describe('classify', () => {
    it('ignores non finite values and reports stats', () => {
        const result = classify([3, null, 1, NaN, 2, undefined, Infinity], { method: 'equalInterval', classes: 2 });
        expect(result.stats).toMatchObject({ n: 3, min: 1, max: 3, mean: 2 });
        expect(result.stats.stdDev).toBeCloseTo(Math.sqrt(2 / 3));
        expect(result.breaks).toEqual([1, 2, 3]);
    });

    it('returns no classes without values', () => {
        const result = classify([], { method: 'quantile' });
        expect(result).toMatchObject({ breaks: [], requested: 5, actual: 0 });
    });

    it('returns one class when every value is equal', () => {
        const result = classify([4, 4, 4], { method: 'jenks', classes: 3 });
        expect(result.breaks).toEqual([4, 4]);
        expect(result.actual).toBe(1);
        expect(classOf(4, result.breaks)).toBe(0);
    });

    it('interpolates quantiles', () => {
        expect(classify([1, 2, 3, 4, 5], { method: 'quantile', classes: 4 }).breaks).toEqual([1, 2, 3, 4, 5]);
        expect(classify([0, 10], { method: 'quantile', classes: 4 }).breaks).toEqual([0, 2.5, 5, 7.5, 10]);
    });

    it('collapses repeated breaks and says so', () => {
        const result = classify([1, 1, 1, 1, 1, 1, 2, 9], { method: 'quantile', classes: 4 });
        expect(result.requested).toBe(4);
        expect(result.actual).toBeLessThan(4);
        expect(new Set(result.breaks).size).toBe(result.breaks.length);
    });

    it('builds equal intervals ending exactly at max', () => {
        const result = classify([0, 0.1, 0.3], { method: 'equalInterval', classes: 3 });
        expect(result.breaks).toHaveLength(4);
        expect(result.breaks[3]).toBe(0.3);
    });

    it('centers the middle standard deviation class on the mean', () => {
        const values = Array.from({ length: 101 }, (_, i) => i);
        const result = classify(values, { method: 'stdDev' });
        const { mean, stdDev } = result.stats;
        expect(result.breaks).toContain(mean - stdDev / 2);
        expect(result.breaks).toContain(mean + stdDev / 2);
        expect(result.breaks[0]).toBe(0);
        expect(result.breaks.at(-1)).toBe(100);
        const half = classify(values, { method: 'stdDev', stdDev: { interval: 0.5 } });
        expect(half.actual).toBeGreaterThan(result.actual);
    });

    it('caps standard deviation breaks at three sigma', () => {
        const values = [...Array.from({ length: 999 }, () => 0), 1000];
        const result = classify(values, { method: 'stdDev' });
        const { mean, stdDev } = result.stats;
        const inner = result.breaks.slice(1, -1);
        expect(inner.every(value => Math.abs(value - mean) <= 3 * stdDev)).toBe(true);
    });

    it('accepts manual breaks and validates them', () => {
        expect(classify([5], { method: 'manual', breaks: [0, 10, 20] })).toMatchObject({ actual: 2, breaks: [0, 10, 20] });
        expect(() => classify([5], { method: 'manual', breaks: [0, 0, 1] })).toThrow(RangeError);
        expect(() => classify([5], { method: 'manual', breaks: [1] })).toThrow(RangeError);
    });

    it('rejects invalid class counts', () => {
        expect(() => classify([1, 2], { method: 'quantile', classes: 0 })).toThrow(RangeError);
        expect(() => classify([1, 2], { method: 'quantile', classes: 2.5 })).toThrow(RangeError);
    });
});

describe('classOf', () => {
    const breaks = [0, 10, 20, 30];

    it('closes intervals on the left and the last one on both sides', () => {
        expect(classOf(0, breaks)).toBe(0);
        expect(classOf(9.99, breaks)).toBe(0);
        expect(classOf(10, breaks)).toBe(1);
        expect(classOf(20, breaks)).toBe(2);
        expect(classOf(30, breaks)).toBe(2);
    });

    it('returns -1 outside the range or for non finite values', () => {
        expect(classOf(-1, breaks)).toBe(-1);
        expect(classOf(31, breaks)).toBe(-1);
        expect(classOf(NaN, breaks)).toBe(-1);
        expect(classOf(null, breaks)).toBe(-1);
        expect(classOf(5, [])).toBe(-1);
    });
});

describe('legend', () => {
    it('describes each class and counts values', () => {
        const entries = legend({ breaks: [0, 10, 20] }, [0, 5, 10, 20, 25, null]);
        expect(entries).toEqual([
            { classIndex: 0, min: 0, max: 10, count: 2, closed: 'left' },
            { classIndex: 1, min: 10, max: 20, count: 2, closed: 'both' },
        ]);
    });

    it('leaves counts at zero without values', () => {
        expect(legend({ breaks: [1, 2] })[0]?.count).toBe(0);
    });
});
