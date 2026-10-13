import { classOf } from './class-of.js';
import type { Classification, LegendEntry } from './types.js';

export const legend = (
    classification: Pick<Classification, 'breaks'>,
    values?: Iterable<number | null | undefined>,
): LegendEntry[] => {
    const { breaks } = classification;
    const entries: LegendEntry[] = [];
    for (let i = 0; i < breaks.length - 1; i += 1) {
        entries.push({
            classIndex: i,
            min: breaks[i] as number,
            max: breaks[i + 1] as number,
            count: 0,
            closed: i === breaks.length - 2 ? 'both' : 'left',
        });
    }
    if (values) {
        for (const value of values) {
            const entry = entries[classOf(value, breaks)];
            if (entry) entry.count += 1;
        }
    }
    return entries;
};
