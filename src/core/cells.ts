import { cellToBoundary } from 'h3-js';
import type { LonLat } from './types.js';

export const unwrapRing = (ring: readonly LonLat[]): LonLat[] => {
    let min = Infinity;
    let max = -Infinity;
    for (const [lon] of ring) {
        min = Math.min(min, lon);
        max = Math.max(max, lon);
    }
    if (max - min <= 180) return ring.map(([lon, lat]) => [lon, lat] as const);
    return ring.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat] as const);
};

export const cellRing = (h3Index: string): LonLat[] =>
    unwrapRing(cellToBoundary(h3Index, true) as unknown as LonLat[]);
