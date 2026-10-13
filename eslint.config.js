import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['dist', 'demo-dist', 'node_modules'] },
    js.configs.recommended,
    ...tseslint.configs.strict,
    {
        files: ['**/*.ts'],
        rules: {
            indent: ['error', 4, { SwitchCase: 1 }],
            quotes: ['error', 'single', { avoidEscape: true }],
            semi: ['error', 'always'],
            'max-lines': ['error', { max: 300, skipBlankLines: true }],
        },
    },
);
