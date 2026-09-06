'use strict';

const { defineConfig } = require('@playwright/test');

const port = Number(process.env.STREAMZONE_E2E_PORT || 3107);
const baseURL = `http://127.0.0.1:${port}`;

module.exports = defineConfig({
    testDir: './e2e',
    timeout: 30_000,
    fullyParallel: false,
    workers: 1,
    reporter: 'line',
    outputDir: 'artifacts/playwright',
    use: {
        baseURL,
        browserName: 'chromium',
        trace: 'retain-on-failure'
    },
    webServer: {
        command: 'node e2e/server.js',
        url: `${baseURL}/login`,
        reuseExistingServer: false,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
            ...process.env,
            STREAMZONE_E2E_PORT: String(port)
        }
    },
    projects: [
        {
            name: 'desktop',
            use: { viewport: { width: 1440, height: 900 } }
        },
        {
            name: 'mobile',
            use: { viewport: { width: 390, height: 844 } }
        }
    ]
});
