import { paraglideVitePlugin } from '@inlang/paraglide-js';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import { loadEnv } from 'vite';
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

// Local https for flows whose provider only accepts https redirect URLs (Add to Slack). Opt-in with
// DEV_HTTPS=true and a certificate in .certs/ (see .env.example); off for everyone else and for e2e.
function devHttps(mode: string) {
  const env = loadEnv(mode, process.cwd(), '');
  if (env.DEV_HTTPS !== 'true') return undefined;
  const key = env.DEV_HTTPS_KEY || '.certs/localhost-key.pem';
  const cert = env.DEV_HTTPS_CERT || '.certs/localhost.pem';
  if (!fs.existsSync(key) || !fs.existsSync(cert)) {
    throw new Error(`DEV_HTTPS=true but ${key} / ${cert} are missing (see .env.example)`);
  }
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

export default defineConfig(({ mode }) => ({
  server: { https: devHttps(mode) },
  plugins: [
    tailwindcss(),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/lib/paraglide',
      emitTsDeclarations: true,
    }),
    sveltekit({
      adapter: adapter(),
      preprocess: vitePreprocess(),
      // the CSRF origin check runs in hooks.server.ts (`csrfGuard`), with the same rule, so the
      // Slack endpoints (signed requests without an Origin header) can be exempt
      csrf: { trustedOrigins: ['*'] },
    }),
    warmupHooksPlugin(),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
  },
}));
