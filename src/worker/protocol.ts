import type { PackedCells, PackedInput } from '../core/packed.js';
import type { WfsRequestOptions } from '../core/wfs.js';

export interface WorkerMember {
    id: string | number | null;
    properties: Record<string, unknown>;
    lonLat: [number, number][];
}

export type WorkerRequest =
    | { type: 'aggregate'; id: string; input: PackedInput; resolution: number }
    | { type: 'wfs-load'; id: string; sourceId: string; options: WfsRequestOptions }
    | { type: 'source-aggregate'; id: string; sourceId: string; resolution: number; value: string | null }
    | { type: 'source-members'; id: string; sourceId: string; resolution: number; h3Index: string }
    | { type: 'source-release'; id: string; sourceId: string }
    | { type: 'cancel'; id: string; target: string };

export type WorkerResponse =
    | { id: string; ok: true; result: unknown }
    | { id: string; ok: false; error: string }
    | { id: string; progress: number };

export interface MessagePort {
    postMessage(message: unknown, transfer: Transferable[]): void;
    addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
    removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
}

export interface WfsLoadResult {
    loaded: number;
    truncated: boolean;
}

export const inputTransfer = (input: PackedInput): Transferable[] =>
    [input.lonLat.buffer, input.owner.buffer, input.values.buffer] as Transferable[];

export const cellsTransfer = (cells: PackedCells): Transferable[] => [
    cells.count.buffer,
    cells.valueCount.buffer,
    cells.sum.buffer,
    cells.min.buffer,
    cells.max.buffer,
    cells.memberOffsets.buffer,
    cells.memberIds.buffer,
] as Transferable[];
