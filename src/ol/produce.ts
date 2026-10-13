import type Feature from 'ol/Feature.js';
import type OlMap from 'ol/Map.js';
import { transformExtent } from 'ol/proj.js';
import { aggregate } from '../core/aggregate.js';
import { rollup } from '../core/rollup.js';
import type { AggregateInput, Aggregator, BuiltInReducer, Cell, Reducer } from '../core/types.js';
import { planServerResolution, rollupServerCells, toCells } from './server.js';
import type { CellSource, LonLatExtent } from './server.js';

export interface ProduceRequest {
    map: OlMap;
    resolution: number;
    inputs: readonly AggregateInput<Feature>[];
    reducer: Reducer<Feature>;
    aggregator: Aggregator | undefined;
    cellSource: CellSource | null;
    hierarchy: Hierarchy | null;
    signal: AbortSignal;
}

type CellMap = Map<string, Cell<Feature>>;

export interface Hierarchy {
    base: number;
    inputs?: readonly AggregateInput<Feature>[];
    reducer?: Reducer<Feature>;
    aggregator?: Aggregator | undefined;
    cells?: CellMap | Promise<CellMap> | undefined;
}

export interface Produced {
    resolution: number;
    cells: Cell<Feature>[] | Promise<Cell<Feature>[]>;
}

const viewExtent = (map: OlMap): LonLatExtent => {
    const view = map.getView();
    const size = map.getSize();
    if (!size || !view.isDef()) return [-180, -90, 180, 90];
    const extent = transformExtent(view.calculateExtent(size), view.getProjection(), 'EPSG:4326');
    return [Math.max(-180, extent[0] as number), Math.max(-90, extent[1] as number), Math.min(180, extent[2] as number), Math.min(90, extent[3] as number)];
};

export const produceCells = (request: ProduceRequest): Produced => {
    const { map, inputs, reducer, aggregator, cellSource, signal } = request;
    if (cellSource) {
        const { request: asked, target } = planServerResolution(request.resolution, cellSource);
        const mode = cellSource.rollup;
        const cells = cellSource
            .load({ resolution: asked, extent: viewExtent(map), projection: map.getView().getProjection(), signal })
            .then(found => (mode && target !== asked ? rollupServerCells(found, target, mode) : toCells(found)));
        return { resolution: target, cells };
    }
    const run = (resolution: number) => (aggregator ? aggregator(inputs, { resolution, reducer }) : aggregate(inputs, { resolution, reducer }));
    const { hierarchy } = request;
    if (hierarchy && typeof reducer !== 'function' && request.resolution <= hierarchy.base) {
        const fresh = hierarchy.inputs === inputs && hierarchy.reducer === reducer && hierarchy.aggregator === aggregator;
        if (!fresh || !hierarchy.cells) {
            Object.assign(hierarchy, { inputs, reducer, aggregator, cells: run(hierarchy.base) });
            if (hierarchy.cells instanceof Promise) hierarchy.cells.catch(() => { hierarchy.cells = undefined; });
        }
        const up = (base: CellMap) => [...rollup(base.values(), { resolution: request.resolution, reducer: reducer as BuiltInReducer }).values()];
        const base = hierarchy.cells as CellMap | Promise<CellMap>;
        return { resolution: request.resolution, cells: base instanceof Promise ? base.then(up) : up(base) };
    }
    const result = run(request.resolution);
    const cells = result instanceof Promise ? result.then(found => [...found.values()]) : [...result.values()];
    return { resolution: request.resolution, cells };
};
