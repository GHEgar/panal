import type { MessagePort, WorkerRequest, WorkerResponse } from './protocol.js';

type Body<T> = T extends { id: string } ? Omit<T, 'id'> : never;

export interface Channel {
    request: <R>(body: Body<WorkerRequest>, transfer?: Transferable[], options?: RequestOptions) => Promise<R>;
    close: () => void;
}

export interface RequestOptions {
    signal?: AbortSignal | undefined;
    onProgress?: ((progress: number) => void) | undefined;
}

interface Pending {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    onProgress: ((progress: number) => void) | undefined;
}

const abortError = () => new DOMException('aborted', 'AbortError');

export const openChannel = (port: MessagePort): Channel => {
    const name = Math.random().toString(36).slice(2);
    const pending = new Map<string, Pending>();
    let next = 1;
    let closed = false;

    const onMessage = (event: MessageEvent) => {
        const response = event.data as WorkerResponse;
        const entry = pending.get(response.id);
        if (!entry) return;
        if ('progress' in response) {
            entry.onProgress?.(response.progress);
            return;
        }
        pending.delete(response.id);
        if (response.ok) entry.resolve(response.result);
        else entry.reject(new Error(response.error));
    };
    port.addEventListener('message', onMessage);

    return {
        request: <R>(body: Body<WorkerRequest>, transfer: Transferable[] = [], options: RequestOptions = {}) => {
            if (closed) return Promise.reject(new Error('aggregation worker is terminated'));
            if (options.signal?.aborted) return Promise.reject(abortError());
            const id = `${name}:${next}`;
            next += 1;
            return new Promise<R>((resolve, reject) => {
                pending.set(id, { resolve: resolve as (value: unknown) => void, reject, onProgress: options.onProgress });
                options.signal?.addEventListener('abort', () => {
                    if (!pending.delete(id)) return;
                    port.postMessage({ type: 'cancel', id: `${name}:cancel:${id}`, target: id }, []);
                    reject(abortError());
                }, { once: true });
                port.postMessage({ ...body, id }, transfer);
            });
        },
        close: () => {
            closed = true;
            port.removeEventListener('message', onMessage);
            pending.forEach(entry => entry.reject(new Error('aggregation worker is terminated')));
            pending.clear();
        },
    };
};
