import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: 'e2e',
    use: {
        baseURL: 'http://127.0.0.1:5193',
        viewport: { width: 1200, height: 800 },
    },
    webServer: {
        command: 'npx vite --config demo/vite.config.ts --host 127.0.0.1 --port 5193 --strictPort',
        url: 'http://127.0.0.1:5193',
        reuseExistingServer: true,
    },
});
