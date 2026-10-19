import { describe, expect, it } from 'vitest';
import type { Arbiter } from '../../../urdimbre/src/arbiter/index.js';
import type { CqlComposer } from '../../../urdimbre/src/cql/composer.js';
import type { LegendEntry } from '../../../urdimbre/src/legend/types.js';
import type { ClassesLegendEntry } from '../../src/classify/index.js';
import type { ClickArbiter, FragmentSink } from '../../src/ol/index.js';

const composerFits = (composer: CqlComposer): FragmentSink => composer;
const arbiterFits = (arbiter: Arbiter): ClickArbiter => arbiter;
const legendFits = (entry: ClassesLegendEntry): LegendEntry => entry;

describe('urdimbre fit', () => {
    it('accepts urdimbre objects where panal takes structural ones', () => {
        expect([composerFits, arbiterFits, legendFits].every(fit => typeof fit === 'function')).toBe(true);
    });
});
