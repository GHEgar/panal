import { latLngToCell } from 'h3-js';
import type { AggregateInput, Cell, Reducer } from './types.js';

export interface PackedInput {
    lonLat: Float64Array;
    owner: Int32Array;
    values: Float64Array;
}

export interface PackedCells {
    h3: string[];
    count: Int32Array;
    valueCount: Int32Array;
    sum: Float64Array;
    min: Float64Array;
    max: Float64Array;
    memberOffsets: Int32Array;
    memberIds: Int32Array;
}

export const H3_MIN_RESOLUTION = 0;
export const H3_MAX_RESOLUTION = 15;

export const clampResolution = (resolution: number): number => {
    if (!Number.isFinite(resolution)) throw new RangeError('resolution must be a finite number');
    return Math.min(H3_MAX_RESOLUTION, Math.max(H3_MIN_RESOLUTION, Math.round(resolution)));
};

const validLonLat = (lon: number, lat: number): boolean =>
    Number.isFinite(lon) && Number.isFinite(lat) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;

export const packInputs = <M>(inputs: Iterable<AggregateInput<M>>): { input: PackedInput; members: M[] } => {
    const members: M[] = [];
    const values: number[] = [];
    const lonLat: number[] = [];
    const owner: number[] = [];
    for (const item of inputs) {
        const id = members.length;
        members.push(item.member);
        values.push(typeof item.value === 'number' ? item.value : NaN);
        for (const point of item.coordinates) {
            lonLat.push(point[0], point[1]);
            owner.push(id);
        }
    }
    return {
        input: { lonLat: Float64Array.from(lonLat), owner: Int32Array.from(owner), values: Float64Array.from(values) },
        members,
    };
};

interface Bucket {
    count: number;
    valueCount: number;
    sum: number;
    min: number;
    max: number;
    ids: number[];
}

export const aggregatePacked = (input: PackedInput, resolution: number): PackedCells => {
    const res = clampResolution(resolution);
    const buckets = new Map<string, Bucket>();
    const { lonLat, owner, values } = input;
    let current = -1;
    let touched = new Set<string>();

    for (let i = 0; i < owner.length; i += 1) {
        const id = owner[i] as number;
        if (id !== current) {
            current = id;
            touched = new Set<string>();
        }
        const lon = lonLat[i * 2] as number;
        const lat = lonLat[i * 2 + 1] as number;
        if (!validLonLat(lon, lat)) continue;
        const h3 = latLngToCell(lat, lon, res);
        if (touched.has(h3)) continue;
        touched.add(h3);
        let bucket = buckets.get(h3);
        if (!bucket) {
            bucket = { count: 0, valueCount: 0, sum: 0, min: NaN, max: NaN, ids: [] };
            buckets.set(h3, bucket);
        }
        bucket.count += 1;
        bucket.ids.push(id);
        const value = values[id] as number;
        if (!Number.isFinite(value)) continue;
        bucket.valueCount += 1;
        bucket.sum += value;
        bucket.min = bucket.valueCount === 1 ? value : Math.min(bucket.min, value);
        bucket.max = bucket.valueCount === 1 ? value : Math.max(bucket.max, value);
    }

    const size = buckets.size;
    const cells: PackedCells = {
        h3: [],
        count: new Int32Array(size),
        valueCount: new Int32Array(size),
        sum: new Float64Array(size),
        min: new Float64Array(size),
        max: new Float64Array(size),
        memberOffsets: new Int32Array(size + 1),
        memberIds: new Int32Array(0),
    };
    const ids: number[] = [];
    let index = 0;
    for (const [h3, bucket] of buckets) {
        cells.h3.push(h3);
        cells.count[index] = bucket.count;
        cells.valueCount[index] = bucket.valueCount;
        cells.sum[index] = bucket.sum;
        cells.min[index] = bucket.min;
        cells.max[index] = bucket.max;
        cells.memberOffsets[index] = ids.length;
        for (const id of bucket.ids) ids.push(id);
        index += 1;
    }
    cells.memberOffsets[size] = ids.length;
    cells.memberIds = Int32Array.from(ids);
    return cells;
};

export const reduceCell = <M>(cell: Cell<M>, reducer: Reducer<M>, values: readonly number[] = []): number => {
    if (typeof reducer === 'function') return reducer(values, cell.members);
    if (reducer === 'count') return cell.count;
    if (cell.valueCount === 0) return NaN;
    if (reducer === 'sum') return cell.sum;
    if (reducer === 'mean') return cell.sum / cell.valueCount;
    return reducer === 'min' ? cell.min : cell.max;
};

export const unpackCells = <M>(
    packed: PackedCells,
    members: readonly M[],
    values: Float64Array,
    reducer: Reducer<M>,
): Map<string, Cell<M>> => {
    const cells = new Map<string, Cell<M>>();
    const custom = typeof reducer === 'function';
    packed.h3.forEach((h3Index, index) => {
        const start = packed.memberOffsets[index] as number;
        const end = packed.memberOffsets[index + 1] as number;
        const cellMembers: M[] = [];
        const cellValues: number[] = [];
        for (let k = start; k < end; k += 1) {
            const id = packed.memberIds[k] as number;
            cellMembers.push(members[id] as M);
            const value = values[id] as number;
            if (custom && Number.isFinite(value)) cellValues.push(value);
        }
        const cell: Cell<M> = {
            h3Index,
            count: packed.count[index] as number,
            valueCount: packed.valueCount[index] as number,
            sum: packed.sum[index] as number,
            min: packed.min[index] as number,
            max: packed.max[index] as number,
            value: NaN,
            members: cellMembers,
        };
        cell.value = reduceCell(cell, reducer, cellValues);
        cells.set(h3Index, cell);
    });
    return cells;
};
