import { defineEnvVars } from '@sveltejs/kit/env';

// Consumers retain their existing defaults and validation for optional runtime values.
const optional = { schema: (value: string | undefined) => value };

export const variables = defineEnvVars({
  GITDB_REPOSITORY_URL: optional,
  GITDB_BRANCH: optional,
  GITDB_TOKEN: optional,
  GITDB_USERNAME: optional,
  GITDB_PASSWORD: optional,
  GITDB_AUTHOR_NAME: optional,
  GITDB_AUTHOR_EMAIL: optional,
  GITDB_SYNC_POLL_SECONDS: optional,
  GITDB_SYNC_MODE: optional,
  GITDB_DATA_PATH: optional,
  GITDB_ENCRYPTION_KEY: optional,
  VAULT_ENCRYPTION_KEY: optional,
  NOTIFICATION_SMTP_HOST: optional,
  NOTIFICATION_SMTP_PORT: optional,
  NOTIFICATION_SMTP_SECURE: optional,
  NOTIFICATION_SMTP_USER: optional,
  NOTIFICATION_SMTP_PASSWORD: optional,
  NOTIFICATION_SMTP_FROM: optional,
  NOTIFICATION_SMTP_FROM_NAME: optional,
  NOTIFICATION_SMTP_REJECT_UNAUTHORIZED: optional,
});
