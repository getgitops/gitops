import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      $lib: path.resolve(import.meta.dirname, 'src/lib'),
      $modules: path.resolve(import.meta.dirname, 'src/modules'),
      '$app/env/private': path.resolve(import.meta.dirname, 'test/env-private.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    globals: true,
    setupFiles: ['test/env-private.ts'],
  },
});
