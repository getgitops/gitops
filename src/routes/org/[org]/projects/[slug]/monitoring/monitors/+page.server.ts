import { newMonitorForm, loadMonitorsWithStats, monitorActions } from '#lib/server/monitoring/page';

export async function load({ parent }) {
  const { project } = await parent();
  const loaded = await loadMonitorsWithStats(project.id);
  return { ...loaded, newMonitor: newMonitorForm(loaded.services) };
}

export const actions = { toggle: monitorActions.toggle, delete: monitorActions.delete };
