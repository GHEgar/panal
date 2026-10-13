import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const folder = `${process.cwd()}/src/classify/`;

describe('classify isolation', () => {
    it('imports nothing outside its own folder', () => {
        const offenders = readdirSync(folder).flatMap((file) => {
            const source = readFileSync(`${folder}${file}`, 'utf8');
            return [...source.matchAll(/from\s+'([^']+)'/g)]
                .map(match => match[1] as string)
                .filter(specifier => !specifier.startsWith('./'))
                .map(specifier => `${file}: ${specifier}`);
        });
        expect(offenders).toEqual([]);
    });
});
