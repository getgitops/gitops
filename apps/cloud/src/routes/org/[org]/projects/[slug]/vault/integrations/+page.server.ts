import { error } from '@sveltejs/kit';
import { cancanService } from '$modules/auth';

export async function load({ parent, locals }) {
  const { project } = await parent();

  const canRead = await cancanService.canSessionUser(locals.user, 'project:vault:secrets:read', {
    scope: 'project',
    projectId: project.id,
    organizationId: project.organization?.id,
  });

  if (!canRead) throw error(403, 'Forbidden');

  return {};
}
