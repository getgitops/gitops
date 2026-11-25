import { error, fail } from '@sveltejs/kit';
import { cancanService } from '#modules/auth';
import {
  codeReportAnalysisService,
  codeReportSecurityPolicyService,
  codeReportService,
} from '#modules/code-report';
import { projectService } from '#modules/projects';
import type { PolicyComplianceReport } from '#lib/code-report/policy-evaluation';
import { revalidateProjectPolicies } from '#lib/server/code-report/policies';

const POLICY_TOOLS = ['trivy', 'gitleaks', 'syft', 'sbom'];

export async function load({ parent, locals }) {
  const { project } = await parent();
  const scope = {
    scope: 'project' as const,
    projectId: project.id,
    organizationId: project.organization?.id,
  };

  const [canRead, canCreate, canUpdate] = await Promise.all([
    cancanService.canSessionUser(locals.user, 'project:codereport:reports:read', scope),
    cancanService.canSessionUser(locals.user, 'project:codereport:reports:create', scope),
    cancanService.canSessionUser(locals.user, 'project:codereport:reports:update', scope),
  ]);
  if (!canRead) throw error(403, 'Forbidden');

  const [policies, services] = await Promise.all([
    codeReportSecurityPolicyService.listByProject(project.id),
    codeReportService.listByProject(project.id),
  ]);

  // cumplimiento según el último análisis de cada herramienta de cada servicio
  const compliance = new Map<string, { passing: number; failing: number }>();
  await Promise.all(
    services.map(async (service) => {
      const latest = await codeReportAnalysisService.getLatestByTool(service.id, POLICY_TOOLS);
      const seen = new Map<string, boolean>();
      for (const analysis of Object.values(latest)) {
        const report = analysis?.securityPolicies as PolicyComplianceReport | null | undefined;
        for (const evaluation of report?.evaluations ?? []) {
          if (!evaluation.evaluable) continue;
          // un servicio incumple si cualquiera de sus análisis la incumple
          seen.set(
            evaluation.policyId,
            (seen.get(evaluation.policyId) ?? true) && evaluation.passed,
          );
        }
      }
      for (const [policyId, passed] of seen) {
        const entry = compliance.get(policyId) ?? { passing: 0, failing: 0 };
        if (passed) entry.passing += 1;
        else entry.failing += 1;
        compliance.set(policyId, entry);
      }
    }),
  );

  return {
    policies: policies.map((policy) => ({
      ...policy,
      compliance: compliance.get(policy.id) ?? { passing: 0, failing: 0 },
    })),
    services: services.map((service) => ({
      id: service.id,
      slug: service.slug,
      name: service.name,
      tags: service.tags,
    })),
    tags: [...new Set(services.flatMap((service) => service.tags))].sort(),
    canCreate,
    canUpdate,
  };
}

export const actions = {
  toggle: async ({ request, params, locals }) => {
    const project = await projectService.getProjectBySlug(params.slug);

    const canUpdate = await cancanService.canSessionUser(
      locals.user,
      'project:codereport:reports:update',
      { scope: 'project', projectId: project.id, organizationId: project.organization?.id },
    );
    if (!canUpdate) return fail(403, { error: 'Forbidden' });

    const formData = await request.formData();
    const id = String(formData.get('id') || '');
    const enabled = String(formData.get('enabled') || '') === 'true';

    try {
      const policy = await codeReportSecurityPolicyService.getById(id);
      if (policy.projectId !== project.id) {
        return fail(404, { error: 'Security policy not found' });
      }
      await codeReportSecurityPolicyService.setEnabled(id, enabled);
      await revalidateProjectPolicies(project.id, locals.logger);
      return { success: true };
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'No se pudo actualizar' });
    }
  },
};
