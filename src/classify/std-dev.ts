import type { ValueStats } from './types.js';

export const STD_DEV_LIMIT = 3;

export const stdDevBreaks = (stats: ValueStats, interval: number): number[] => {
    const { min, max, mean, stdDev } = stats;
    if (!(stdDev > 0)) return [min, max];
    const inner: number[] = [];
    for (let z = interval / 2; z <= STD_DEV_LIMIT; z += interval) {
        inner.push(mean - z * stdDev, mean + z * stdDev);
    }
    const breaks = inner.filter(value => value > min && value < max).sort((a, b) => a - b);
    return [min, ...breaks, max];
};
