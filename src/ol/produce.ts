import type Feature from 'ol/Feature.js';
import type OlMap from 'ol/Map.js';
import { transformExtent } from 'ol/proj.js';
import { aggregate } from '../core/aggregate.js';
import type { AggregateInput, Aggregator, Cell, Reducer } from '../core/types.js';
import { effectiveResolution, toCells } from './server.js';
import type { CellSource, LonLatExtent } from './server.js';

export interface ProduceRequest {
    map: OlMap;
    resolution: number;
    inputs: readonly AggregateInput<Feature>[];
    reducer: Reducer<Feature>;
    aggregator: Aggregator | undefined;
    cellSource: CellSource | null;
    signal: AbortSignal;
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
        const resolution = effectiveResolution(request.resolution, cellSource.resolutions);
        const cells = cellSource
            .load({ resolution, extent: viewExtent(map), projection: map.getView().getProjection(), signal })
            .then(toCells);
        return { resolution, cells };
    }
    const options = { resolution: request.resolution, reducer };
    const result = aggregator ? aggregator(inputs, options) : aggregate(inputs, options);
    const cells = result instanceof Promise ? result.then(found => [...found.values()]) : [...result.values()];
    return { resolution: request.resolution, cells };
};
