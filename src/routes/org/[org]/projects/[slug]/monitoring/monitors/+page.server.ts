import { loadMonitorsWithStats, monitorActions } from '#lib/server/monitoring/page';

export async function load({ parent }) {
  const { project } = await parent();
  return loadMonitorsWithStats(project.id);
}

export const actions = { toggle: monitorActions.toggle, delete: monitorActions.delete };
