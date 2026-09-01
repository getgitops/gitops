import { defineConfig, devices } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import { E2E_BASE_URL } from './e2e/global-setup';

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [['list']],
  outputDir: path.join(os.tmpdir(), 'gitops-platform-e2e', 'test-results'),
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
