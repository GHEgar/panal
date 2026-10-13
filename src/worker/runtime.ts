import { aggregatePacked } from '../core/packed.js';
import type { PackedCells } from '../core/packed.js';
import { cellsTransfer } from './protocol.js';
import type { MessagePort, WorkerRequest, WorkerResponse } from './protocol.js';
import { createSourceStore } from './source-store.js';

export interface WorkerRuntimeOptions {
    fetch?: typeof fetch;
}

const isPacked = (value: unknown): value is PackedCells =>
    typeof value === 'object' && value !== null && 'memberOffsets' in value;

export const installAggregationWorker = (scope: MessagePort, options: WorkerRuntimeOptions = {}): (() => void) => {
    const store = createSourceStore(options.fetch ?? ((input, init) => fetch(input, init)));
    const controllers = new Map<string, AbortController>();

    const copy = (cells: PackedCells): PackedCells => ({
        h3: cells.h3,
        count: cells.count.slice(),
        valueCount: cells.valueCount.slice(),
        sum: cells.sum.slice(),
        min: cells.min.slice(),
        max: cells.max.slice(),
        memberOffsets: cells.memberOffsets.slice(),
        memberIds: cells.memberIds.slice(),
    });

    const reply = (request: WorkerRequest, result: unknown) => {
        if (!isPacked(result)) {
            scope.postMessage({ id: request.id, ok: true, result } satisfies WorkerResponse, []);
            return;
        }
        const cells = request.type === 'source-aggregate' ? copy(result) : result;
        scope.postMessage({ id: request.id, ok: true, result: cells } satisfies WorkerResponse, cellsTransfer(cells));
    };

    const handle = async (request: WorkerRequest): Promise<unknown> => {
        switch (request.type) {
            case 'aggregate':
                return aggregatePacked(request.input, request.resolution);
            case 'wfs-load': {
                const controller = new AbortController();
                controllers.set(request.id, controller);
                try {
                    return await store.load(request.sourceId, request.options, controller.signal, (loaded) => {
                        scope.postMessage({ id: request.id, progress: loaded }, []);
                    });
                } finally {
                    controllers.delete(request.id);
                }
            }
            case 'source-aggregate':
                return store.aggregate(request.sourceId, request.resolution, request.value);
            case 'source-members':
                return store.members(request.sourceId, request.resolution, request.h3Index);
            case 'source-release':
                return store.release(request.sourceId);
            case 'cancel':
                controllers.get(request.target)?.abort();
                return null;
        }
    };

    const listener = (event: MessageEvent) => {
        const request = event.data as WorkerRequest;
        handle(request).then((result) => {
            if (request.type !== 'cancel') reply(request, result);
        }, (error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            scope.postMessage({ id: request.id, ok: false, error: message } satisfies WorkerResponse, []);
        });
    };
    scope.addEventListener('message', listener);
    return () => scope.removeEventListener('message', listener);
};
