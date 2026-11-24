import { loadMonitorsWithStats } from '#lib/server/monitoring/page';

export async function load({ parent }) {
  const { project } = await parent();
  return { ...(await loadMonitorsWithStats(project.id)), loadedAt: new Date().toISOString() };
}
