import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vitest/config';

// Vite only transforms hooks.server.ts lazily on the first request; warm it up eagerly in dev.
function warmupHooksPlugin(): Plugin {
  return {
    name: 'warmup-hooks-server',
    apply: 'serve',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        server.ssrLoadModule('/src/hooks.server.ts').catch((error) => {
          console.error('[warmup] failed to preload hooks.server.ts', error);
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), sveltekit(), warmupHooksPlugin()],
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
  },
});
