import type Feature from 'ol/Feature.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import type { ProjectionLike } from 'ol/proj.js';
import { get as getProjection } from 'ol/proj.js';
import { fetchWfsPages } from '../core/wfs.js';
import type { WfsRequestOptions } from '../core/wfs.js';
import type { HexbinSource } from './sources.js';

export interface WfsOptions extends WfsRequestOptions {
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

const projectionCode = (projection: ProjectionLike): string =>
    getProjection(projection)?.getCode() ?? String(projection);

export const fromWfs = (options: WfsOptions): WfsSource => {
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
            const { truncated } = await fetchWfsPages(options, srsName, options.fetch ?? fetch, current.signal, (data) => {
                const page = format.readFeatures(data, { dataProjection: srsName, featureProjection: srsName }) as Feature[];
                collected.push(...page);
                state = { ...state, loaded: collected.length };
                return page.length;
            });
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
