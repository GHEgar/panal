import { latLngToCell } from 'h3-js';
import { describe, expect, it } from 'vitest';
import { cellRing, unwrapRing } from '../../src/core/index.js';

describe('cellRing', () => {
    it('returns a closed lon lat ring', () => {
        const ring = cellRing('87498c96effffff');
        expect(ring).toHaveLength(7);
        expect(ring[0]).toEqual(ring.at(-1));
        expect(ring[0]?.[0]).toBeCloseTo(-103.35, 1);
    });

    it('unwraps cells that cross the antimeridian', () => {
        const ring = cellRing(latLngToCell(0, 179.99, 2));
        const lons = ring.map(([lon]) => lon);
        expect(Math.max(...lons) - Math.min(...lons)).toBeLessThan(180);
        expect(Math.min(...lons)).toBeGreaterThan(0);
    });

    it('leaves ordinary rings untouched', () => {
        expect(unwrapRing([[1, 2], [3, 4]])).toEqual([[1, 2], [3, 4]]);
    });
});
