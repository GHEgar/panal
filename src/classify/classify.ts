import { equalIntervalBreaks } from './equal-interval.js';
import { jenksBreaks } from './jenks.js';
import { quantileBreaks } from './quantile.js';
import { computeStats, finiteSorted } from './stats.js';
import { stdDevBreaks } from './std-dev.js';
import type { Classification, ClassifyOptions } from './types.js';

export const DEFAULT_CLASSES = 5;

const collapse = (breaks: readonly number[]): number[] => {
    const result: number[] = [];
    for (const value of breaks.slice(0, -1)) {
        if (result.length === 0 || value > (result[result.length - 1] as number)) result.push(value);
    }
    result.push(breaks[breaks.length - 1] as number);
    return result;
};

const validateManual = (breaks: readonly number[] | undefined): number[] => {
    if (!breaks || breaks.length < 2) throw new RangeError('manual classification needs at least two breaks');
    for (let i = 0; i < breaks.length; i += 1) {
        const value = breaks[i] as number;
        if (!Number.isFinite(value)) throw new RangeError('manual breaks must be finite');
        if (i > 0 && value <= (breaks[i - 1] as number)) throw new RangeError('manual breaks must be strictly increasing');
    }
    return [...breaks];
};

const requestedClasses = (classes: number | undefined): number => {
    const value = classes ?? DEFAULT_CLASSES;
    if (!Number.isInteger(value) || value < 1) throw new RangeError('classes must be a positive integer');
    return value;
};

export const classify = (values: Iterable<number | null | undefined>, options: ClassifyOptions): Classification => {
    const sorted = finiteSorted(values);
    const stats = computeStats(sorted);
    const { method } = options;

    if (method === 'manual') {
        const breaks = validateManual(options.breaks);
        return { method, breaks, requested: breaks.length - 1, actual: breaks.length - 1, stats };
    }

    const requested = requestedClasses(options.classes);
    if (stats.n === 0) return { method, breaks: [], requested, actual: 0, stats };

    let raw: number[];
    if (stats.min === stats.max) raw = [stats.min, stats.max];
    else if (method === 'quantile') raw = quantileBreaks(sorted, requested);
    else if (method === 'jenks') raw = jenksBreaks(sorted, requested);
    else if (method === 'equalInterval') raw = equalIntervalBreaks(stats.min, stats.max, requested);
    else raw = stdDevBreaks(stats, options.stdDev?.interval ?? 1);

    const breaks = collapse(raw);
    const actual = breaks.length - 1;
    return { method, breaks, requested: method === 'stdDev' ? actual : requested, actual, stats };
};
