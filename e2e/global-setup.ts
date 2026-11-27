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
export const E2E_MONITORING_WORKER_TOKEN = 'e2e-monitoring-worker-token';
/** Local S3-compatible endpoint serving the State IaC fixtures (`fixtures/fake-s3.ts`). */
export const E2E_S3_PORT = 5391;
export const E2E_S3_ENDPOINT = `http://127.0.0.1:${E2E_S3_PORT}`;

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
  git([
    '-c',
    'user.email=e2e@gitops.local',
    '-c',
    'user.name=e2e',
    'commit',
    '--allow-empty',
    '-m',
    'init',
  ]);
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
    // the suite assumes the CVE feed is off, whatever the developer's `.env` says
    CVE_FEED_ENABLED: 'false',
    // never reach a real SMTP from a developer's `.env`: the suite runs with email disabled
    NOTIFICATION_SMTP_HOST: '',
    NOTIFICATION_SMTP_PORT: '',
    NOTIFICATION_SMTP_SECURE: '',
    NOTIFICATION_SMTP_USER: '',
    NOTIFICATION_SMTP_PASSWORD: '',
    NOTIFICATION_SMTP_FROM: '',
    NOTIFICATION_SMTP_FROM_NAME: '',
    NOTIFICATION_SMTP_REJECT_UNAUTHORIZED: '',
    // monitoring: metrics in the throwaway main repository, checks may reach the local test
    // target the monitoring spec starts, and the internal worker API is enabled
    MONITORING_GITDB_REPOSITORY_URL: '',
    MONITORING_WORKER_TOKEN: E2E_MONITORING_WORKER_TOKEN,
    MONITORING_INTERNAL_HOSTS: '',
    MONITORING_EMBEDDED_WORKER: 'true',
    MONITORING_ALLOW_PRIVATE_TARGETS: 'true',
    // webhook channels are created with a URL nobody resolves; no delivery is attempted
    NOTIFICATIONS_WEBHOOK_ALLOW_PRIVATE_TARGETS: 'true',
    // "Add to Slack" configured (so Slack channels can be created), `/gitops` not: the Slack
    // integration shows as disabled. Nothing ever reaches Slack
    SLACK_CLIENT_ID: 'e2e-slack-client',
    SLACK_CLIENT_SECRET: 'e2e-slack-secret',
    SLACK_SIGNING_SECRET: '',
    // State IaC reads the fake S3 bucket with "ambient" auth: dummy static credentials
    AWS_ACCESS_KEY_ID: 'e2e',
    AWS_SECRET_ACCESS_KEY: 'e2e',
    AWS_EC2_METADATA_DISABLED: 'true',
    PORT: String(E2E_PORT),
  };
}

async function waitForServer(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      // /health only answers 200 once startup (GitDB clone, auth, bootstrap detection) has
      // finished; until then every page gets the 503 "GitOps is starting" landing
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
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

  // clone the throwaway remote here: without it the seed writes JSON into a directory that has
  // no `.git`, and the dev server later fails to clone into that non-empty path
  const { startGitDb } = await import('../src/lib/server/gitdb');
  await startGitDb();

  const { startFakeS3 } = await import('./fixtures/fake-s3');
  const fakeS3 = await startFakeS3(
    path.join(ROOT, 'test/fixtures/state-iac/project-layout'),
    E2E_S3_PORT,
  );

  const { seedAll } = await import('./fixtures/seed');
  const seedOutput = await seedAll();
  writeFileSync(SEED_OUTPUT_PATH, JSON.stringify(seedOutput, null, 2));

  // `bun run build` currently fails in this repo independent of e2e/RBAC work (a Tailwind/
  // postcss resolution error under Vite 8 — pre-existing, out of scope here), so `vite preview`
  // isn't usable; run the dev server instead. Dev-mode SSR has a separate, pre-existing
  // Paraglide initialization race on a truly cold server (runtime hasn't initialized before the first
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

  await waitForServer(`${E2E_BASE_URL}/health`, 120_000);
  if (serverExited) {
    throw new Error('Dev server exited before becoming ready');
  }

  // absorb the cold-start Paraglide race (see comment above) so real test navigations don't
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
    fakeS3.close();
  };
}
