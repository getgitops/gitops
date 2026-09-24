import { env } from '$env/dynamic/public';

/** Base URL of the GitOps app, which owns accounts, organizations and auth. */
export const gitopsUrl = (env.PUBLIC_GITOPS_URL ?? 'http://localhost:5173').replace(/\/$/, '');
