import Feature from 'ol/Feature.js';
import MultiPoint from 'ol/geom/MultiPoint.js';
import Point from 'ol/geom/Point.js';
import { fromLonLat } from 'ol/proj.js';
import type { ProjectionLike } from 'ol/proj.js';
import { reduceCell } from '../core/packed.js';
import type { PackedCells } from '../core/packed.js';
import type { BuiltInReducer, Cell } from '../core/types.js';
import type { WfsRequestOptions } from '../core/wfs.js';
import { openChannel } from '../worker/channel.js';
import type { MessagePort, WfsLoadResult, WorkerMember } from '../worker/protocol.js';
import { bboxCql, containsExtent, expandExtent, lonLatToMercatorExtent } from './bbox.js';
import type { MercatorExtent } from './bbox.js';
import type { CellSource, LonLatExtent, ServerCell } from './server.js';
import type { WfsState } from './wfs.js';

export interface WorkerWfsBbox {
    geometryName: string;
    margin?: number;
}

export interface WorkerWfsOptions extends WfsRequestOptions {
    value?: string | undefined;
    reducer?: BuiltInReducer | undefined;
    bbox?: WorkerWfsBbox | undefined;
}

const requestOptions = (options: WorkerWfsOptions, cql: string | undefined): WfsRequestOptions => {
    const { url, typeName, version, sortBy, propertyNames, pageSize, maxFeatures } = options;
    const request: WfsRequestOptions = { url, typeName };
    if (version) request.version = version;
    if (cql) request.cql = cql;
    if (sortBy) request.sortBy = sortBy;
    if (propertyNames) request.propertyNames = [...propertyNames];
    if (pageSize) request.pageSize = pageSize;
    if (maxFeatures) request.maxFeatures = maxFeatures;
    return request;
};

export interface WorkerWfsSource extends CellSource {
    getState: () => WfsState;
    subscribe: (listener: () => void) => () => void;
    setReducer: (reducer: BuiltInReducer, value?: string | null) => void;
    reload: () => void;
    release: () => void;
}

const toFeature = (member: WorkerMember, projection: ProjectionLike): Feature => {
    const coordinates = member.lonLat.map(point => fromLonLat(point, projection));
    const geometry = coordinates.length === 1 ? new Point(coordinates[0] as number[]) : new MultiPoint(coordinates);
    const feature = new Feature({ ...member.properties, geometry });
    if (member.id !== null) feature.setId(member.id);
    return feature;
};

export const toServerCells = (cells: PackedCells, reducer: BuiltInReducer): ServerCell[] =>
    cells.h3.map((h3Index, index) => {
        const cell: Cell<never> = {
            h3Index,
            count: cells.count[index] as number,
            valueCount: cells.valueCount[index] as number,
            sum: cells.sum[index] as number,
            min: cells.min[index] as number,
            max: cells.max[index] as number,
            value: NaN,
            members: [],
        };
        return { h3Index, value: reduceCell(cell, reducer), count: cell.count };
    });

export const createWorkerWfsSource = (worker: MessagePort, options: WorkerWfsOptions): WorkerWfsSource => {
    const channel = openChannel(worker);
    const sourceId = `wfs-${Math.random().toString(36).slice(2)}`;
    const listeners = new Set<() => void>();
    const changes = new Set<() => void>();
    let state: WfsState = { status: 'idle', loaded: 0, truncated: false, error: null };
    let reducer: BuiltInReducer = options.reducer ?? 'count';
    let value: string | null = options.value ?? null;
    let loading: Promise<void> | null = null;
    let loadedExtent: MercatorExtent | null = null;
    let loadController: AbortController | null = null;
    const margin = Math.max(0, options.bbox?.margin ?? 0.5);

    const notify = () => listeners.forEach(listener => listener());
    const invalidate = () => changes.forEach(listener => listener());

    const fetchInto = (extent: MercatorExtent | null): Promise<void> => {
        loadController?.abort();
        const controller = new AbortController();
        loadController = controller;
        loadedExtent = extent;
        const cql = extent && options.bbox ? bboxCql(options.bbox.geometryName, extent, options.cql) : options.cql;
        const run = (async () => {
            state = { status: 'loading', loaded: 0, truncated: false, error: null };
            notify();
            try {
                const result = await channel.request<WfsLoadResult>(
                    { type: 'wfs-load', sourceId, options: requestOptions(options, cql) },
                    [],
                    {
                        signal: controller.signal,
                        onProgress: (loaded) => {
                            state = { ...state, loaded };
                            notify();
                        },
                    },
                );
                state = { status: 'ready', loaded: result.loaded, truncated: result.truncated, error: null };
                notify();
            } catch (error) {
                if (loadController === controller) loading = null;
                if (!controller.signal.aborted) {
                    state = { ...state, status: 'error', error: error instanceof Error ? error : new Error(String(error)) };
                    notify();
                }
                throw error;
            }
        })();
        loading = run;
        return run;
    };

    const ensureLoaded = (view: LonLatExtent): Promise<void> => {
        if (!options.bbox) return loading ?? fetchInto(null);
        const wanted = lonLatToMercatorExtent(view);
        if (loading && loadedExtent && containsExtent(loadedExtent, wanted)) return loading;
        return fetchInto(expandExtent(wanted, margin));
    };

    return {
        kind: 'cells',
        resolutions: null,
        extentDependent: Boolean(options.bbox),
        debounce: options.bbox ? 150 : 0,
        rollup: null,
        load: async ({ resolution, extent, signal }) => {
            await ensureLoaded(extent);
            const cells = await channel.request<PackedCells>(
                { type: 'source-aggregate', sourceId, resolution, value },
                [],
                { signal },
            );
            return toServerCells(cells, reducer);
        },
        loadMembers: async ({ h3Index, resolution, projection, signal }) => {
            const members = await channel.request<WorkerMember[]>(
                { type: 'source-members', sourceId, resolution, h3Index },
                [],
                { signal },
            );
            return members.map(member => toFeature(member, projection));
        },
        listenChanges: (listener) => {
            changes.add(listener);
            return () => changes.delete(listener);
        },
        getState: () => state,
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        setReducer: (next, nextValue) => {
            reducer = next;
            if (nextValue !== undefined) value = nextValue;
            invalidate();
        },
        reload: () => {
            loading = null;
            loadedExtent = null;
            invalidate();
        },
        release: () => {
            loadController?.abort();
            void channel.request({ type: 'source-release', sourceId }).catch(() => undefined);
            channel.close();
            listeners.clear();
            changes.clear();
        },
    };
};
