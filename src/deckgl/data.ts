import { cellToLatLng, getHexagonEdgeLengthAvg, getResolution, isValidCell } from 'h3-js';
import { legend } from '../classify/legend.js';
import type { Classification } from '../classify/types.js';

export interface HexbinCellLike {
    h3Index: string;
    value: number;
    count?: number;
}

export type HexbinCells = ReadonlyMap<string, HexbinCellLike> | Iterable<HexbinCellLike>;

export interface HexbinDeckDatum {
    h3Index: string;
    value: number;
    count: number;
    position: [number, number] | null;
}

export interface HexbinDeckData {
    data: HexbinDeckDatum[];
    maxValue: number;
    maxCount: number;
    resolution: number | null;
}

const cache = new WeakMap<object, HexbinDeckData>();

const cellsOf = (cells: HexbinCells): Iterable<HexbinCellLike> =>
    cells instanceof Map ? (cells as ReadonlyMap<string, HexbinCellLike>).values() : cells as Iterable<HexbinCellLike>;

const build = (cells: HexbinCells): HexbinDeckData => {
    const data: HexbinDeckDatum[] = [];
    let maxValue = 0;
    let maxCount = 0;
    for (const cell of cellsOf(cells)) {
        const count = cell.count ?? 1;
        data.push({ h3Index: cell.h3Index, value: cell.value, count, position: null });
        if (Number.isFinite(cell.value)) maxValue = Math.max(maxValue, cell.value);
        if (Number.isFinite(count)) maxCount = Math.max(maxCount, count);
    }
    const first = data.find(datum => isValidCell(datum.h3Index));
    return { data, maxValue, maxCount, resolution: first ? getResolution(first.h3Index) : null };
};

export const deckData = (cells: HexbinCells): HexbinDeckData => {
    const key = cells as object;
    let entry = cache.get(key);
    if (!entry) {
        entry = build(cells);
        cache.set(key, entry);
    }
    return entry;
};

export const positionOf = (datum: HexbinDeckDatum): [number, number] => {
    if (!datum.position) {
        const [lat, lon] = cellToLatLng(datum.h3Index);
        datum.position = [lon, lat];
    }
    return datum.position;
};

export const edgeLength = (resolution: number | null): number =>
    resolution === null ? 0 : getHexagonEdgeLengthAvg(resolution, 'm');

export const classCounts = (
    cells: HexbinCells,
    classification: Pick<Classification, 'breaks'> | null | undefined,
): number[] => {
    if (!classification) return [];
    return legend(classification, deckData(cells).data.map(datum => datum.value)).map(entry => entry.count);
};
