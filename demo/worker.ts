let worker: Worker | null = null;

export const sharedWorker = (): Worker => {
    worker ??= new Worker(new URL('./hexbin.worker.ts', import.meta.url), { type: 'module' });
    return worker;
};
