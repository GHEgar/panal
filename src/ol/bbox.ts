import type { LonLatExtent } from './server.js';

export type MercatorExtent = [number, number, number, number];

const EARTH_RADIUS = 6378137;
const MAX_MERCATOR_LATITUDE = 85.0511287798;

const toMercator = (lon: number, lat: number): [number, number] => {
    const clamped = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, lat));
    return [
        (lon * Math.PI * EARTH_RADIUS) / 180,
        EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360)),
    ];
};

export const lonLatToMercatorExtent = (extent: LonLatExtent): MercatorExtent => {
    const [minX, minY] = toMercator(extent[0], extent[1]);
    const [maxX, maxY] = toMercator(extent[2], extent[3]);
    return [minX, minY, maxX, maxY];
};

export const expandExtent = (extent: MercatorExtent, margin: number): MercatorExtent => {
    const dx = (extent[2] - extent[0]) * margin;
    const dy = (extent[3] - extent[1]) * margin;
    return [extent[0] - dx, extent[1] - dy, extent[2] + dx, extent[3] + dy];
};

export const containsExtent = (outer: MercatorExtent, inner: MercatorExtent): boolean =>
    outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];

export interface FragmentSink {
    set(name: string, fragment: string | null): void;
}

export interface BboxCqlOptions {
    composer?: FragmentSink | undefined;
    fragment?: string | undefined;
}

export const bboxCql = (geometryName: string, extent: MercatorExtent, cql?: string, options: BboxCqlOptions = {}): string => {
    const box = `BBOX(${geometryName}, ${extent.map(value => value.toFixed(2)).join(', ')}, 'EPSG:3857')`;
    options.composer?.set(options.fragment ?? 'bbox', box);
    return cql ? `${box} AND (${cql})` : box;
};
