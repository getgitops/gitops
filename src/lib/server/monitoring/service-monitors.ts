import { monitorService, monitoringRuntime } from '#modules/monitoring';
import { monitoringBase, monitoringPermissions } from './page';

type ProjectLike = Parameters<typeof monitoringPermissions>[1];

/**
 * Monitors of one Code Report service for its detail page, or `null` when the project has no
 * monitoring module or the caller can't read monitors (the section is then not shown at all).
 */
export async function loadServiceMonitors(
  locals: App.Locals,
  project: ProjectLike,
  serviceId: string,
) {
  if (!project.modules?.monitoring) return null;
  const permissions = await monitoringPermissions(locals, project);
  if (!permissions.canRead) return null;

  const records = (await monitorService.listRecordsByProject(project.id)).filter(
    (record) => record.serviceId === serviceId,
  );
  const [monitors, stats] = await Promise.all([
    monitorService.listByService(project.id, serviceId),
    monitoringRuntime.stats(records).catch(() => []),
  ]);
  const statsById = new Map(stats.map((entry) => [entry.monitorId, entry]));
  return {
    base: monitoringBase(project),
    canCreate: permissions.canCreate,
    monitors: monitors.map((monitor) => ({ monitor, stats: statsById.get(monitor.id) ?? null })),
  };
}
