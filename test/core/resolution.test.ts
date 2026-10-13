import { describe, expect, it } from 'vitest';
import { createResolutionPicker, defaultResolutionTable } from '../../src/core/index.js';

const table = [
    { maxZoom: 5, resolution: 3 },
    { maxZoom: 8, resolution: 5 },
    { maxZoom: 11, resolution: 7 },
    { maxZoom: Infinity, resolution: 9 },
];

describe('defaultResolutionTable', () => {
    it('covers every resolution with growing zooms', () => {
        const steps = defaultResolutionTable();
        expect(steps.map(step => step.resolution)).toEqual(Array.from({ length: 16 }, (_, i) => i));
        steps.slice(1).forEach((step, index) => {
            expect(step.maxZoom).toBeGreaterThan((steps[index] as { maxZoom: number }).maxZoom);
        });
    });

    it('lands near one kilometer cells around zoom 11', () => {
        const picker = createResolutionPicker();
        expect(picker.pick(11)).toBeGreaterThanOrEqual(6);
        expect(picker.pick(11)).toBeLessThanOrEqual(8);
    });

    it('honours min and max', () => {
        const steps = defaultResolutionTable({ min: 4, max: 9 });
        expect(steps[0]?.resolution).toBe(4);
        expect(steps.at(-1)).toEqual({ maxZoom: Infinity, resolution: 9 });
    });
});

describe('createResolutionPicker', () => {
    it('reads the table without hysteresis', () => {
        const picker = createResolutionPicker({ table, hysteresis: 0 });
        expect(picker.pick(2)).toBe(3);
        expect(picker.pick(5)).toBe(3);
        expect(picker.pick(5.01)).toBe(5);
        expect(picker.pick(30)).toBe(9);
    });

    it('holds the resolution inside the margin in both directions', () => {
        const picker = createResolutionPicker({ table, hysteresis: 0.5 });
        expect(picker.pick(4.9)).toBe(3);
        expect(picker.pick(5.3)).toBe(3);
        expect(picker.pick(5.6)).toBe(5);
        expect(picker.pick(4.7)).toBe(5);
        expect(picker.pick(4.4)).toBe(3);
    });

    it('jumps straight to the right step on big moves', () => {
        const picker = createResolutionPicker({ table, hysteresis: 0.5 });
        picker.pick(3);
        expect(picker.pick(12)).toBe(9);
        expect(picker.pick(1)).toBe(3);
    });

    it('keeps the current resolution for non finite zooms and can reset', () => {
        const picker = createResolutionPicker({ table });
        expect(picker.current()).toBeNull();
        picker.pick(9);
        expect(picker.pick(NaN)).toBe(7);
        picker.reset();
        expect(picker.current()).toBeNull();
    });

    it('sorts the table and rejects bad ones', () => {
        const picker = createResolutionPicker({ table: [...table].reverse(), hysteresis: 0 });
        expect(picker.pick(6)).toBe(5);
        expect(() => createResolutionPicker({ table: [] })).toThrow(RangeError);
        expect(() => createResolutionPicker({ table: [{ maxZoom: 5, resolution: 3 }, { maxZoom: 5, resolution: 4 }] })).toThrow(RangeError);
    });
});
