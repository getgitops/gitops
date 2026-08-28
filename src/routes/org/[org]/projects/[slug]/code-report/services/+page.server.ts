import { error, fail } from '@sveltejs/kit';
import { codeReportService, codeReportAnalysisService } from '$modules/code-report';
import { projectService } from '$modules/projects';
import { cancanService } from '$modules/auth';
import { summarizeAnalysisResult } from '$lib/code-report/analysis-summary';

export async function load({ parent, locals }) {
  const { project } = await parent();

  const canRead = await cancanService.canSessionUser(
    locals.user,
    'project:codereport:reports:read',
    {
      scope: 'project',
      projectId: project.id,
      organizationId: project.organization?.id,
    },
  );

  if (!canRead) {
    throw error(403, 'Forbidden');
  }

  const services = await codeReportService.listByProject(project.id);

  const servicesWithSeverity = await Promise.all(
    services.map(async (service) => {
      const latest = await codeReportAnalysisService.getLatestByTool(service.id, ['trivy']);
      const analysis = latest.trivy;
      const summary =
        analysis?.status === 'completed' ? summarizeAnalysisResult(analysis.result) : null;

      return {
        ...service,
        lastScanAt: analysis?.createdAt ?? null,
        severity: summary?.vulnerabilities ?? null,
      };
    }),
  );

  return { services: servicesWithSeverity };
}

export const actions = {
  create: async ({ request, params, locals }) => {
    const project = await projectService.getProjectBySlug(params.slug);

    const canCreate = await cancanService.canSessionUser(
      locals.user,
      'project:codereport:reports:create',
      {
        scope: 'project',
        projectId: project.id,
        organizationId: project.organization?.id,
      },
    );

    if (!canCreate) {
      return fail(403, { error: 'Forbidden' });
    }

    const formData = await request.formData();
    const name = String(formData.get('name') || '').trim();
    const slug = String(formData.get('slug') || '').trim();
    const description = String(formData.get('description') || '').trim();
    const tags = formData
      .getAll('tags')
      .map((tag) => String(tag).trim())
      .filter((tag) => tag.length > 0);

    try {
      await codeReportService.createService({
        projectId: project.id,
        name,
        slug: slug || undefined,
        description: description || undefined,
        tags,
      });
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create service';
      return fail(400, { error: message, name, slug, description, tags });
    }
  },
};
