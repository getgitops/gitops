import { error } from '@sveltejs/kit';
import { projectService } from '$modules/projects';

export async function load({ params }) {
  const project = await projectService.getProjectBySlug(params.slug);
  if (!project) {
    throw error(404, 'Proyecto no encontrado');
  }

  const codeReportSettings = project.settings?.['code-report'] || {
    securityRiskMultipliers: {
      critical: 10,
      high: 6,
      medium: 3,
      low: 1,
    }
  };

  return {
    settings: codeReportSettings,
  };
}

export const actions = {
  updateRiskMultipliers: async ({ request, params }) => {
    const data = await request.formData();
    const critical = Number(data.get('critical'));
    const high = Number(data.get('high'));
    const medium = Number(data.get('medium'));
    const low = Number(data.get('low'));

    const project = await projectService.getProjectBySlug(params.slug);

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
  }
};
