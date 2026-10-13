import type { MessagePort } from '../../src/worker/protocol.js';

type Listener = (event: MessageEvent) => void;

const endpoint = (deliver: (message: unknown) => void, listeners: Set<Listener>): MessagePort => ({
    postMessage: (message) => deliver(message),
    addEventListener: (_, listener) => {
        listeners.add(listener);
    },
    removeEventListener: (_, listener) => {
        listeners.delete(listener);
    },
});

export const createPortPair = (): { main: MessagePort & { terminate: () => void; terminated: boolean }; scope: MessagePort } => {
    const mainListeners = new Set<Listener>();
    const scopeListeners = new Set<Listener>();
    const send = (listeners: Set<Listener>) => (message: unknown) => {
        const data: unknown = structuredClone(message);
        queueMicrotask(() => listeners.forEach(listener => listener({ data } as MessageEvent)));
    };
    const main = {
        ...endpoint(send(scopeListeners), mainListeners),
        terminated: false,
        terminate: () => {
            main.terminated = true;
        },
    };
    return { main, scope: endpoint(send(mainListeners), scopeListeners) };
};
