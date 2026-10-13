import type Feature from 'ol/Feature.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import type { ProjectionLike } from 'ol/proj.js';
import { get as getProjection } from 'ol/proj.js';
import type { HexbinSource } from './sources.js';

export interface WfsOptions {
    url: string;
    typeName: string;
    version?: '2.0.0' | '1.1.0';
    cql?: string;
    propertyNames?: readonly string[];
    sortBy?: string;
    pageSize?: number;
    maxFeatures?: number;
    fetch?: typeof fetch;
}

export interface WfsState {
    status: 'idle' | 'loading' | 'ready' | 'error';
    loaded: number;
    truncated: boolean;
    error: Error | null;
}

export interface WfsSource extends HexbinSource {
    getState: () => WfsState;
    reload: () => void;
    abort: () => void;
}

interface Page {
    features: Feature[];
    received: number;
    matched: number | null;
}

const projectionCode = (projection: ProjectionLike): string =>
    getProjection(projection)?.getCode() ?? String(projection);

const pageUrl = (options: WfsOptions, srsName: string, startIndex: number, count: number): string => {
    const version = options.version ?? '2.0.0';
    const modern = version === '2.0.0';
    const params = new URLSearchParams({
        service: 'WFS',
        version,
        request: 'GetFeature',
        [modern ? 'typeNames' : 'typeName']: options.typeName,
        outputFormat: 'application/json',
        srsName,
        startIndex: String(startIndex),
        [modern ? 'count' : 'maxFeatures']: String(count),
    });
    if (options.cql) params.set('CQL_FILTER', options.cql);
    if (options.sortBy) params.set('sortBy', options.sortBy);
    if (options.propertyNames?.length) params.set('propertyName', options.propertyNames.join(','));
    const separator = options.url.includes('?') ? '&' : '?';
    return `${options.url}${separator}${params.toString()}`;
};

const readPage = async (
    options: WfsOptions,
    format: GeoJSON,
    srsName: string,
    startIndex: number,
    count: number,
    signal: AbortSignal,
): Promise<Page> => {
    const run = options.fetch ?? fetch;
    const response = await run(pageUrl(options, srsName, startIndex, count), { signal });
    const text = await response.text();
    if (!response.ok) throw new Error(`WFS ${response.status}: ${text.slice(0, 200)}`);
    let data: { features?: unknown[]; numberMatched?: unknown; totalFeatures?: unknown };
    try {
        data = JSON.parse(text) as typeof data;
    } catch {
        throw new Error(`WFS did not answer JSON: ${text.slice(0, 200)}`);
    }
    const matched = Number(data.numberMatched ?? data.totalFeatures);
    return {
        features: format.readFeatures(data, { dataProjection: srsName, featureProjection: srsName }) as Feature[],
        received: data.features?.length ?? 0,
        matched: Number.isFinite(matched) ? matched : null,
    };
};

export const fromWfs = (options: WfsOptions): WfsSource => {
    const pageSize = options.pageSize ?? 5000;
    const maxFeatures = options.maxFeatures ?? 100_000;
    const format = new GeoJSON();
    const listeners = new Set<() => void>();
    let state: WfsState = { status: 'idle', loaded: 0, truncated: false, error: null };
    let features: Feature[] = [];
    let loadedFor: string | null = null;
    let controller: AbortController | null = null;

    const notify = () => listeners.forEach(listener => listener());

    const load = async (srsName: string) => {
        controller?.abort();
        const current = new AbortController();
        controller = current;
        loadedFor = srsName;
        features = [];
        state = { status: 'loading', loaded: 0, truncated: false, error: null };
        notify();
        try {
            const collected: Feature[] = [];
            let truncated = false;
            for (let start = 0; collected.length < maxFeatures; start += pageSize) {
                const count = Math.min(pageSize, maxFeatures - collected.length);
                const page = await readPage(options, format, srsName, start, count, current.signal);
                collected.push(...page.features);
                state = { ...state, loaded: collected.length };
                if (page.received < count) break;
                if (page.matched !== null && start + page.received >= page.matched) break;
                if (collected.length >= maxFeatures) {
                    truncated = page.matched === null || page.matched > collected.length;
                }
            }
            if (controller !== current) return;
            features = collected;
            state = { status: 'ready', loaded: collected.length, truncated, error: null };
        } catch (error) {
            if (controller !== current || current.signal.aborted) return;
            state = { ...state, status: 'error', error: error instanceof Error ? error : new Error(String(error)) };
        }
        notify();
    };

    return {
        read: (projection) => {
            const code = projectionCode(projection);
            if (loadedFor !== code) void load(code);
            return features;
        },
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        getState: () => state,
        reload: () => {
            if (loadedFor !== null) void load(loadedFor);
        },
        abort: () => {
            controller?.abort();
            controller = null;
            if (state.status === 'loading') state = { ...state, status: 'idle' };
            loadedFor = null;
        },
    };
};
