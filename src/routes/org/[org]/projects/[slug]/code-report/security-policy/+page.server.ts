import { error, fail } from '@sveltejs/kit';
import { cancanService } from '$modules/auth';
import { codeReportSecurityPolicyService } from '$modules/code-report';
import { projectService } from '$modules/projects';

export async function load({ parent, locals }) {
  const { project } = await parent();

  const canRead = await cancanService.canSessionUser(locals.user, 'openreport:read', {
    scope: 'project',
    projectId: project.id,
    organizationId: project.organization?.id,
  });

  if (!canRead) {
    throw error(403, 'Forbidden');
  }

  return { policies: await codeReportSecurityPolicyService.listByProject(project.id) };
}

export const actions = {
  toggle: async ({ request, params, locals }) => {
    const project = await projectService.getProjectBySlug(params.slug);

    const canUpdate = await cancanService.canSessionUser(locals.user, 'openreport:update', {
      scope: 'project',
      projectId: project.id,
      organizationId: project.organization?.id,
    });

    if (!canUpdate) {
      return fail(403, { error: 'Forbidden' });
    }

    const formData = await request.formData();
    const id = String(formData.get('id') || '');
    const enabled = String(formData.get('enabled') || '') === 'true';

    try {
      const policy = await codeReportSecurityPolicyService.getById(id);
      if (policy.projectId !== project.id) {
        return fail(404, { error: 'Security policy not found' });
      }
      await codeReportSecurityPolicyService.setEnabled(id, enabled);
      return { success: true };
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'No se pudo actualizar' });
    }
  },
};
