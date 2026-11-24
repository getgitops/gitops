import { monitoringBase, requireMonitoring } from '#lib/server/monitoring/page';

export async function load(event) {
  const { project, permissions } = await requireMonitoring(event);
  return { monitoringPermissions: permissions, monitoringBase: monitoringBase(project) };
}
