export const APP_ENVIRONMENTS = ['local', 'development', 'production'] as const;

export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

export const FAVICONS_PLACEHOLDER = '%gitops.favicons%';

/**
 * Resolves `GITOPS_ENVIRONMENT`. A valid value wins; a missing or invalid one falls back to
 * `local` under `vite dev` and `production` everywhere else. `onInvalid` receives a value that
 * is set but not recognized.
 */
export function resolveAppEnvironment(
  value: string | undefined,
  isDev: boolean,
  onInvalid?: (value: string) => void,
): AppEnvironment {
  const raw = value?.trim().toLowerCase();
  if (raw && (APP_ENVIRONMENTS as readonly string[]).includes(raw)) return raw as AppEnvironment;
  if (raw) onInvalid?.(value!.trim());
  return isDev ? 'local' : 'production';
}

/** The `<link>` tags for the favicons of an environment (the SVG only exists for production). */
export function faviconLinks(env: AppEnvironment): string {
  const links = [
    `<link rel="icon" href="/favicons/${env}-32.png" sizes="32x32" type="image/png" />`,
    `<link rel="icon" href="/favicons/${env}-192.png" sizes="192x192" type="image/png" />`,
    `<link rel="icon" href="/favicons/${env}-512.png" sizes="512x512" type="image/png" />`,
    `<link rel="apple-touch-icon" href="/favicons/${env}-180.png" sizes="180x180" />`,
  ];
  if (env === 'production') {
    links.push('<link rel="icon" href="/favicons/production.svg" type="image/svg+xml" />');
  }
  return links.join('\n    ');
}
