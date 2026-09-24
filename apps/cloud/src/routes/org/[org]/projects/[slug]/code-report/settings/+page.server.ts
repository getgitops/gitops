import { error, fail } from '@sveltejs/kit';
import { cancanService } from '$modules/auth';
import { projectService } from '$modules/projects';

export async function load({ params, locals }) {
  const project = await projectService.getProjectBySlug(params.slug);
  if (!project) {
    throw error(404, 'Proyecto no encontrado');
  }

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

  const canUpdate = await cancanService.canSessionUser(
    locals.user,
    'project:codereport:reports:update',
    {
      scope: 'project',
      projectId: project.id,
      organizationId: project.organization?.id,
    },
  );

  const codeReportSettings = project.settings?.['code-report'] || {
    securityRiskMultipliers: {
      critical: 10,
      high: 6,
      medium: 3,
      low: 1,
    },
  };

  return {
    settings: codeReportSettings,
    canUpdate,
  };
}

export const actions = {
  updateRiskMultipliers: async ({ request, params, locals }) => {
    const project = await projectService.getProjectBySlug(params.slug);

    const canUpdate = await cancanService.canSessionUser(
      locals.user,
      'project:codereport:reports:update',
      {
        scope: 'project',
        projectId: project.id,
        organizationId: project.organization?.id,
      },
    );

    if (!canUpdate) {
      return fail(403, { error: 'Forbidden' });
    }

    const data = await request.formData();
    const critical = Number(data.get('critical'));
    const high = Number(data.get('high'));
    const medium = Number(data.get('medium'));
    const low = Number(data.get('low'));

    const currentSettings = project.settings || {};
    const codeReportSettings = currentSettings['code-report'] || {};

    const updatedSettings = {
      ...currentSettings,
      'code-report': {
        ...codeReportSettings,
        securityRiskMultipliers: {
          critical,
          high,
          medium,
          low,
        },
      },
    };

    await projectService.updateProject(project.id, {
      settings: updatedSettings,
    });

    return { success: true };
  },
};
