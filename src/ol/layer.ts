import type Feature from 'ol/Feature.js';
import type { FeatureLike } from 'ol/Feature.js';
import type { Options as VectorLayerOptions } from 'ol/layer/BaseVector.js';
import VectorLayer from 'ol/layer/Vector.js';
import type OlMap from 'ol/Map.js';
import { unByKey } from 'ol/Observable.js';
import VectorSource from 'ol/source/Vector.js';
import type { Style } from 'ol/style.js';
import { classify } from '../classify/classify.js';
import { classOf } from '../classify/class-of.js';
import { legend } from '../classify/legend.js';
import type { Classification, ClassifyOptions, LegendEntry } from '../classify/types.js';
import { clampResolution } from '../core/aggregate.js';
import { createResolutionPicker } from '../core/resolution.js';
import type { ResolutionPickerOptions } from '../core/resolution.js';
import type { AggregateInput, Aggregator, Cell, Reducer } from '../core/types.js';
import { cellToFeature, toInputs } from './features.js';
import type { ValueAccessor } from './features.js';
import { scheduleFrame } from './frame.js';
import { produceCells } from './produce.js';
import type { CellSource } from './server.js';
import type { HexbinSource } from './sources.js';

export interface CellStyleContext {
    h3Index: string;
    value: number;
    count: number;
    classIndex: number;
}

export type CellStyle = (feature: FeatureLike, context: CellStyleContext) => Style | Style[] | undefined;

export interface HexbinLayerOptions {
    map: OlMap;
    source: HexbinSource | CellSource;
    style: CellStyle;
    value?: ValueAccessor;
    reducer?: Reducer<Feature>;
    aggregator?: Aggregator | undefined;
    classification?: ClassifyOptions;
    resolution?: ResolutionPickerOptions | { fixed: number };
    layerOptions?: Omit<VectorLayerOptions<Feature, VectorSource<Feature>>, 'source' | 'style'>;
}

export interface HexbinSnapshot {
    resolution: number | null;
    cellCount: number;
    classification: Classification | null;
    legend: LegendEntry[];
    status: 'ready' | 'loading' | 'error';
    error: Error | null;
}

export interface HexbinLayer {
    layer: VectorLayer<VectorSource<Feature>, Feature>;
    getSnapshot: () => HexbinSnapshot;
    subscribe: (listener: () => void) => () => void;
    setClassification: (options: Partial<ClassifyOptions>) => void;
    setReducer: (reducer: Reducer<Feature>, value?: ValueAccessor) => void;
    setAggregator: (aggregator: Aggregator | undefined) => void;
    refresh: () => void;
    destroy: () => void;
}

const DEFAULT_CLASSIFICATION: ClassifyOptions = { method: 'quantile', classes: 5 };

const isCellSource = (source: HexbinSource | CellSource): source is CellSource =>
    (source as CellSource).kind === 'cells';

export const createHexbinLayer = (options: HexbinLayerOptions): HexbinLayer => {
    const { map, style } = options;
    const cellSource = isCellSource(options.source) ? options.source : null;
    const pointSource = isCellSource(options.source) ? null : options.source;
    const target = new VectorSource<Feature>();
    const layer = new VectorLayer({ ...options.layerOptions, source: target });
    const fixed = options.resolution && 'fixed' in options.resolution ? clampResolution(options.resolution.fixed) : null;
    const picker = fixed === null ? createResolutionPicker(options.resolution as ResolutionPickerOptions | undefined) : null;
    const listeners = new Set<() => void>();

    let value = options.value;
    let reducer: Reducer<Feature> = options.reducer ?? 'count';
    let aggregator = options.aggregator;
    let classifyOptions: ClassifyOptions = options.classification ?? DEFAULT_CLASSIFICATION;
    let inputs: AggregateInput<Feature>[] = [];
    let cells: Cell<Feature>[] = [];
    let requested: number | null = null;
    let controller: AbortController | null = null;
    let snapshot: HexbinSnapshot = {
        resolution: null, cellCount: 0, classification: null, legend: [], status: 'ready', error: null,
    };
    let cancelFrame: (() => void) | null = null;

    const projection = () => map.getView().getProjection();
    const emit = () => listeners.forEach(listener => listener());

    layer.setStyle((feature) => style(feature, {
        h3Index: feature.get('h3Index') as string,
        value: feature.get('value') as number,
        count: feature.get('count') as number,
        classIndex: feature.get('classIndex') as number,
    }));

    const reclassify = (patch: Partial<HexbinSnapshot> = {}) => {
        const values = cells.map(cell => cell.value);
        const classification = classify(values, classifyOptions);
        const features = cells.map(cell => cellToFeature(cell, projection(), classOf(cell.value, classification.breaks)));
        target.clear(true);
        target.addFeatures(features);
        snapshot = { ...snapshot, ...patch, cellCount: cells.length, classification, legend: legend(classification, values) };
        emit();
    };

    const update = (resolution: number) => {
        requested = resolution;
        controller?.abort();
        const current = new AbortController();
        controller = current;
        const produced = produceCells({
            map, resolution, inputs, reducer, aggregator, cellSource, signal: current.signal,
        });
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
            snapshot = { ...snapshot, status: 'error', error: error instanceof Error ? error : new Error(String(error)) };
            emit();
        });
    };

    const currentResolution = (): number => fixed ?? (picker as NonNullable<typeof picker>).pick(map.getView().getZoom() ?? NaN);

    const readInputs = () => {
        if (pointSource) inputs = toInputs(pointSource.read(projection()), projection(), value);
    };

    const refresh = () => {
        readInputs();
        update(currentResolution());
    };

    const onMoveEnd = () => {
        const resolution = currentResolution();
        if (resolution !== requested || cellSource?.extentDependent) update(resolution);
    };

    const onSourceChange = () => {
        cancelFrame?.();
        cancelFrame = scheduleFrame(() => {
            cancelFrame = null;
            refresh();
        });
    };

    const moveKey = map.on('moveend', onMoveEnd);
    const unsubscribeSource = pointSource ? pointSource.subscribe(onSourceChange) : () => undefined;
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
        refresh,
        destroy: () => {
            cancelFrame?.();
            controller?.abort();
            controller = null;
            unByKey(moveKey);
            unsubscribeSource();
            map.removeLayer(layer);
            target.clear(true);
            listeners.clear();
        },
    };
};
