import type { PackedCells, PackedInput } from '../core/packed.js';

export interface AggregateRequest {
    id: number;
    input: PackedInput;
    resolution: number;
}

export type AggregateResponse =
    | { id: number; ok: true; cells: PackedCells }
    | { id: number; ok: false; error: string };

export interface MessagePort {
    postMessage(message: unknown, transfer: Transferable[]): void;
    addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
    removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
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
