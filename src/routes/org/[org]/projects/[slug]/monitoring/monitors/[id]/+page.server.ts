import { error } from '@sveltejs/kit';
import { MonitorNotFoundError, monitorService, monitoringRuntime } from '#modules/monitoring';
import { monitorActions, serviceOptions } from '#lib/server/monitoring/page';

export async function load({ parent, params }) {
  const { project } = await parent();
  let monitor;
  try {
    monitor = await monitorService.get(project.id, params.id);
  } catch (err) {
    if (err instanceof MonitorNotFoundError) throw error(404, 'Monitor not found');
    throw err;
  }
  const record = await monitorService.getRecord(project.id, params.id);
  const [[stats], incidents, services] = await Promise.all([
    monitoringRuntime.stats([record]),
    monitoringRuntime.incidents(record.id, 50),
    serviceOptions(project.id),
  ]);
  return {
    monitor,
    stats: stats ?? null,
    incidents,
    recentChecks: monitoringRuntime.recentChecks(record.id),
    service: services.find((service) => service.id === monitor.serviceId) ?? null,
    loadedAt: new Date().toISOString(),
  };
}

export const actions = {
  testSaved: monitorActions.testSaved,
  toggle: monitorActions.toggle,
  delete: monitorActions.delete,
};
