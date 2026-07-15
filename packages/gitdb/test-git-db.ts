
import { GitDbLogger, gitDb } from './dist/index.js';
import { users } from './test-schema.ts';

const logger = new GitDbLogger(console);
const db = gitDb(process.env.REPO_DB_URL ?? "git@github.com:kettu-studio/gitvault-db-dev.git");
const result = await db.select().from(users).where({ id: 1 }).orderBy('name', 'asc').limit(10).offset(0);

console.log('gitDb initialized:', Boolean(db));
console.log('select result rows:', result.rows.length);
