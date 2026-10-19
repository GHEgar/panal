import type { Classification } from './types.js';

export interface LegendClassItem {
    label: string;
    color: string;
    min: number;
    max: number;
    count?: number;
}

export interface ClassesLegendEntry {
    kind: 'classes';
    layerId: string;
    title: string;
    classes: LegendClassItem[];
}

export interface LegendEntryOptions {
    format?: (value: number) => string;
}

const formatValue = (value: number): string => {
    const rounded = Number(value.toFixed(2));
    return Object.is(rounded, -0) ? '0' : String(rounded);
};

export const legendEntry = (
    layerId: string,
    title: string,
    classification: Pick<Classification, 'breaks'>,
    colors: readonly string[],
    counts?: readonly number[],
    options: LegendEntryOptions = {},
): ClassesLegendEntry => {
    const format = options.format ?? formatValue;
    const { breaks } = classification;
    const classes = breaks.slice(0, -1).map((min, index): LegendClassItem => {
        const max = breaks[index + 1] as number;
        const color = colors[index];
        if (color === undefined) throw new RangeError(`Class ${index} of ${layerId} has no color`);
        const item: LegendClassItem = { label: `${format(min)} – ${format(max)}`, color, min, max };
        const count = counts?.[index];
        if (count !== undefined) item.count = count;
        return item;
    });
    return { kind: 'classes', layerId, title, classes };
};
