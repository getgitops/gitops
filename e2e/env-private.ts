// Stand-in for SvelteKit's `$app/env/private` when Playwright's global setup imports app modules
// in-process (GitDB start + seed). Imported after global-setup assigns process.env, so these
// snapshots see the throwaway E2E configuration. Keep in sync with `src/env.ts`.

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
export const GOOGLE_SSO_CLIENT_ID = process.env.GOOGLE_SSO_CLIENT_ID;
export const GOOGLE_SSO_CLIENT_SECRET = process.env.GOOGLE_SSO_CLIENT_SECRET;
export const GOOGLE_SSO_ALLOWED_DOMAINS = process.env.GOOGLE_SSO_ALLOWED_DOMAINS;
export const GOOGLE_SSO_AUTO_PROVISION = process.env.GOOGLE_SSO_AUTO_PROVISION;
export const GITOPS_EVENTS_EXPIRATION = process.env.GITOPS_EVENTS_EXPIRATION;
