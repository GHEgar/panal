import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ClassifyOptions } from '../classify/types.js';
import type { Aggregator, Reducer } from '../core/types.js';
import type { ValueAccessor } from '../ol/features.js';
import { createHexbinLayer } from '../ol/layer.js';
import type { CellStyle, HexbinLayer, HexbinLayerOptions, HexbinSnapshot } from '../ol/layer.js';
import { bindCellClick } from '../ol/selection.js';
import type { CellClickOptions } from '../ol/selection.js';
import type Feature from 'ol/Feature.js';

export interface UseHexbinLayerOptions extends HexbinLayerOptions {
    selectOnClick?: boolean | CellClickOptions | undefined;
}

interface Applied {
    style: CellStyle;
    classification: string;
    reducer: Reducer<Feature> | undefined;
    value: ValueAccessor | undefined;
    aggregator: Aggregator | undefined;
}

const classificationKey = (classification: ClassifyOptions | undefined): string => JSON.stringify(classification ?? null);

const noop = () => undefined;

export function useHexbinSnapshot(hexbin: HexbinLayer | null): HexbinSnapshot | null {
    const subscribe = useCallback((listener: () => void) => {
        if (!hexbin) return noop;
        const unsubscribe = hexbin.subscribe(listener);
        return () => {
            unsubscribe();
        };
    }, [hexbin]);
    const getSnapshot = useCallback(() => hexbin?.getSnapshot() ?? null, [hexbin]);
    return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

export function useHexbinLayer(options: UseHexbinLayerOptions | null): HexbinLayer | null {
    const [hexbin, setHexbin] = useState<HexbinLayer | null>(null);
    const latest = useRef(options);
    const applied = useRef<Applied | null>(null);
    const map = options?.map ?? null;
    const source = options?.source ?? null;
    const style = options?.style;
    const key = classificationKey(options?.classification);
    const reducer = options?.reducer;
    const value = options?.value;
    const aggregator = options?.aggregator;
    const click = options?.selectOnClick ?? false;
    const clickKey = JSON.stringify(click);

    useEffect(() => {
        latest.current = options;
    });

    useEffect(() => {
        const current = latest.current;
        if (!map || !source || !current) return undefined;
        const created = createHexbinLayer(current);
        applied.current = {
            style: current.style,
            classification: classificationKey(current.classification),
            reducer: current.reducer,
            value: current.value,
            aggregator: current.aggregator,
        };
        setHexbin(created);
        return () => {
            created.destroy();
            applied.current = null;
            setHexbin(null);
        };
    }, [map, source]);

    useEffect(() => {
        const done = applied.current;
        if (!hexbin || !done || !style || style === done.style) return;
        done.style = style;
        hexbin.setStyle(style);
    }, [hexbin, style]);

    useEffect(() => {
        const done = applied.current;
        const classification = latest.current?.classification;
        if (!hexbin || !done || key === done.classification || !classification) return;
        done.classification = key;
        hexbin.setClassification(classification);
    }, [hexbin, key]);

    useEffect(() => {
        const done = applied.current;
        if (!hexbin || !done || (reducer === done.reducer && value === done.value)) return;
        done.reducer = reducer;
        done.value = value;
        hexbin.setReducer(reducer ?? 'count', value);
    }, [hexbin, reducer, value]);

    useEffect(() => {
        const done = applied.current;
        if (!hexbin || !done || aggregator === done.aggregator) return;
        done.aggregator = aggregator;
        hexbin.setAggregator(aggregator);
    }, [hexbin, aggregator]);

    useEffect(() => {
        if (!hexbin || !map || clickKey === 'false') return undefined;
        const parsed = JSON.parse(clickKey) as boolean | CellClickOptions;
        return bindCellClick(hexbin, map, parsed === true ? {} : parsed as CellClickOptions);
    }, [hexbin, map, clickKey]);

    return hexbin;
}
