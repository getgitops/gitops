import { error, fail, redirect } from '@sveltejs/kit';
import { cancanService } from '$modules/auth';
import {
  codeReportAnalysisService,
  codeReportSecurityPolicyService,
  codeReportService,
} from '$modules/code-report';
import { projectService } from '$modules/projects';

export async function load({ parent, params, locals }) {
  const { project } = await parent();

  const canRead = await cancanService.canSessionUser(locals.user, 'openreport:read', {
    scope: 'project',
    projectId: project.id,
    organizationId: project.organization?.id,
  });

  if (!canRead) {
    throw error(403, 'Forbidden');
  }

  const policy = await codeReportSecurityPolicyService.getById(params.id).catch(() => null);
  if (!policy || policy.projectId !== project.id) {
    throw error(404, 'Security policy not found');
  }

  const services = await codeReportService.listByProject(project.id);

  const affectedServices = (
    await Promise.all(
      services.map(async (service) => {
        const analyses = await codeReportAnalysisService.listByService(service.id);
        const evaluations = analyses
          .map((analysis) => ({
            analysis,
            evaluation: analysis.securityPolicies?.evaluations?.find(
              (item) => item.policyId === params.id,
            ),
          }))
          .filter((entry) => entry.evaluation?.evaluable);

        if (evaluations.length === 0) return null;

        const failing = evaluations.filter((entry) => !entry.evaluation!.passed);
        const latest = evaluations[0];

        return {
          id: service.id,
          slug: service.slug,
          name: service.name,
          evaluatedAnalyses: evaluations.length,
          failingAnalyses: failing.length,
          lastEvaluatedAt: latest.analysis.updatedAt,
          lastAnalysisId: latest.analysis.id,
          lastTool: latest.analysis.tool,
          passing: latest.evaluation!.passed,
          violations: latest.evaluation!.violations.map((violation) => ({
            label: violation.label,
            actual: violation.actual,
            limit: violation.limit,
          })),
        };
      }),
    )
  )
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => right.failingAnalyses - left.failingAnalyses);

  return {
    policy,
    affectedServices,
    services: services.map((service) => ({
      id: service.id,
      slug: service.slug,
      name: service.name,
      tags: service.tags,
    })),
    tags: [...new Set(services.flatMap((service) => service.tags))].sort(),
  };
}

async function resolvePolicy(slugParam: string, id: string) {
  const project = await projectService.getProjectBySlug(slugParam);
  const policy = await codeReportSecurityPolicyService.getById(id).catch(() => null);
  if (!policy || policy.projectId !== project.id) {
    return { project, policy: null };
  }
  return { project, policy };
}

export const actions = {
  update: async ({ request, params, locals }) => {
    const { project, policy } = await resolvePolicy(params.slug, params.id);

    const canUpdate = await cancanService.canSessionUser(locals.user, 'openreport:update', {
      scope: 'project',
      projectId: project.id,
      organizationId: project.organization?.id,
    });

    if (!canUpdate) {
      return fail(403, { error: 'Forbidden' });
    }

    if (!policy) {
      return fail(404, { error: 'Security policy not found' });
    }

    const formData = await request.formData();

    try {
      const input = JSON.parse(String(formData.get('payload') || ''));
      await codeReportSecurityPolicyService.update(params.id, input);
      return { success: true };
    } catch (err) {
      return fail(400, {
        error: err instanceof Error ? err.message : 'No se pudo actualizar la política',
      });
    }
  },

  evaluate: async ({ params, locals }) => {
    const { project, policy } = await resolvePolicy(params.slug, params.id);

    const canUpdate = await cancanService.canSessionUser(locals.user, 'openreport:update', {
      scope: 'project',
      projectId: project.id,
      organizationId: project.organization?.id,
    });

    if (!canUpdate) {
      return fail(403, { error: 'Forbidden' });
    }

    if (!policy) {
      return fail(404, { error: 'Security policy not found' });
    }

    const services = await codeReportService.listByProject(project.id);
    const result = await codeReportAnalysisService.revalidateLatestByServices(services);

    const failingServices = new Set(
      result.reports
        .filter((entry) => entry.report.failed.some((item) => item.policyId === params.id))
        .map((entry) => entry.serviceId),
    );

    return {
      evaluated: {
        servicesEvaluated: result.servicesEvaluated,
        analysesUpdated: result.analysesUpdated,
        failingServices: failingServices.size,
      },
    };
  },

  delete: async ({ params, locals }) => {
    const { project, policy } = await resolvePolicy(params.slug, params.id);

    const canDelete = await cancanService.canSessionUser(locals.user, 'openreport:delete', {
      scope: 'project',
      projectId: project.id,
      organizationId: project.organization?.id,
    });

    if (!canDelete) {
      return fail(403, { error: 'Forbidden' });
    }

    if (!policy) {
      return fail(404, { error: 'Security policy not found' });
    }

    await codeReportSecurityPolicyService.delete(params.id);

    throw redirect(303, `/org/${params.org}/projects/${params.slug}/code-report/security-policy`);
  },
};
