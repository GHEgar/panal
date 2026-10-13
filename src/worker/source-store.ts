import { aggregatePacked } from '../core/packed.js';
import type { PackedCells } from '../core/packed.js';
import { fetchWfsPages } from '../core/wfs.js';
import type { WfsCollection, WfsRequestOptions } from '../core/wfs.js';
import type { WfsLoadResult, WorkerMember } from './protocol.js';

const EARTH_RADIUS = 6378137;
const DEGREES = 180 / Math.PI;

export const mercatorToLonLat = (x: number, y: number): [number, number] => [
    (x / EARTH_RADIUS) * DEGREES,
    (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) * DEGREES,
];

interface StoredSource {
    lonLat: number[];
    owner: number[];
    ids: (string | number | null)[];
    properties: Record<string, unknown>[];
    values: Map<string, Float64Array>;
    last: { key: string; cells: PackedCells } | null;
}

const pointsOf = (geometry: { type?: string; coordinates?: unknown } | null | undefined): [number, number][] => {
    if (!geometry) return [];
    if (geometry.type === 'Point') return [geometry.coordinates as [number, number]];
    if (geometry.type === 'MultiPoint') return geometry.coordinates as [number, number][];
    return [];
};

const numeric = (raw: unknown): number => {
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string' && raw.trim() !== '') return Number(raw);
    return NaN;
};

export const createSourceStore = (run: typeof fetch) => {
    const sources = new Map<string, StoredSource>();

    const add = (source: StoredSource, data: WfsCollection): number => {
        const features = data.features ?? [];
        for (const feature of features) {
            const points = pointsOf(feature.geometry);
            if (points.length === 0) continue;
            const id = source.ids.length;
            source.ids.push(feature.id ?? null);
            source.properties.push(feature.properties ?? {});
            for (const [x, y] of points) {
                const [lon, lat] = mercatorToLonLat(x, y);
                source.lonLat.push(lon, lat);
                source.owner.push(id);
            }
        }
        return features.length;
    };

    const load = async (
        sourceId: string,
        options: WfsRequestOptions,
        signal: AbortSignal,
        onProgress: (loaded: number) => void,
    ): Promise<WfsLoadResult> => {
        const source: StoredSource = { lonLat: [], owner: [], ids: [], properties: [], values: new Map(), last: null };
        const { truncated } = await fetchWfsPages(options, 'EPSG:3857', run, signal, (data) => {
            const received = add(source, data);
            onProgress(source.ids.length);
            return received;
        });
        sources.set(sourceId, source);
        return { loaded: source.ids.length, truncated };
    };

    const require = (sourceId: string): StoredSource => {
        const source = sources.get(sourceId);
        if (!source) throw new Error(`unknown source ${sourceId}`);
        return source;
    };

    const valuesOf = (source: StoredSource, field: string | null): Float64Array => {
        const key = field ?? '';
        let values = source.values.get(key);
        if (!values) {
            values = Float64Array.from(source.properties, properties => (field === null ? NaN : numeric(properties[field])));
            source.values.set(key, values);
        }
        return values;
    };

    const aggregate = (sourceId: string, resolution: number, field: string | null): PackedCells => {
        const source = require(sourceId);
        const key = `${resolution}|${field ?? ''}`;
        if (source.last?.key === key) return source.last.cells;
        const cells = aggregatePacked({
            lonLat: Float64Array.from(source.lonLat),
            owner: Int32Array.from(source.owner),
            values: valuesOf(source, field),
        }, resolution);
        source.last = { key, cells };
        return cells;
    };

    const members = (sourceId: string, resolution: number, h3Index: string): WorkerMember[] => {
        const source = require(sourceId);
        const cells = source.last?.key.startsWith(`${resolution}|`) ? source.last.cells : aggregate(sourceId, resolution, null);
        const index = cells.h3.indexOf(h3Index);
        if (index === -1) return [];
        const result: WorkerMember[] = [];
        for (let k = cells.memberOffsets[index] as number; k < (cells.memberOffsets[index + 1] as number); k += 1) {
            const id = cells.memberIds[k] as number;
            const lonLat: [number, number][] = [];
            source.owner.forEach((owner, point) => {
                if (owner === id) lonLat.push([source.lonLat[point * 2] as number, source.lonLat[point * 2 + 1] as number]);
            });
            result.push({ id: source.ids[id] ?? null, properties: source.properties[id] ?? {}, lonLat });
        }
        return result;
    };

    return {
        load,
        aggregate,
        members,
        release: (sourceId: string) => sources.delete(sourceId),
    };
};
