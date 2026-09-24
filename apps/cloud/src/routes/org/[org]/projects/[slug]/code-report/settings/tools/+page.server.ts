import { error, fail } from '@sveltejs/kit';
import { cancanService } from '$modules/auth';
import { projectService } from '$modules/projects';

const DEFAULT_CODE_REPORT_TOOLS = [
  {
    id: 'trivy',
    name: 'Vulnerabilidades',
    description: 'Escaneo de vulnerabilidades y severidad de dependencias con Trivy.',
    enabled: true,
    scanner: 'trivy',
  },
  {
    id: 'syft',
    name: 'Dependencias, SBOM y Licencias',
    description: 'Inventario de dependencias, generación de SBOM y análisis de licencias con Syft.',
    enabled: true,
    scanner: 'syft',
  },
  {
    id: 'gitleaks',
    name: 'Secretos Expuestos',
    description: 'Detección de secretos expuestos en el repositorio con Gitleaks.',
    enabled: true,
    scanner: 'gitleaks',
  },
  {
    id: 'code-coverage',
    name: 'Code Coverage',
    description: 'Métricas de cobertura de código por servicio.',
    enabled: false,
    scanner: 'code-coverage',
    soon: true,
  },
];

export async function load({ params, locals }) {
  const project = await projectService.getProjectBySlug(params.slug);

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

  const codeReportSettings = project.settings?.['code-report'] || {};
  const persistedTools = Array.isArray(codeReportSettings.tools) ? codeReportSettings.tools : [];
  const persistedById = new Map(
    persistedTools
      .filter((tool: any) => tool && typeof tool.id === 'string')
      .map((tool: any) => [tool.id, tool]),
  );

  const tools = DEFAULT_CODE_REPORT_TOOLS.map((tool) => {
    const persisted = persistedById.get(tool.id);
    return {
      ...tool,
      enabled: persisted?.enabled ?? tool.enabled,
    };
  });

  return {
    tools,
    canUpdate,
  };
}

export const actions = {
  updateTools: async ({ request, params, locals }) => {
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
    const enabledToolIds = data.getAll('tools');

    const currentSettings = project.settings || {};
    const codeReportSettings = currentSettings['code-report'] || {};
    const enabledSet = new Set(enabledToolIds.map((id) => String(id)));
    const updatedTools = DEFAULT_CODE_REPORT_TOOLS.map((tool) => ({
      ...tool,
      enabled: tool.soon ? false : enabledSet.has(tool.id),
    }));

    const updatedSettings = {
      ...currentSettings,
      'code-report': {
        ...codeReportSettings,
        tools: updatedTools,
      },
    };

    await projectService.updateProject(project.id, {
      settings: updatedSettings,
    });

    return { success: true };
  },
};
