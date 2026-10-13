import { aggregatePacked } from '../core/packed.js';
import { cellsTransfer } from './protocol.js';
import type { AggregateRequest, AggregateResponse, MessagePort } from './protocol.js';

export const installAggregationWorker = (scope: MessagePort): (() => void) => {
    const listener = (event: MessageEvent) => {
        const request = event.data as AggregateRequest;
        let response: AggregateResponse;
        try {
            const cells = aggregatePacked(request.input, request.resolution);
            response = { id: request.id, ok: true, cells };
            scope.postMessage(response, cellsTransfer(cells));
        } catch (error) {
            response = { id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) };
            scope.postMessage(response, []);
        }
    };
    scope.addEventListener('message', listener);
    return () => scope.removeEventListener('message', listener);
};
