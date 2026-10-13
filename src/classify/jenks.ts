import { at } from './stats.js';

export const JENKS_SAMPLE_SIZE = 4000;

export const jenksSample = (sorted: readonly number[]): number[] => {
    if (sorted.length <= JENKS_SAMPLE_SIZE) return [...sorted];
    const last = sorted.length - 1;
    const sample: number[] = [];
    for (let i = 0; i < JENKS_SAMPLE_SIZE; i += 1) {
        sample.push(at(sorted, Math.round((i * last) / (JENKS_SAMPLE_SIZE - 1))));
    }
    return sample;
};

const lowerClassLimits = (data: readonly number[], classes: number): Int32Array => {
    const n = data.length;
    const width = classes + 1;
    const lower = new Int32Array((n + 1) * width);
    const variance = new Float64Array((n + 1) * width).fill(Infinity);
    for (let j = 1; j <= classes; j += 1) {
        lower[width + j] = 1;
        variance[width + j] = 0;
    }
    for (let l = 2; l <= n; l += 1) {
        let sum = 0;
        let squares = 0;
        for (let m = 1; m <= l; m += 1) {
            const start = l - m + 1;
            const value = at(data, start - 1);
            sum += value;
            squares += value * value;
            const own = squares - (sum * sum) / m;
            const previous = start - 1;
            if (previous === 0) continue;
            for (let j = 2; j <= classes; j += 1) {
                const candidate = own + (variance[previous * width + j - 1] as number);
                if ((variance[l * width + j] as number) >= candidate) {
                    lower[l * width + j] = start;
                    variance[l * width + j] = candidate;
                }
            }
        }
        lower[l * width + 1] = 1;
        variance[l * width + 1] = squares - (sum * sum) / l;
    }
    return lower;
};

export const jenksBreaks = (sorted: readonly number[], classes: number): number[] => {
    const data = jenksSample(sorted);
    const k = Math.min(classes, data.length);
    const width = k + 1;
    const lower = lowerClassLimits(data, k);
    const breaks = new Array<number>(k + 1);
    breaks[0] = at(data, 0);
    breaks[k] = at(data, data.length - 1);
    let end = data.length;
    for (let j = k; j >= 2; j -= 1) {
        const start = lower[end * width + j] as number;
        breaks[j - 1] = at(data, start - 1);
        end = start - 1;
    }
    return breaks;
};
