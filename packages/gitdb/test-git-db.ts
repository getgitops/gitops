
import { GitDbLogger, gitDb } from './dist/index.js';
import { users } from './test-schema.ts';

const logger = new GitDbLogger(console);
const db = gitDb(process.env.REPO_DB_URL ?? "git@github.com:kettu-studio/gitvault-db-dev.git");
const query = db.select().from(users);

console.log('gitDb initialized:', Boolean(db));
console.log('query initialized:', Boolean(query));
