import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html', 'lcov'],
            reportsDirectory: './coverage',
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.d.ts'],
        },
        include: ['tests/*.{test,spec}.{ts,tsx,js,mjs,cjs}'],
    },
})
