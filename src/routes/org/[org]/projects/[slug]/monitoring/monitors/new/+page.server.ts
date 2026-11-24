import { error } from '@sveltejs/kit';
import { monitorActions, newMonitorForm, serviceOptions } from '#lib/server/monitoring/page';

export async function load({ parent, url }) {
  const { project, monitoringPermissions } = await parent();
  if (!monitoringPermissions.canCreate) throw error(403, 'Forbidden');
  const services = await serviceOptions(project.id);
  return { services, ...newMonitorForm(services, url.searchParams.get('serviceId') ?? '') };
}

export const actions = { save: monitorActions.save, test: monitorActions.test };
