import { cellToParent, getResolution } from 'h3-js';
import { clampResolution, reduceCell } from './packed.js';
import type { BuiltInReducer, Cell } from './types.js';

export interface RollupOptions {
    resolution: number;
    reducer?: BuiltInReducer;
}

export const rollup = <M>(cells: Iterable<Cell<M>>, options: RollupOptions): Map<string, Cell<M>> => {
    const target = clampResolution(options.resolution);
    const reducer = options.reducer ?? 'count';
    if (typeof reducer === 'function') throw new TypeError('rollup only supports built-in reducers');
    const parents = new Map<string, Cell<M> & { seen: Set<M> }>();

    for (const cell of cells) {
        const own = getResolution(cell.h3Index);
        if (own < target) throw new RangeError(`cell ${cell.h3Index} is coarser than resolution ${target}`);
        const h3Index = own === target ? cell.h3Index : cellToParent(cell.h3Index, target);
        let parent = parents.get(h3Index);
        if (!parent) {
            parent = { h3Index, count: 0, valueCount: 0, sum: 0, min: NaN, max: NaN, value: NaN, members: [], seen: new Set<M>() };
            parents.set(h3Index, parent);
        }
        parent.count += cell.count;
        if (cell.valueCount > 0) {
            parent.min = parent.valueCount === 0 ? cell.min : Math.min(parent.min, cell.min);
            parent.max = parent.valueCount === 0 ? cell.max : Math.max(parent.max, cell.max);
            parent.valueCount += cell.valueCount;
            parent.sum += cell.sum;
        }
        for (const member of cell.members) {
            if (parent.seen.has(member)) continue;
            parent.seen.add(member);
            parent.members.push(member);
        }
    }

    const result = new Map<string, Cell<M>>();
    for (const [h3Index, { seen, ...cell }] of parents) {
        void seen;
        cell.value = reduceCell(cell, reducer);
        result.set(h3Index, cell);
    }
    return result;
};
