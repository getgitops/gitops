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

export async function load({ params }) {
  const project = await projectService.getProjectBySlug(params.slug);

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
  };
}

export const actions = {
  updateTools: async ({ request, params }) => {
    const data = await request.formData();
    const enabledToolIds = data.getAll('tools');

    const project = await projectService.getProjectBySlug(params.slug);

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
