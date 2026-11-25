import { newMonitorForm, loadMonitorsWithStats } from '#lib/server/monitoring/page';

export async function load({ parent }) {
  const { project } = await parent();
  const loaded = await loadMonitorsWithStats(project.id);
  return {
    ...loaded,
    newMonitor: newMonitorForm(loaded.services),
    loadedAt: new Date().toISOString(),
  };
}
