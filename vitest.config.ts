import path from 'path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // compiles `.svelte` files so components can be rendered in tests (`svelte/server`)
  plugins: [svelte({ configFile: false })],
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
