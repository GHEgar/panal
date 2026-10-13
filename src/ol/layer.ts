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
import { aggregate, clampResolution } from '../core/aggregate.js';
import { createResolutionPicker } from '../core/resolution.js';
import type { ResolutionPickerOptions } from '../core/resolution.js';
import type { AggregateInput, Cell, Reducer } from '../core/types.js';
import { cellToFeature, toInputs } from './features.js';
import type { ValueAccessor } from './features.js';
import { scheduleFrame } from './frame.js';
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
    source: HexbinSource;
    style: CellStyle;
    value?: ValueAccessor;
    reducer?: Reducer<Feature>;
    classification?: ClassifyOptions;
    resolution?: ResolutionPickerOptions | { fixed: number };
    layerOptions?: Omit<VectorLayerOptions<Feature, VectorSource<Feature>>, 'source' | 'style'>;
}

export interface HexbinSnapshot {
    resolution: number | null;
    cellCount: number;
    classification: Classification | null;
    legend: LegendEntry[];
}

export interface HexbinLayer {
    layer: VectorLayer<VectorSource<Feature>, Feature>;
    getSnapshot: () => HexbinSnapshot;
    subscribe: (listener: () => void) => () => void;
    setClassification: (options: Partial<ClassifyOptions>) => void;
    setReducer: (reducer: Reducer<Feature>, value?: ValueAccessor) => void;
    refresh: () => void;
    destroy: () => void;
}

const DEFAULT_CLASSIFICATION: ClassifyOptions = { method: 'quantile', classes: 5 };

export const createHexbinLayer = (options: HexbinLayerOptions): HexbinLayer => {
    const { map, source, style } = options;
    const target = new VectorSource<Feature>();
    const layer = new VectorLayer({ ...options.layerOptions, source: target });
    const fixed = options.resolution && 'fixed' in options.resolution ? clampResolution(options.resolution.fixed) : null;
    const picker = fixed === null ? createResolutionPicker(options.resolution as ResolutionPickerOptions | undefined) : null;
    const listeners = new Set<() => void>();

    let value = options.value;
    let reducer: Reducer<Feature> = options.reducer ?? 'count';
    let classifyOptions: ClassifyOptions = options.classification ?? DEFAULT_CLASSIFICATION;
    let inputs: AggregateInput<Feature>[] = [];
    let cells: Cell<Feature>[] = [];
    let snapshot: HexbinSnapshot = { resolution: null, cellCount: 0, classification: null, legend: [] };
    let cancelFrame: (() => void) | null = null;

    const projection = () => map.getView().getProjection();
    const emit = () => listeners.forEach(listener => listener());

    layer.setStyle((feature) => style(feature, {
        h3Index: feature.get('h3Index') as string,
        value: feature.get('value') as number,
        count: feature.get('count') as number,
        classIndex: feature.get('classIndex') as number,
    }));

    const reclassify = () => {
        const values = cells.map(cell => cell.value);
        const classification = classify(values, classifyOptions);
        const features = cells.map(cell => cellToFeature(cell, projection(), classOf(cell.value, classification.breaks)));
        target.clear(true);
        target.addFeatures(features);
        snapshot = { ...snapshot, cellCount: cells.length, classification, legend: legend(classification, values) };
        emit();
    };

    const reaggregate = (resolution: number) => {
        cells = [...aggregate(inputs, { resolution, reducer }).values()];
        snapshot = { ...snapshot, resolution };
        reclassify();
    };

    const currentResolution = (): number => fixed ?? (picker as NonNullable<typeof picker>).pick(map.getView().getZoom() ?? NaN);

    const readInputs = () => {
        inputs = toInputs(source.read(projection()), projection(), value);
    };

    const refresh = () => {
        readInputs();
        reaggregate(currentResolution());
    };

    const onMoveEnd = () => {
        const resolution = currentResolution();
        if (resolution !== snapshot.resolution) reaggregate(resolution);
    };

    const onSourceChange = () => {
        cancelFrame?.();
        cancelFrame = scheduleFrame(() => {
            cancelFrame = null;
            refresh();
        });
    };

    const moveKey = map.on('moveend', onMoveEnd);
    const unsubscribeSource = source.subscribe(onSourceChange);
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
            reaggregate(snapshot.resolution ?? currentResolution());
        },
        refresh,
        destroy: () => {
            cancelFrame?.();
            unByKey(moveKey);
            unsubscribeSource();
            map.removeLayer(layer);
            target.clear(true);
            listeners.clear();
        },
    };
};
