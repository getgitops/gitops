import { error, fail } from '@sveltejs/kit';
import { cancanService, ssoService } from '$modules/auth';
import { organizationService } from '$modules/organization';

export async function load({ parent, locals, url }) {
  const { organization } = await parent();

  if (
    !(await cancanService.canSessionUser(locals.user, 'organization:settings:read', {
      scope: 'organization',
      organizationId: organization.id,
    }))
  ) {
    throw error(403, 'Forbidden');
  }

  const canUpdate = await cancanService.canSessionUser(
    locals.user,
    'organization:settings:update',
    {
      scope: 'organization',
      organizationId: organization.id,
    },
  );

  return {
    google: await ssoService.getGoogleSettings(organization.id),
    googleRedirectUri: `${url.origin}/auth/sso/google/callback`,
    loginUrl: `${url.origin}/auth/login?org=${encodeURIComponent(organization.slug)}`,
    canUpdate,
  };
}

export const actions = {
  async saveGoogle({ request, params, locals }) {
    const organization = await organizationService.tryFindBySlug(params.org);
    if (!organization) return fail(404, { googleError: 'Organization not found' });

    if (
      !(await cancanService.canSessionUser(locals.user, 'organization:settings:update', {
        scope: 'organization',
        organizationId: organization.id,
      }))
    ) {
      return fail(403, { googleError: 'Forbidden' });
    }

    const form = await request.formData();
    try {
      await ssoService.saveGoogleSettings(organization.id, {
        enabled: form.get('enabled') === 'on',
        clientId: String(form.get('clientId') ?? ''),
        clientSecret: String(form.get('clientSecret') ?? ''),
        allowedDomains: String(form.get('allowedDomains') ?? '').split(/[\s,]+/),
      });
    } catch (err) {
      return fail(400, {
        googleError: err instanceof Error ? err.message : 'Failed to save Google settings',
      });
    }

    return { googleSaved: true };
  },
};
