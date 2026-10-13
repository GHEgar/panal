import type Feature from 'ol/Feature.js';
import type { ProjectionLike } from 'ol/proj.js';
import { rollup } from '../core/rollup.js';
import type { Cell } from '../core/types.js';

export type LonLatExtent = [number, number, number, number];

export interface CellRequest {
    resolution: number;
    extent: LonLatExtent;
    projection: ProjectionLike;
    signal: AbortSignal;
}

export interface ServerCell {
    h3Index: string;
    value: number;
    count?: number;
}

export interface MembersRequest {
    h3Index: string;
    resolution: number;
    projection: ProjectionLike;
    signal: AbortSignal;
}

export type RollupMode = 'sum' | 'min' | 'max' | 'mean';

export interface CellProviderOptions {
    load: (request: CellRequest) => Promise<readonly ServerCell[]>;
    loadMembers?: (request: MembersRequest) => Promise<Feature[]>;
    resolutions?: readonly number[];
    extentDependent?: boolean;
    debounce?: number;
    rollup?: RollupMode;
}

export interface CellSource {
    kind: 'cells';
    load: CellProviderOptions['load'];
    loadMembers: CellProviderOptions['loadMembers'] | null;
    resolutions: readonly number[] | null;
    extentDependent: boolean;
    debounce: number;
    rollup: RollupMode | null;
    listenChanges?: (listener: () => void) => () => void;
}

export const fromCellProvider = (options: CellProviderOptions): CellSource => ({
    kind: 'cells',
    load: options.load,
    loadMembers: options.loadMembers ?? null,
    resolutions: options.resolutions?.length ? [...options.resolutions].sort((a, b) => a - b) : null,
    extentDependent: options.extentDependent ?? false,
    debounce: Math.max(0, options.debounce ?? 150),
    rollup: options.rollup ?? null,
});

export const effectiveResolution = (requested: number, resolutions: readonly number[] | null): number => {
    if (!resolutions) return requested;
    let chosen = resolutions[0] as number;
    for (const resolution of resolutions) {
        if (resolution <= requested) chosen = resolution;
    }
    return chosen;
};

export const toCells = (cells: readonly ServerCell[], mode: RollupMode | null = null): Cell<Feature>[] => cells.map((cell) => {
    const value = Number(cell.value);
    const count = Number(cell.count);
    const known = Number.isFinite(value);
    const weight = mode === 'mean' && Number.isFinite(count) ? count : 1;
    return {
        h3Index: cell.h3Index,
        count: Number.isFinite(count) ? count : 0,
        valueCount: known ? weight : 0,
        sum: known ? value * weight : 0,
        min: value,
        max: value,
        value,
        members: [],
    };
});

export const rollupServerCells = (cells: readonly ServerCell[], resolution: number, mode: RollupMode): Cell<Feature>[] =>
    [...rollup(toCells(cells, mode), { resolution, reducer: mode }).values()];

export interface ServerPlan {
    request: number;
    target: number;
}

export const planServerResolution = (requested: number, source: CellSource): ServerPlan => {
    const request = effectiveResolution(requested, source.resolutions);
    const target = source.rollup && request > requested ? requested : request;
    return { request, target };
};
