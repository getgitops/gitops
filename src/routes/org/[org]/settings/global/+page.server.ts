import { error } from '@sveltejs/kit';
import { cancanService } from '$modules/auth';

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

  return {};
}
