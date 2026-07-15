import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.resolve(process.cwd(), 'data', 'db');
const DB_PATH = path.join(DB_DIR, 'states.sqlite');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

try {
  db.exec('ALTER TABLE config ADD COLUMN encryption_key TEXT');
} catch {
  // Ignore if column already exists
}

const migrations = [
  'ALTER TABLE config ADD COLUMN public_access INTEGER DEFAULT 1',
  'ALTER TABLE config ADD COLUMN google_sso_enabled INTEGER DEFAULT 0',
  'ALTER TABLE config ADD COLUMN google_client_id TEXT',
  'ALTER TABLE config ADD COLUMN google_client_secret TEXT',
  "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'developer'",
];

for (const query of migrations) {
  try {
    db.exec(query);
  } catch {
    // Ignore if already applied
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    auth_method TEXT NOT NULL DEFAULT 'none',
    encryption_key TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS storage_backends (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    bucket TEXT NOT NULL,
    region TEXT,
    access_key_id TEXT,
    secret_access_key TEXT,
    endpoint TEXT,
    gcp_project_id TEXT,
    gcp_credentials TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS stacks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS states (
    id TEXT PRIMARY KEY,
    stack_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    checkpoint JSON NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (stack_id) REFERENCES stacks (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS history (
    id TEXT PRIMARY KEY,
    stack_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER,
    message TEXT,
    environment JSON,
    config JSON,
    result TEXT,
    resource_changes JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (stack_id) REFERENCES stacks (id) ON DELETE CASCADE
  );
`);
