import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      $lib: path.resolve(import.meta.dirname, 'src/lib'),
      $modules: path.resolve(import.meta.dirname, 'src/modules'),
      '$env/dynamic/private': path.resolve(import.meta.dirname, 'test/env-dynamic-private.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    globals: true,
  },
});
