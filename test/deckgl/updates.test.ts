import { latLngToCell } from 'h3-js';
import { describe, expect, it } from 'vitest';
import { classCounts, createHexbinDeckLayer } from '../../src/deckgl/index.js';
import type { HexbinDeckLayerOptions } from '../../src/deckgl/index.js';

const cells = new Map([
    ['a', { h3Index: latLngToCell(20.67, -103.35, 6), value: 10 }],
    ['b', { h3Index: latLngToCell(19.43, -99.13, 6), value: 40 }],
    ['c', { h3Index: latLngToCell(25.67, -100.31, 6), value: 20 }],
    ['d', { h3Index: latLngToCell(21.16, -86.85, 6), value: 12 }],
]);
const classification = { breaks: [0, 15, 30, 40] };

const make = (options: Partial<HexbinDeckLayerOptions> = {}) =>
    createHexbinDeckLayer({ cells, classification, colors: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], ...options });

const triggers = (options: Partial<HexbinDeckLayerOptions> = {}) =>
    (make(options).props as unknown as { updateTriggers: Record<string, string> }).updateTriggers;

describe('deck.gl updates', () => {
    it('keeps the same data array while the cells are the same object', () => {
        expect(make().props.data).toBe(make({ style: 'flat' }).props.data);
        expect(make().props.data).not.toBe(make({ cells: new Map(cells) }).props.data);
    });

    it('keeps the color trigger for equal colors and changes it with breaks, colors or selection', () => {
        const base = triggers().getFillColor;
        expect(triggers({ colors: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] }).getFillColor).toBe(base);
        expect(triggers({ classification: { breaks: [0, 20, 30, 40] } }).getFillColor).not.toBe(base);
        expect(triggers({ colors: [[2, 0, 0], [0, 1, 0], [0, 0, 1]] }).getFillColor).not.toBe(base);
        expect(triggers({ selected: 'x', selectedColor: [0, 0, 0] }).getFillColor).not.toBe(base);
    });

    it('changes the elevation and radius triggers with metric and scale', () => {
        expect(triggers().getElevation).not.toBe(triggers({ metric: 'count' }).getElevation);
        expect(triggers().getElevation).not.toBe(triggers({ maxElevation: 5 }).getElevation);
        expect(triggers({ style: 'dots' }).getRadius).not.toBe(triggers({ style: 'dots', maxRadius: 5 }).getRadius);
    });
});

describe('classCounts', () => {
    it('counts cells per class for a histogram', () => {
        expect(classCounts(cells, classification)).toEqual([2, 1, 1]);
        expect(classCounts([...cells.values()], { breaks: [0, 15] })).toEqual([2]);
        expect(classCounts(cells, null)).toEqual([]);
    });
});
