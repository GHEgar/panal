import { latLngToCell } from 'h3-js';
import type { AggregateInput, AggregateOptions, Cell, CustomReducer, LonLat, Reducer } from './types.js';

export const H3_MIN_RESOLUTION = 0;
export const H3_MAX_RESOLUTION = 15;

export const clampResolution = (resolution: number): number => {
    if (!Number.isFinite(resolution)) throw new RangeError('resolution must be a finite number');
    return Math.min(H3_MAX_RESOLUTION, Math.max(H3_MIN_RESOLUTION, Math.round(resolution)));
};

export const isValidLonLat = (point: LonLat): boolean => {
    const [lon, lat] = point;
    return Number.isFinite(lon) && Number.isFinite(lat) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
};

export const cellOf = (point: LonLat, resolution: number): string | null => {
    if (!isValidLonLat(point)) return null;
    return latLngToCell(point[1], point[0], clampResolution(resolution));
};

interface Bucket<M> extends Cell<M> {
    values: number[];
}

const newBucket = <M>(h3Index: string): Bucket<M> => ({
    h3Index,
    count: 0,
    valueCount: 0,
    sum: 0,
    min: NaN,
    max: NaN,
    value: NaN,
    members: [],
    values: [],
});

const add = <M>(bucket: Bucket<M>, member: M, value: number | null | undefined, keepValues: boolean): void => {
    bucket.count += 1;
    bucket.members.push(member);
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    bucket.valueCount += 1;
    bucket.sum += value;
    bucket.min = bucket.valueCount === 1 ? value : Math.min(bucket.min, value);
    bucket.max = bucket.valueCount === 1 ? value : Math.max(bucket.max, value);
    if (keepValues) bucket.values.push(value);
};

export const reduceCell = <M>(cell: Cell<M>, reducer: Reducer<M>, values: readonly number[] = []): number => {
    if (typeof reducer === 'function') return reducer(values, cell.members);
    if (reducer === 'count') return cell.count;
    if (cell.valueCount === 0) return NaN;
    if (reducer === 'sum') return cell.sum;
    if (reducer === 'mean') return cell.sum / cell.valueCount;
    return reducer === 'min' ? cell.min : cell.max;
};

export const aggregate = <M>(
    inputs: Iterable<AggregateInput<M>>,
    options: AggregateOptions<M>,
): Map<string, Cell<M>> => {
    const resolution = clampResolution(options.resolution);
    const reducer = options.reducer ?? 'count';
    const keepValues = typeof reducer === 'function';
    const buckets = new Map<string, Bucket<M>>();

    for (const input of inputs) {
        const touched = new Set<string>();
        for (const point of input.coordinates) {
            const h3Index = cellOf(point, resolution);
            if (h3Index === null || touched.has(h3Index)) continue;
            touched.add(h3Index);
            let bucket = buckets.get(h3Index);
            if (!bucket) {
                bucket = newBucket<M>(h3Index);
                buckets.set(h3Index, bucket);
            }
            add(bucket, input.member, input.value, keepValues);
        }
    }

    const cells = new Map<string, Cell<M>>();
    for (const [h3Index, bucket] of buckets) {
        const { values, ...cell } = bucket;
        cell.value = reduceCell(cell, reducer as Reducer<M> | CustomReducer<M>, values);
        cells.set(h3Index, cell);
    }
    return cells;
};
