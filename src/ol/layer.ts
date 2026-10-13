import type Feature from 'ol/Feature.js';
import type { FeatureLike } from 'ol/Feature.js';
import type { Coordinate } from 'ol/coordinate.js';
import type { Options as VectorLayerOptions } from 'ol/layer/BaseVector.js';
import VectorLayer from 'ol/layer/Vector.js';
import type OlMap from 'ol/Map.js';
import { unByKey } from 'ol/Observable.js';
import { toLonLat } from 'ol/proj.js';
import VectorSource from 'ol/source/Vector.js';
import type { Style } from 'ol/style.js';
import { classify } from '../classify/classify.js';
import { classOf } from '../classify/class-of.js';
import { legend } from '../classify/legend.js';
import type { Classification, ClassifyOptions, LegendEntry } from '../classify/types.js';
import { cellOf, clampResolution } from '../core/aggregate.js';
import { createResolutionPicker } from '../core/resolution.js';
import type { ResolutionPickerOptions } from '../core/resolution.js';
import type { AggregateInput, Aggregator, Cell, LonLat, Reducer } from '../core/types.js';
import { cellToFeature, toInputs } from './features.js';
import type { ValueAccessor } from './features.js';
import { scheduleFrame } from './frame.js';
import { produceCells } from './produce.js';
import type { Selection } from './selection.js';
import type { CellSource } from './server.js';
import type { HexbinSource } from './sources.js';

export interface CellStyleContext {
    h3Index: string;
    value: number;
    count: number;
    classIndex: number;
    selected: boolean;
}

export type CellStyle = (feature: FeatureLike, context: CellStyleContext) => Style | Style[] | undefined;

export interface HexbinLayerOptions {
    map: OlMap;
    source: HexbinSource | CellSource;
    style: CellStyle;
    value?: ValueAccessor | undefined;
    reducer?: Reducer<Feature> | undefined;
    aggregator?: Aggregator | undefined;
    classification?: ClassifyOptions | undefined;
    resolution?: ResolutionPickerOptions | { fixed: number } | undefined;
    layerOptions?: Omit<VectorLayerOptions<Feature, VectorSource<Feature>>, 'source' | 'style'> | undefined;
}

export interface HexbinSnapshot {
    resolution: number | null;
    cellCount: number;
    classification: Classification | null;
    legend: LegendEntry[];
    status: 'ready' | 'loading' | 'error';
    error: Error | null;
    selection: Selection | null;
}

export interface HexbinLayer {
    layer: VectorLayer<VectorSource<Feature>, Feature>;
    getSnapshot: () => HexbinSnapshot;
    subscribe: (listener: () => void) => () => void;
    setClassification: (options: Partial<ClassifyOptions>) => void;
    setReducer: (reducer: Reducer<Feature>, value?: ValueAccessor) => void;
    setAggregator: (aggregator: Aggregator | undefined) => void;
    setStyle: (style: CellStyle) => void;
    cellAt: (coordinate: Coordinate) => Cell<Feature> | null;
    getCell: (h3Index: string) => Cell<Feature> | null;
    select: (h3Index: string | null) => void;
    refresh: () => void;
    destroy: () => void;
}

const DEFAULT_CLASSIFICATION: ClassifyOptions = { method: 'quantile', classes: 5 };

const isCellSource = (source: HexbinSource | CellSource): source is CellSource =>
    (source as CellSource).kind === 'cells';

const asError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

export const createHexbinLayer = (options: HexbinLayerOptions): HexbinLayer => {
    const { map } = options;
    const cellSource = isCellSource(options.source) ? options.source : null;
    const pointSource = isCellSource(options.source) ? null : options.source;
    const target = new VectorSource<Feature>();
    const layer = new VectorLayer({ ...options.layerOptions, source: target });
    const fixed = options.resolution && 'fixed' in options.resolution ? clampResolution(options.resolution.fixed) : null;
    const picker = fixed === null ? createResolutionPicker(options.resolution as ResolutionPickerOptions | undefined) : null;
    const listeners = new Set<() => void>();

    let style = options.style;
    let value = options.value;
    let reducer: Reducer<Feature> = options.reducer ?? 'count';
    let aggregator = options.aggregator;
    let classifyOptions: ClassifyOptions = options.classification ?? DEFAULT_CLASSIFICATION;
    let inputs: AggregateInput<Feature>[] = [];
    let cells: Cell<Feature>[] = [];
    let byIndex = new Map<string, Cell<Feature>>();
    let requested: number | null = null;
    let controller: AbortController | null = null;
    let membersController: AbortController | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let snapshot: HexbinSnapshot = {
        resolution: null, cellCount: 0, classification: null, legend: [], status: 'ready', error: null, selection: null,
    };
    let cancelFrame: (() => void) | null = null;

    const projection = () => map.getView().getProjection();
    const emit = () => listeners.forEach(listener => listener());

    layer.setStyle((feature) => style(feature, {
        h3Index: feature.get('h3Index') as string,
        value: feature.get('value') as number,
        count: feature.get('count') as number,
        classIndex: feature.get('classIndex') as number,
        selected: feature.get('h3Index') === snapshot.selection?.h3Index,
    }));

    const selectionFor = (h3Index: string | null): Selection | null => {
        membersController?.abort();
        membersController = null;
        const cell = h3Index === null ? undefined : byIndex.get(h3Index);
        if (!cell) return null;
        const loader = cellSource?.loadMembers;
        if (!loader) return { h3Index: cell.h3Index, cell, members: cell.members, status: 'ready', error: null };
        const current = new AbortController();
        membersController = current;
        loader({ h3Index: cell.h3Index, resolution: snapshot.resolution ?? 0, projection: projection(), signal: current.signal }).then((members) => {
            if (membersController !== current) return;
            snapshot = { ...snapshot, selection: { h3Index: cell.h3Index, cell, members, status: 'ready', error: null } };
            emit();
        }, (error: unknown) => {
            if (membersController !== current || current.signal.aborted) return;
            snapshot = { ...snapshot, selection: { h3Index: cell.h3Index, cell, members: [], status: 'error', error: asError(error) } };
            emit();
        });
        return { h3Index: cell.h3Index, cell, members: [], status: 'loading', error: null };
    };

    const reclassify = (patch: Partial<HexbinSnapshot> = {}) => {
        const values = cells.map(cell => cell.value);
        const classification = classify(values, classifyOptions);
        const features = cells.map(cell => cellToFeature(cell, projection(), classOf(cell.value, classification.breaks)));
        byIndex = new Map(cells.map(cell => [cell.h3Index, cell]));
        target.clear(true);
        target.addFeatures(features);
        const previous = snapshot.selection;
        const kept = previous && byIndex.get(previous.h3Index);
        const selection = !kept ? (previous ? selectionFor(null) : null)
            : cellSource?.loadMembers ? { ...previous, cell: kept } : { ...previous, cell: kept, members: kept.members };
        snapshot = { ...snapshot, ...patch, cellCount: cells.length, classification, legend: legend(classification, values), selection };
        emit();
    };

    const update = (resolution: number) => {
        requested = resolution;
        controller?.abort();
        const current = new AbortController();
        controller = current;
        const produced = produceCells({ map, resolution, inputs, reducer, aggregator, cellSource, signal: current.signal });
        if (!(produced.cells instanceof Promise)) {
            cells = produced.cells;
            reclassify({ resolution: produced.resolution, status: 'ready', error: null });
            return;
        }
        snapshot = { ...snapshot, status: 'loading', error: null };
        emit();
        produced.cells.then((next) => {
            if (controller !== current) return;
            cells = next;
            reclassify({ resolution: produced.resolution, status: 'ready', error: null });
        }, (error: unknown) => {
            if (controller !== current || current.signal.aborted) return;
            snapshot = { ...snapshot, status: 'error', error: asError(error) };
            emit();
        });
    };

    const centerLatitude = (): number | undefined => {
        const center = map.getView().getCenter();
        return center ? (toLonLat(center, projection())[1] as number) : undefined;
    };

    const currentResolution = (): number =>
        fixed ?? (picker as NonNullable<typeof picker>).pick(map.getView().getZoom() ?? NaN, centerLatitude());

    const readInputs = () => {
        if (pointSource) inputs = toInputs(pointSource.read(projection()), projection(), value);
    };

    const refresh = () => {
        readInputs();
        update(currentResolution());
    };

    const clearDebounce = () => {
        if (debounceTimer !== null) clearTimeout(debounceTimer);
        debounceTimer = null;
    };

    const onMoveEnd = () => {
        const resolution = currentResolution();
        clearDebounce();
        if (resolution !== requested) {
            update(resolution);
            return;
        }
        if (!cellSource?.extentDependent) return;
        if (cellSource.debounce === 0) {
            update(resolution);
            return;
        }
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            update(currentResolution());
        }, cellSource.debounce);
    };

    const onSourceChange = () => {
        cancelFrame?.();
        cancelFrame = scheduleFrame(() => {
            cancelFrame = null;
            refresh();
        });
    };

    const moveKey = map.on('moveend', onMoveEnd);
    const unsubscribeSource = pointSource?.subscribe(onSourceChange) ?? cellSource?.listenChanges?.(onSourceChange) ?? (() => undefined);
    map.addLayer(layer);
    refresh();

    return {
        layer,
        getSnapshot: () => snapshot,
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        setClassification: (next) => {
            classifyOptions = { ...classifyOptions, ...next } as ClassifyOptions;
            reclassify();
        },
        setReducer: (next, nextValue) => {
            reducer = next;
            if (nextValue !== undefined) {
                value = nextValue;
                readInputs();
            }
            update(requested ?? currentResolution());
        },
        setAggregator: (next) => {
            aggregator = next;
            update(requested ?? currentResolution());
        },
        setStyle: (next) => {
            style = next;
            layer.changed();
        },
        cellAt: (coordinate) => {
            if (snapshot.resolution === null) return null;
            const h3Index = cellOf(toLonLat(coordinate, projection()) as unknown as LonLat, snapshot.resolution);
            return h3Index === null ? null : byIndex.get(h3Index) ?? null;
        },
        getCell: h3Index => byIndex.get(h3Index) ?? null,
        select: (h3Index) => {
            snapshot = { ...snapshot, selection: selectionFor(h3Index) };
            layer.changed();
            emit();
        },
        refresh,
        destroy: () => {
            cancelFrame?.();
            clearDebounce();
            controller?.abort();
            membersController?.abort();
            controller = null;
            unByKey(moveKey);
            unsubscribeSource();
            map.removeLayer(layer);
            target.clear(true);
            listeners.clear();
        },
    };
};
