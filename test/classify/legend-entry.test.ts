import { describe, expect, it } from 'vitest';
import { classify, legend, legendEntry } from '../../src/classify/index.js';

describe('legendEntry', () => {
    it('builds a classes entry from the breaks, colors and counts', () => {
        const classification = classify([1, 2, 3, 4, 5, 6], { method: 'equalInterval', classes: 2 });
        const counts = legend(classification, [1, 2, 3, 4, 5, 6]).map(entry => entry.count);
        expect(legendEntry('hex', 'Points', classification, ['#111', '#222'], counts)).toEqual({
            kind: 'classes',
            layerId: 'hex',
            title: 'Points',
            classes: [
                { label: '1 – 3.5', color: '#111', min: 1, max: 3.5, count: 3 },
                { label: '3.5 – 6', color: '#222', min: 3.5, max: 6, count: 3 },
            ],
        });
    });

    it('leaves count out without counts and accepts a format', () => {
        const entry = legendEntry('hex', 'Points', { breaks: [0, 1000] }, ['#111'], undefined, { format: value => `${value / 1000}k` });
        expect(entry.classes).toEqual([{ label: '0k – 1k', color: '#111', min: 0, max: 1000 }]);
    });

    it('throws when a class has no color', () => {
        expect(() => legendEntry('hex', 'Points', { breaks: [0, 1, 2] }, ['#111'])).toThrow(RangeError);
    });
});
