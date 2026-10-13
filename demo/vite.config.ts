import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const src = (path: string): string => fileURLToPath(new URL(`../src/${path}`, import.meta.url));

export default defineConfig({
    root: fileURLToPath(new URL('.', import.meta.url)),
    base: './',
    resolve: {
        alias: [
            { find: /^@ghegar\/panal\/classify$/, replacement: src('classify/index.ts') },
            { find: /^@ghegar\/panal\/ol$/, replacement: src('ol/index.ts') },
            { find: /^@ghegar\/panal$/, replacement: src('core/index.ts') },
        ],
    },
    build: {
        outDir: fileURLToPath(new URL('../demo-dist', import.meta.url)),
        emptyOutDir: true,
    },
});
