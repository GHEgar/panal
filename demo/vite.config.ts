import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const src = (path: string): string => fileURLToPath(new URL(`../src/${path}`, import.meta.url));

export default defineConfig({
    root: fileURLToPath(new URL('.', import.meta.url)),
    base: './',
    resolve: {
        alias: [
            { find: /^@npmegar\/panal\/worker\/runtime$/, replacement: src('worker/runtime-index.ts') },
            { find: /^@npmegar\/panal\/worker$/, replacement: src('worker/index.ts') },
            { find: /^@npmegar\/panal\/classify$/, replacement: src('classify/index.ts') },
            { find: /^@npmegar\/panal\/deckgl$/, replacement: src('deckgl/index.ts') },
            { find: /^@npmegar\/panal\/ol$/, replacement: src('ol/index.ts') },
            { find: /^@npmegar\/panal$/, replacement: src('core/index.ts') },
        ],
    },
    build: {
        outDir: fileURLToPath(new URL('../demo-dist', import.meta.url)),
        emptyOutDir: true,
        rolldownOptions: {
            input: {
                main: fileURLToPath(new URL('index.html', import.meta.url)),
                deck: fileURLToPath(new URL('deck.html', import.meta.url)),
            },
        },
    },
});
