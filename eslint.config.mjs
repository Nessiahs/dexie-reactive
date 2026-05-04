import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

export default tseslint.config(
    {
        ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            globals: {
                console: 'readonly',
            },
        },
    },
    {
        files: ['*.config.mjs', '.husky/*.mjs'],
        languageOptions: {
            globals: {
                process: 'readonly',
            },
        },
    },
    prettier,
)
