import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classify } from '../../src/classify/index.js';
import type { ClassifyOptions } from '../../src/classify/index.js';

interface Vector {
    name: string;
    values: (number | string | null)[];
    options: ClassifyOptions;
    expected: { breaks: number[]; requested: number; actual: number };
    tolerance: number;
}

const folder = `${process.cwd()}/test/fixtures/classify/`;
const vectors: Vector[] = readdirSync(folder)
    .filter(file => file.endsWith('.json'))
    .map(file => JSON.parse(readFileSync(`${folder}${file}`, 'utf8')) as Vector);

const toNumber = (value: number | string | null): number | null =>
    typeof value === 'string' ? Number(value) : value;

describe('classify vectors', () => {
    it('has vectors to check', () => {
        expect(vectors.length).toBeGreaterThan(10);
    });

    it.each(vectors.map(vector => [vector.name, vector] as const))('%s', (_, vector) => {
        const result = classify(vector.values.map(toNumber), vector.options);
        expect(result.requested).toBe(vector.expected.requested);
        expect(result.actual).toBe(vector.expected.actual);
        expect(result.breaks).toHaveLength(vector.expected.breaks.length);
        result.breaks.forEach((value, index) => {
            const expected = vector.expected.breaks[index] as number;
            expect(Math.abs(value - expected)).toBeLessThanOrEqual(vector.tolerance * Math.max(1, Math.abs(expected)));
        });
    });
});
