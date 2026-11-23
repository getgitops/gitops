import type { EventLinkContext } from './types';

/** App paths for `EventDefinition.link`; `null` when the slugs needed are unknown. */
export function organizationPath(context: EventLinkContext, path = ''): string | null {
  return context.organizationSlug ? `/org/${context.organizationSlug}${path}` : null;
}

export function projectPath(context: EventLinkContext, path = ''): string | null {
  if (!context.organizationSlug || !context.projectSlug) return null;
  return `/org/${context.organizationSlug}/projects/${context.projectSlug}${path}`;
}
