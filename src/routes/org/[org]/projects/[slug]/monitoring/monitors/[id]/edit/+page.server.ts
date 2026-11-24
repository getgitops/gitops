import { error } from '@sveltejs/kit';
import {
  MONITOR_INTERVAL_OPTIONS,
  MonitorNotFoundError,
  monitorService,
} from '#modules/monitoring';
import { MONITOR_METHODS } from '#lib/monitoring/types';
import { monitorActions, serviceOptions } from '#lib/server/monitoring/page';

export async function load({ parent, params }) {
  const { project, monitoringPermissions } = await parent();
  if (!monitoringPermissions.canUpdate) throw error(403, 'Forbidden');
  let monitor;
  try {
    monitor = await monitorService.get(project.id, params.id);
  } catch (err) {
    if (err instanceof MonitorNotFoundError) throw error(404, 'Monitor not found');
    throw err;
  }
  return {
    monitor,
    services: await serviceOptions(project.id),
    methods: MONITOR_METHODS,
    // keep a custom interval set through the API selectable
    intervals: [...new Set([...MONITOR_INTERVAL_OPTIONS, monitor.intervalSeconds])].sort(
      (a, b) => a - b,
    ),
    values: {
      name: monitor.name,
      url: monitor.url,
      method: monitor.method,
      serviceId: monitor.serviceId ?? '',
      // stored values are never sent to the browser: an empty value keeps them
      headers: monitor.headerNames.map((name) => ({ name, value: '' })),
      body: '',
      intervalSeconds: String(monitor.intervalSeconds),
      timeoutMs: String(monitor.timeoutMs),
      expectedStatus: monitor.expectedStatus,
      degradedThresholdMs: String(monitor.degradedThresholdMs),
      confirmations: String(monitor.confirmations),
      followRedirects: monitor.followRedirects,
      enabled: monitor.enabled,
    },
  };
}

export const actions = { save: monitorActions.save, test: monitorActions.test };
