import { error } from '@sveltejs/kit';
import { MONITOR_DEFAULTS, MONITOR_INTERVAL_OPTIONS } from '#modules/monitoring';
import { MONITOR_METHODS } from '#lib/monitoring/types';
import { monitorActions, serviceOptions } from '#lib/server/monitoring/page';

export async function load({ parent, url }) {
  const { project, monitoringPermissions } = await parent();
  if (!monitoringPermissions.canCreate) throw error(403, 'Forbidden');
  const services = await serviceOptions(project.id);
  const presetService = url.searchParams.get('serviceId') ?? '';
  return {
    services,
    methods: MONITOR_METHODS,
    intervals: MONITOR_INTERVAL_OPTIONS,
    values: {
      name: '',
      url: '',
      method: MONITOR_DEFAULTS.method,
      serviceId: services.some((service) => service.id === presetService) ? presetService : '',
      headers: [],
      body: '',
      intervalSeconds: String(MONITOR_DEFAULTS.intervalSeconds),
      timeoutMs: String(MONITOR_DEFAULTS.timeoutMs),
      expectedStatus: MONITOR_DEFAULTS.expectedStatus,
      degradedThresholdMs: String(MONITOR_DEFAULTS.degradedThresholdMs),
      confirmations: String(MONITOR_DEFAULTS.confirmations),
      followRedirects: MONITOR_DEFAULTS.followRedirects,
      enabled: true,
    },
  };
}

export const actions = { save: monitorActions.save, test: monitorActions.test };
