import { error, fail, redirect } from '@sveltejs/kit';
import { cancanService } from '../../../../../../../../modules/auth';
import {
  codeReportSecurityPolicyService,
  codeReportService,
} from '../../../../../../../../modules/code-report';
import { projectService } from '../../../../../../../../modules/projects';

export async function load({ parent, locals }) {
  const { project } = await parent();

  const canCreate = await cancanService.canSessionUser(locals.user, 'openreport:create', {
    scope: 'project',
    projectId: project.id,
    organizationId: project.organization?.id,
  });

  if (!canCreate) {
    throw error(403, 'Forbidden');
  }

  const services = await codeReportService.listByProject(project.id);

  return {
    services: services.map((service) => ({
      id: service.id,
      slug: service.slug,
      name: service.name,
      tags: service.tags,
    })),
    tags: [...new Set(services.flatMap((service) => service.tags))].sort(),
  };
}

export const actions = {
  create: async ({ request, params, locals }) => {
    const project = await projectService.getProjectBySlug(params.slug);

    const canCreate = await cancanService.canSessionUser(locals.user, 'openreport:create', {
      scope: 'project',
      projectId: project.id,
      organizationId: project.organization?.id,
    });

    if (!canCreate) {
      return fail(403, { error: 'Forbidden' });
    }

    const formData = await request.formData();
    const payload = String(formData.get('payload') || '');

    let policy;
    try {
      const input = JSON.parse(payload);
      policy = await codeReportSecurityPolicyService.create(project.id, input);
    } catch (err) {
      return fail(400, {
        error: err instanceof Error ? err.message : 'No se pudo crear la política',
      });
    }

    throw redirect(
      303,
      `/org/${params.org}/projects/${params.slug}/code-report/security-policy/${policy.id}`,
    );
  },
};
