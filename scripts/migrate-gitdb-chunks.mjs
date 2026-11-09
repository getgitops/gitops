import { execFile } from 'node:child_process';
import console from 'node:console';
import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';
import { promisify } from 'node:util';
import { gitDb } from '@getgitops/gitdb';

const execFileAsync = promisify(execFile);
const CHUNK_SIZE_BYTES = 20 * 1024 * 1024;
const MANIFEST_KIND = 'gitdb-chunks';

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function git(dataPath, args) {
  return execFileAsync('git', args, { cwd: dataPath });
}

async function assertSafeWorkingTree(dataPath, repositoryUrl) {
  if (!existsSync(path.join(dataPath, '.git'))) {
    throw new Error(`GITDB_DATA_PATH is not an existing Git clone: ${dataPath}`);
  }

  const [{ stdout: status }, { stdout: origin }] = await Promise.all([
    git(dataPath, ['status', '--porcelain']),
    git(dataPath, ['remote', 'get-url', 'origin']),
  ]);
  if (status.trim()) {
    throw new Error(`GitDB working tree is not clean: ${dataPath}`);
  }

  if (normalizeRemote(origin) !== normalizeRemote(repositoryUrl)) {
    throw new Error(`GitDB origin does not match GITDB_REPOSITORY_URL: ${origin.trim()}`);
  }
}

function normalizeRemote(remote) {
  try {
    const url = new URL(remote.trim());
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return remote.trim();
  }
}

async function inspectTables(dataPath) {
  const tables = new Map();
  const unchunkedLargeTables = [];

  for (const entry of await readdir(dataPath, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name === 'gitdb.manifest.json') continue;

    const filePath = path.join(dataPath, entry.name);
    const fileSize = (await stat(filePath)).size;
    const parsed = JSON.parse(await readFile(filePath, 'utf8'));
    const tableName = entry.name.slice(0, -'.json'.length);

    if (Array.isArray(parsed)) {
      if (fileSize > CHUNK_SIZE_BYTES) unchunkedLargeTables.push(tableName);
      continue;
    }

    if (parsed?.kind === MANIFEST_KIND && parsed.version === 1 && Array.isArray(parsed.chunks)) {
      tables.set(tableName, { directory: parsed.directory, chunks: parsed.chunks });
    }
  }

  return { tables, unchunkedLargeTables };
}

function resolveAuth() {
  const username = process.env.GITDB_USERNAME?.trim();
  const password = process.env.GITDB_PASSWORD?.trim();
  const token = process.env.GITDB_TOKEN?.trim()
    || process.env.GITDB_GITHUB_TOKEN?.trim()
    || process.env.GITHUB_TOKEN?.trim()
    || (username && password ? password : '');

  return {
    authToken: token,
    authUsername: username || 'x-access-token',
  };
}

async function main() {
  const repositoryUrl = requiredEnv('GITDB_REPOSITORY_URL');
  const dataPath = path.resolve(requiredEnv('GITDB_DATA_PATH'));
  await assertSafeWorkingTree(dataPath, repositoryUrl);

  const before = await inspectTables(dataPath);
  const auth = resolveAuth();
  const db = gitDb(repositoryUrl, {
    dataPath,
    ...auth,
    gitUserName: process.env.GITDB_AUTHOR_NAME || 'gitops',
    gitUserEmail: process.env.GITDB_AUTHOR_EMAIL || 'gitops@getgitops.local',
    autoCommitIntervalMs: 3_600_000,
    immediateCommitDelayMs: 100,
    syncPollSeconds: 0,
    syncMode: 'poll',
  });

  let ready = false;
  try {
    await db.ready();
    ready = true;

    const after = await inspectTables(dataPath);
    if (after.unchunkedLargeTables.length) {
      throw new Error(`Large tables were not chunked: ${after.unchunkedLargeTables.join(', ')}`);
    }

    const migrated = [...after.tables]
      .filter(([name, table]) => before.tables.get(name)?.directory !== table.directory)
      .map(([name, table]) => `${name} (${table.chunks.length} chunks)`);
    if (migrated.length) {
      console.log(`Tables converted to chunks: ${migrated.join(', ')}`);
    } else {
      console.log('No large tables needed chunk migration.');
    }

    try {
      await db.close();
    } finally {
      ready = false;
    }

    const [pending, synced] = await Promise.all([db.getPendingCommits(), db.isSynced()]);
    if (pending !== 0 || !synced) {
      throw new Error(`GitDB is not synchronized after push (${pending} pending commits)`);
    }

    const { stdout: commit } = await git(dataPath, ['rev-parse', '--short', 'HEAD']);
    console.log(`Commit ${commit.trim()} is on the remote; no pending changes or commits remain.`);
  } finally {
    if (ready) await db.close();
  }
}

main().catch((error) => {
  console.error(`GitDB chunk migration failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});