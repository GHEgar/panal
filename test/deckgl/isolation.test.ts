import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const importsOf = (folder: string): string[] => readdirSync(`${process.cwd()}/src/${folder}/`).flatMap(file =>
    [...readFileSync(`${process.cwd()}/src/${folder}/${file}`, 'utf8').matchAll(/from\s+'([^']+)'/g)].map(match => match[1] as string));

describe('deck.gl isolation', () => {
    it('stays out of core, classify, ol, worker and react', () => {
        const offenders = ['core', 'classify', 'ol', 'worker', 'react']
            .flatMap(importsOf)
            .filter(specifier => specifier.startsWith('@deck.gl') || specifier.includes('deckgl'));
        expect(offenders).toEqual([]);
    });
});
