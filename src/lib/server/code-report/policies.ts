import { codeReportAnalysisService, codeReportService } from '#modules/code-report';

/**
 * Re-evalúa las políticas sobre el último análisis de cada servicio del proyecto, para que el
 * cumplimiento que se ve refleje la política recién creada, editada o (des)activada.
 * Si falla, la escritura de la política ya está hecha: solo se registra el error.
 */
export async function revalidateProjectPolicies(
  projectId: string,
  logger?: App.Locals['logger'],
): Promise<void> {
  try {
    const services = await codeReportService.listByProject(projectId);
    await codeReportAnalysisService.revalidateLatestByServices(services);
  } catch (err) {
    logger?.error({ err, projectId }, 'security policy revalidation failed');
  }
}
