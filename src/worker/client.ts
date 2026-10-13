import { packInputs, unpackCells } from '../core/packed.js';
import type { PackedCells } from '../core/packed.js';
import type { AggregateInput, AggregateOptions, Aggregator, Cell } from '../core/types.js';
import { openChannel } from './channel.js';
import { inputTransfer } from './protocol.js';
import type { MessagePort } from './protocol.js';

export interface WorkerLike extends MessagePort {
    terminate?(): void;
}

export interface AggregationWorker {
    aggregate: Aggregator;
    terminate: () => void;
}

export const createAggregationWorker = (worker: WorkerLike): AggregationWorker => {
    const channel = openChannel(worker);

    const aggregate = async <M>(
        inputs: readonly AggregateInput<M>[],
        options: AggregateOptions<M>,
    ): Promise<Map<string, Cell<M>>> => {
        const { input, members } = packInputs(inputs);
        const values = input.values.slice();
        const cells = await channel.request<PackedCells>(
            { type: 'aggregate', input, resolution: options.resolution },
            inputTransfer(input),
        );
        return unpackCells(cells, members, values, options.reducer ?? 'count');
    };

    return {
        aggregate,
        terminate: () => {
            channel.close();
            worker.terminate?.();
        },
    };
};
