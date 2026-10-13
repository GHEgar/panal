import { latLngToCell } from 'h3-js';
import { aggregatePacked, clampResolution, packInputs, unpackCells } from './packed.js';
import type { AggregateInput, AggregateOptions, Cell, LonLat } from './types.js';

export { clampResolution, H3_MAX_RESOLUTION, H3_MIN_RESOLUTION, reduceCell } from './packed.js';

export const isValidLonLat = (point: LonLat): boolean => {
    const [lon, lat] = point;
    return Number.isFinite(lon) && Number.isFinite(lat) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
};

export const cellOf = (point: LonLat, resolution: number): string | null => {
    if (!isValidLonLat(point)) return null;
    return latLngToCell(point[1], point[0], clampResolution(resolution));
};

export const aggregate = <M>(
    inputs: Iterable<AggregateInput<M>>,
    options: AggregateOptions<M>,
): Map<string, Cell<M>> => {
    const { input, members } = packInputs(inputs);
    return unpackCells(aggregatePacked(input, options.resolution), members, input.values, options.reducer ?? 'count');
};
