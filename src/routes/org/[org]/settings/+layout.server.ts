import { error } from '@sveltejs/kit';
import { cancanService } from '$modules/auth';

// shell guard for the whole /settings subtree: CLAUDE.md's canManageOrganization gates this area.
// individual pages still re-check their own finer-grained organization:*:read permission.
export async function load({ parent, locals }) {
  const { organization } = await parent();

  const canManage = await cancanService.canManageOrganization(locals.user, organization.id);
  if (!canManage) {
    throw error(403, 'Forbidden');
  }

  return {};
}
