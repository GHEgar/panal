import { at } from './stats.js';

export const quantileBreaks = (sorted: readonly number[], classes: number): number[] => {
    const last = sorted.length - 1;
    const breaks: number[] = [];
    for (let i = 0; i <= classes; i += 1) {
        const position = (last * i) / classes;
        const lower = Math.floor(position);
        const fraction = position - lower;
        const base = at(sorted, lower);
        breaks.push(fraction === 0 ? base : base + (at(sorted, lower + 1) - base) * fraction);
    }
    return breaks;
};
