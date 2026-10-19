import type { Classification } from '../classify/types.js';
import type { HexbinSnapshot } from './layer.js';

export type HexbinEvent =
    | { type: 'select'; h3Index: string | null }
    | { type: 'resolution'; resolution: number }
    | { type: 'classification'; classification: Classification }
    | { type: 'status'; status: HexbinSnapshot['status']; error: Error | null };

const sameBreaks = (a: Classification | null, b: Classification | null): boolean =>
    a === b || (a !== null && b !== null && a.method === b.method && a.breaks.length === b.breaks.length
        && a.breaks.every((value, index) => value === b.breaks[index]));

export const watchEvents = (read: () => HexbinSnapshot, onEvent: (event: HexbinEvent) => void): (() => void) => {
    let previous = read();
    return () => {
        const next = read();
        const last = previous;
        previous = next;
        const selected = next.selection?.h3Index ?? null;
        if (selected !== (last.selection?.h3Index ?? null)) onEvent({ type: 'select', h3Index: selected });
        if (next.resolution !== null && next.resolution !== last.resolution) onEvent({ type: 'resolution', resolution: next.resolution });
        if (next.classification && !sameBreaks(next.classification, last.classification)) {
            onEvent({ type: 'classification', classification: next.classification });
        }
        if (next.status !== last.status || next.error !== last.error) onEvent({ type: 'status', status: next.status, error: next.error });
    };
};
