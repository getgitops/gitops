// Stand-in for SvelteKit's `$app/env/private` when app modules are imported outside Vite (the
// Playwright global setup seeds GitDB in-process). Vitest has its own mock in test/env-private.ts.
// Values are read when this module is first imported, which global-setup.ts does only after it
// has written the throwaway E2E configuration into process.env.
// Keep the list in sync with the variables declared in src/env.ts.
export const GITDB_REPOSITORY_URL = process.env.GITDB_REPOSITORY_URL;
export const GITDB_BRANCH = process.env.GITDB_BRANCH;
export const GITDB_TOKEN = process.env.GITDB_TOKEN;
export const GITDB_USERNAME = process.env.GITDB_USERNAME;
export const GITDB_PASSWORD = process.env.GITDB_PASSWORD;
export const GITDB_AUTHOR_NAME = process.env.GITDB_AUTHOR_NAME;
export const GITDB_AUTHOR_EMAIL = process.env.GITDB_AUTHOR_EMAIL;
export const GITDB_SYNC_POLL_SECONDS = process.env.GITDB_SYNC_POLL_SECONDS;
export const GITDB_SYNC_MODE = process.env.GITDB_SYNC_MODE;
export const GITDB_DATA_PATH = process.env.GITDB_DATA_PATH;
export const GITDB_ENCRYPTION_KEY = process.env.GITDB_ENCRYPTION_KEY;
export const VAULT_ENCRYPTION_KEY = process.env.VAULT_ENCRYPTION_KEY;
export const NOTIFICATION_SMTP_HOST = process.env.NOTIFICATION_SMTP_HOST;
export const NOTIFICATION_SMTP_PORT = process.env.NOTIFICATION_SMTP_PORT;
export const NOTIFICATION_SMTP_SECURE = process.env.NOTIFICATION_SMTP_SECURE;
export const NOTIFICATION_SMTP_USER = process.env.NOTIFICATION_SMTP_USER;
export const NOTIFICATION_SMTP_PASSWORD = process.env.NOTIFICATION_SMTP_PASSWORD;
export const NOTIFICATION_SMTP_FROM = process.env.NOTIFICATION_SMTP_FROM;
export const NOTIFICATION_SMTP_FROM_NAME = process.env.NOTIFICATION_SMTP_FROM_NAME;
export const NOTIFICATION_SMTP_REJECT_UNAUTHORIZED =
  process.env.NOTIFICATION_SMTP_REJECT_UNAUTHORIZED;
