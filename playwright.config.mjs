import { defineConfig } from '@playwright/test'

export default defineConfig({
    testDir: './tests/browser',
    testMatch: '**/*.spec.ts',
    fullyParallel: false,
    workers: 1,
    use: {
        baseURL: 'http://127.0.0.1:4173',
        browserName: 'chromium',
        trace: 'retain-on-failure',
    },
    webServer: {
        command: 'npm run test:browser:server',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
    },
})
