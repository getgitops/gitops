import { error } from '@sveltejs/kit';
import { cancanService, ssoService } from '#modules/auth';

export async function load({ parent, locals }) {
  const { organization } = await parent();

  if (
    !(await cancanService.canSessionUser(locals.user, 'organization:settings:read', {
      scope: 'organization',
      organizationId: organization.id,
    }))
  ) {
    throw error(403, 'Forbidden');
  }

  // Google SSO is configured for the whole cluster (GOOGLE_SSO_* env vars); read-only here
  return { googleSso: ssoService.getGoogleStatus() };
}
