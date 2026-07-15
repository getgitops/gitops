import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { rm } from 'node:fs/promises';
import { createGitDB } from './dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '.tmp-gitdb-demo');

async function run() {
  await rm(dbPath, { recursive: true, force: true });

  const db = await createGitDB({
    repositoryPath: dbPath,
    immediateCommitDelayMs: 150,
    autoCommitIntervalMs: 60_000,
  });

  try {
    const users = db.model('users');

    const inserted = await users.insert({ username: 'fox', role: 'admin' });
    await users.insertMany([
      { username: 'ana', role: 'developer' },
      { username: 'luis', role: 'developer' },
    ]);

    const all = await users.select().all();
    const admin = await users.findBy({ role: 'admin' });
    const byId = await users.findById(inserted.id);
    const devs = await users.where({ role: 'developer' }).all();

    console.log('All users:', all);
    console.log('Admin:', admin);
    console.log('By id:', byId);
    console.log('Developers:', devs);

    await db.commitNow('manual-demo-commit');
    console.log(`GitDB demo listo en: ${dbPath}`);
  } finally {
    await db.close();
  }
}

run().catch((error) => {
  console.error('Error en demo gitdb:', error);
  process.exitCode = 1;
});
