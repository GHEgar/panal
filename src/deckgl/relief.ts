import { cellToBoundary, cellToLatLng, isPentagon, isValidCell } from 'h3-js';
import type { HexbinDeckDatum } from './data.js';
import { positionOf } from './data.js';

export interface HexbinBaseCell {
    h3Index: string;
    position: [number, number];
}

export type BaseElevation = (cell: HexbinBaseCell) => number | null | undefined;

const METERS_PER_DEGREE = 111_319.49;

const outlines = new WeakMap<readonly HexbinDeckDatum[], [number, number][] | null>();

const outline = (data: readonly HexbinDeckDatum[]): [number, number][] | null => {
    const sample = data.find(datum => isValidCell(datum.h3Index) && !isPentagon(datum.h3Index));
    if (!sample) return null;
    const [lat, lng] = cellToLatLng(sample.h3Index);
    const scale = Math.cos((lat * Math.PI) / 180);
    const ring = cellToBoundary(sample.h3Index, true).slice(0, -1);
    return ring.map(([x, y]) => {
        const dx = ((((x as number) - lng + 540) % 360) - 180) * METERS_PER_DEGREE * scale;
        return [dx, ((y as number) - lat) * METERS_PER_DEGREE];
    });
};

export const hexVertices = (data: readonly HexbinDeckDatum[]): [number, number][] | null => {
    if (!outlines.has(data)) outlines.set(data, outline(data));
    return outlines.get(data) ?? null;
};

export const raised = (base: BaseElevation) => (datum: HexbinDeckDatum): [number, number, number] => {
    const position = positionOf(datum);
    const z = base({ h3Index: datum.h3Index, position });
    return [position[0], position[1], typeof z === 'number' && Number.isFinite(z) ? z : 0];
};
