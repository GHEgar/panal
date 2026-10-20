import type { Color, PickingInfo } from '@deck.gl/core';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import type { H3HexagonLayerProps } from '@deck.gl/geo-layers';
import { ColumnLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { ColumnLayerProps, ScatterplotLayerProps } from '@deck.gl/layers';
import { classOf } from '../classify/class-of.js';
import type { Classification } from '../classify/types.js';
import type { ClassColors } from './colors.js';
import { colorKey, palette, TRANSPARENT } from './colors.js';
import type { HexbinCells, HexbinDeckDatum } from './data.js';
import { deckData, edgeLength, positionOf } from './data.js';
import type { BaseElevation } from './relief.js';
import { hexVertices, raised } from './relief.js';

export type HexbinDeckStyle = 'columns' | 'flat' | 'dots';

export type HexbinDeckMetric = 'value' | 'count';

export interface HexbinDeckCell {
    h3Index: string;
    value: number;
    count: number;
    classIndex: number;
}

export interface HexbinDeckLayerOptions {
    id?: string;
    cells: HexbinCells;
    classification: Pick<Classification, 'breaks'> | null | undefined;
    colors: ClassColors;
    noClassColor?: Color;
    style?: HexbinDeckStyle;
    metric?: HexbinDeckMetric;
    maxElevation?: number;
    maxRadius?: number;
    coverage?: number;
    pickable?: boolean;
    selected?: string | null;
    selectedColor?: Color;
    onSelect?: (cell: HexbinDeckCell, info: PickingInfo<HexbinDeckDatum>) => void;
    getBaseElevation?: BaseElevation;
    baseTrigger?: string | number;
    props?: Record<string, unknown>;
}

export type HexbinDeckLayer = H3HexagonLayer<HexbinDeckDatum> | ColumnLayer<HexbinDeckDatum> | ScatterplotLayer<HexbinDeckDatum>;

export const ELEVATION_PER_EDGE = 10;
export const RADIUS_PER_EDGE = 0.85;
export const COLUMN_COVERAGE = 0.9;
export const DOTS_SUFFIX = ':dots';

const toCell = (datum: HexbinDeckDatum, breaks: readonly number[]): HexbinDeckCell => ({
    h3Index: datum.h3Index,
    value: datum.value,
    count: datum.count,
    classIndex: classOf(datum.value, breaks),
});

export const createHexbinDeckLayer = (options: HexbinDeckLayerOptions): HexbinDeckLayer => {
    const { cells, classification, colors, selected = null, selectedColor, onSelect } = options;
    const style = options.style ?? 'columns';
    const metric = options.metric ?? 'value';
    const breaks = classification?.breaks ?? [];
    const { data, maxValue, maxCount, resolution } = deckData(cells);
    const edge = edgeLength(resolution);
    const maxElevation = options.maxElevation ?? edge * ELEVATION_PER_EDGE;
    const maxRadius = options.maxRadius ?? edge * RADIUS_PER_EDGE;
    const noClassColor = options.noClassColor ?? TRANSPARENT;
    const classes = Math.max(breaks.length - 1, 0);
    const fills = palette(colors, classes);
    const top = metric === 'count' ? maxCount : maxValue;
    const share = (datum: HexbinDeckDatum): number => {
        const raw = metric === 'count' ? datum.count : datum.value;
        return top > 0 && Number.isFinite(raw) && raw > 0 ? raw / top : 0;
    };
    const getFillColor = (datum: HexbinDeckDatum): Color => {
        if (selectedColor && datum.h3Index === selected) return selectedColor;
        return fills[classOf(datum.value, breaks)] ?? noClassColor;
    };
    const fillTrigger = [breaks.join(','), fills.map(colorKey).join(';'), colorKey(noClassColor), selected ?? '', colorKey(selectedColor)].join('|');
    const id = options.id ?? 'panal-hexbin';
    const common = {
        data,
        pickable: options.pickable ?? true,
        getFillColor,
        ...(onSelect ? {
            onClick: (info: PickingInfo<HexbinDeckDatum>) => {
                if (info.object) onSelect(toCell(info.object, breaks), info);
            },
        } : {}),
    };

    const base = options.getBaseElevation;
    const getPosition = base ? raised(base) : positionOf;
    const baseTrigger = base ? `base|${options.baseTrigger ?? ''}` : '';

    if (style === 'dots') {
        return new ScatterplotLayer<HexbinDeckDatum>({
            ...common,
            id: `${id}${DOTS_SUFFIX}`,
            getPosition,
            getRadius: datum => Math.sqrt(share(datum)) * maxRadius,
            radiusUnits: 'meters',
            radiusMinPixels: 1,
            filled: true,
            stroked: false,
            updateTriggers: {
                getFillColor: fillTrigger,
                getRadius: `${metric}|${maxRadius}`,
                getPosition: baseTrigger,
            },
            ...options.props as Partial<ScatterplotLayerProps<HexbinDeckDatum>>,
        });
    }

    const extruded = style === 'columns';
    const coverage = options.coverage ?? (extruded ? COLUMN_COVERAGE : 1);
    const getElevation = (datum: HexbinDeckDatum): number => share(datum) * maxElevation;
    const vertices = base ? hexVertices(data) : null;
    if (vertices) {
        return new ColumnLayer<HexbinDeckDatum>({
            ...common,
            id,
            diskResolution: vertices.length,
            vertices,
            radius: 1,
            coverage,
            extruded,
            filled: true,
            stroked: false,
            flatShading: true,
            getPosition,
            getElevation,
            elevationScale: 1,
            updateTriggers: {
                getFillColor: fillTrigger,
                getElevation: `${metric}|${maxElevation}`,
                getPosition: baseTrigger,
            },
            ...options.props as Partial<ColumnLayerProps<HexbinDeckDatum>>,
        });
    }
    return new H3HexagonLayer<HexbinDeckDatum>({
        ...common,
        id,
        getHexagon: datum => datum.h3Index,
        extruded,
        filled: true,
        stroked: false,
        coverage,
        getElevation,
        elevationScale: 1,
        updateTriggers: {
            getFillColor: fillTrigger,
            getElevation: `${metric}|${maxElevation}`,
        },
        ...options.props as Partial<H3HexagonLayerProps<HexbinDeckDatum>>,
    });
};
