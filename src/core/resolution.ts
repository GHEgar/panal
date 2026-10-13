import { getHexagonEdgeLengthAvg } from 'h3-js';
import { H3_MAX_RESOLUTION, H3_MIN_RESOLUTION } from './aggregate.js';
import type { ResolutionStep } from './types.js';

const EQUATOR_METERS_PER_PIXEL_Z0 = 156543.03392804097;

export interface DefaultTableOptions {
    viewportWidth?: number;
    cellsAcross?: number;
    min?: number;
    max?: number;
}

export const zoomForResolution = (resolution: number, viewportWidth = 1000, cellsAcross = 40): number => {
    const cellWidth = Math.sqrt(3) * getHexagonEdgeLengthAvg(resolution, 'm');
    return Math.log2((viewportWidth * EQUATOR_METERS_PER_PIXEL_Z0) / (cellsAcross * cellWidth));
};

export const defaultResolutionTable = (options: DefaultTableOptions = {}): ResolutionStep[] => {
    const { viewportWidth = 1000, cellsAcross = 40, min = H3_MIN_RESOLUTION, max = H3_MAX_RESOLUTION } = options;
    const table: ResolutionStep[] = [];
    for (let resolution = min; resolution < max; resolution += 1) {
        const here = zoomForResolution(resolution, viewportWidth, cellsAcross);
        const next = zoomForResolution(resolution + 1, viewportWidth, cellsAcross);
        table.push({ maxZoom: (here + next) / 2, resolution });
    }
    table.push({ maxZoom: Infinity, resolution: max });
    return table;
};

export interface ResolutionPickerOptions {
    table?: readonly ResolutionStep[];
    hysteresis?: number;
    latitudeCorrection?: boolean;
}

export interface ResolutionPicker {
    pick: (zoom: number, latitude?: number) => number;
    finest: number;
    current: () => number | null;
    reset: () => void;
}

export const MAX_LATITUDE = 85;

export const latitudeZoomOffset = (latitude: number): number => {
    if (!Number.isFinite(latitude)) return 0;
    const clamped = Math.min(MAX_LATITUDE, Math.abs(latitude));
    return clamped === 0 ? 0 : -Math.log2(Math.cos((clamped * Math.PI) / 180));
};

const validateTable = (table: readonly ResolutionStep[]): ResolutionStep[] => {
    if (table.length === 0) throw new RangeError('resolution table cannot be empty');
    const sorted = [...table].sort((a, b) => a.maxZoom - b.maxZoom);
    sorted.forEach((step, index) => {
        if (index > 0 && step.maxZoom === (sorted[index - 1] as ResolutionStep).maxZoom) {
            throw new RangeError('resolution table has repeated maxZoom');
        }
    });
    return sorted;
};

export const createResolutionPicker = (options: ResolutionPickerOptions = {}): ResolutionPicker => {
    const table = validateTable(options.table ?? defaultResolutionTable());
    const hysteresis = Math.max(0, options.hysteresis ?? 0.3);
    const correct = options.latitudeCorrection ?? true;
    const last = table.length - 1;
    let index: number | null = null;

    const baseIndex = (zoom: number): number => {
        const found = table.findIndex(step => zoom <= step.maxZoom);
        return found === -1 ? last : found;
    };

    const inside = (zoom: number, at: number): boolean => {
        const lower = at === 0 ? -Infinity : (table[at - 1] as ResolutionStep).maxZoom - hysteresis;
        const upper = at === last ? Infinity : (table[at] as ResolutionStep).maxZoom + hysteresis;
        return zoom > lower && zoom <= upper;
    };

    const pick = (rawZoom: number, latitude?: number): number => {
        if (!Number.isFinite(rawZoom)) {
            return (table[index ?? 0] as ResolutionStep).resolution;
        }
        const zoom = correct && latitude !== undefined ? rawZoom + latitudeZoomOffset(latitude) : rawZoom;
        if (index === null || !inside(zoom, index)) index = baseIndex(zoom);
        return (table[index] as ResolutionStep).resolution;
    };

    return {
        pick,
        finest: Math.max(...table.map(step => step.resolution)),
        current: () => (index === null ? null : (table[index] as ResolutionStep).resolution),
        reset: () => {
            index = null;
        },
    };
};
