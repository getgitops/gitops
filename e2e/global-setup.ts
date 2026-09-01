// Owns the whole E2E lifecycle so there's no ambiguity around Playwright's webServer-vs-
// globalSetup ordering: creates a throwaway local GitDB "remote", seeds it directly (in this
// process) with every persona the RBAC matrix needs, then spawns the dev server pointed at the
// already-cloned data path and waits for it to be ready. Never touches the real dev GitDB
// (gitops-db-local / dev/liam) configured in the project's own .env.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const E2E_PORT = 5390;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
export const E2E_ENCRYPTION_KEY = 'e2e-test-encryption-key-do-not-use-in-prod';

const ROOT = path.resolve(__dirname, '..');
// deliberately OUTSIDE the repo (not e2e/.tmp): a throwaway git repo nested inside this repo's
// working tree is one race away from disaster — if GitDB's own git commands ever run before its
// `.git` finishes initializing, git walks up looking for a repo and silently commits into THIS
// project's history instead (which happened once while building this suite — see git log if
// curious, it was cleaned up with `git reset --soft`). Living under the OS temp dir means that
// walk-up has nothing to find.
const TMP_DIR = path.join(os.tmpdir(), 'gitops-platform-e2e');
const REMOTE_DIR = path.join(TMP_DIR, 'gitdb-remote');
const DATA_PATH = path.join(TMP_DIR, 'gitdb-data');
export const SEED_OUTPUT_PATH = path.join(TMP_DIR, 'seed-output.json');

function initThrowawayRemote() {
  rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(REMOTE_DIR, { recursive: true });

  const git = (args: string[]) => execFileSync('git', args, { cwd: REMOTE_DIR, stdio: 'ignore' });
  git(['init', '-b', 'main']);
  git(['-c', 'user.email=e2e@gitops.local', '-c', 'user.name=e2e', 'commit', '--allow-empty', '-m', 'init']);
}

function buildEnv(): Record<string, string | undefined> {
  return {
    ...process.env,
    GITDB_REPOSITORY_URL: REMOTE_DIR,
    GITDB_BRANCH: 'main',
    GITDB_DATA_PATH: DATA_PATH,
    GITDB_ENCRYPTION_KEY: E2E_ENCRYPTION_KEY,
    GITDB_AUTHOR_NAME: 'e2e',
    GITDB_AUTHOR_EMAIL: 'e2e@gitops.local',
    GITDB_SYNC_POLL_SECONDS: '86400',
    GITDB_USERNAME: '',
    GITDB_TOKEN: '',
    GITDB_PASSWORD: '',
    PORT: String(E2E_PORT),
  };
}

async function waitForServer(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      // any HTTP response (even a redirect to /bootstrap or /maintenance) means the process
      // is up; we only need "port is listening and hooks.server.ts responded".
      if (response.status > 0) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Dev server did not become ready at ${url}: ${String(lastError)}`);
}

export default async function globalSetup() {
  initThrowawayRemote();

  const env = buildEnv();
  Object.assign(process.env, env);

  const { seedAll } = await import('./fixtures/seed');
  const seedOutput = await seedAll();
  writeFileSync(SEED_OUTPUT_PATH, JSON.stringify(seedOutput, null, 2));

  // `bun run build` currently fails in this repo independent of e2e/RBAC work (a Tailwind/
  // postcss resolution error under Vite 8 — pre-existing, out of scope here), so `vite preview`
  // isn't usable; run the dev server instead. Dev-mode SSR has a separate, pre-existing
  // svelte-i18n race on a truly cold server (locale loader hasn't resolved before the first
  // synchronous SSR render) — worked around below with a couple of throwaway warm-up requests
  // before tests start, rather than touching app code for an unrelated bug.
  const server: ChildProcess = spawn(
    'bun',
    ['run', 'dev', '--', '--port', String(E2E_PORT), '--strictPort'],
    {
      cwd: ROOT,
      env,
      stdio: 'inherit',
    },
  );

  let serverExited = false;
  server.on('exit', () => {
    serverExited = true;
  });

  await waitForServer(`${E2E_BASE_URL}/auth/login`, 60_000);
  if (serverExited) {
    throw new Error('Dev server exited before becoming ready');
  }

  // absorb the cold-start svelte-i18n race (see comment above) so real test navigations don't
  // hit it: a couple of real page loads, spaced out, until one actually returns 200.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await fetch(`${E2E_BASE_URL}/auth/login`);
    console.log(`[e2e warmup] attempt ${attempt} -> ${response.status}`);
    if (response.status === 200) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return async () => {
    if (!server.killed) {
      server.kill();
    }
  };
}
