import { packInputs, unpackCells } from '../core/packed.js';
import type { AggregateInput, AggregateOptions, Aggregator, Cell } from '../core/types.js';
import { inputTransfer } from './protocol.js';
import type { AggregateResponse, MessagePort } from './protocol.js';

export interface WorkerLike extends MessagePort {
    terminate?(): void;
}

export interface AggregationWorker {
    aggregate: Aggregator;
    terminate: () => void;
}

interface Pending {
    resolve: (response: AggregateResponse) => void;
    reject: (error: Error) => void;
}

export const createAggregationWorker = (worker: WorkerLike): AggregationWorker => {
    const pending = new Map<number, Pending>();
    let nextId = 1;
    let closed = false;

    const onMessage = (event: MessageEvent) => {
        const response = event.data as AggregateResponse;
        const entry = pending.get(response.id);
        if (!entry) return;
        pending.delete(response.id);
        entry.resolve(response);
    };
    worker.addEventListener('message', onMessage);

    const aggregate = async <M>(
        inputs: readonly AggregateInput<M>[],
        options: AggregateOptions<M>,
    ): Promise<Map<string, Cell<M>>> => {
        if (closed) throw new Error('aggregation worker is terminated');
        const { input, members } = packInputs(inputs);
        const values = input.values.slice();
        const id = nextId;
        nextId += 1;
        const response = await new Promise<AggregateResponse>((resolve, reject) => {
            pending.set(id, { resolve, reject });
            worker.postMessage({ id, input, resolution: options.resolution }, inputTransfer(input));
        });
        if (!response.ok) throw new Error(response.error);
        return unpackCells(response.cells, members, values, options.reducer ?? 'count');
    };

    return {
        aggregate,
        terminate: () => {
            closed = true;
            worker.removeEventListener('message', onMessage);
            worker.terminate?.();
            pending.forEach(entry => entry.reject(new Error('aggregation worker is terminated')));
            pending.clear();
        },
    };
};
