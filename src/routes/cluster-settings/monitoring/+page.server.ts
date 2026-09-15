import { error } from '@sveltejs/kit';
import { cancanService } from '$modules/auth';
import { EVENT_CATALOG, eventBus } from '$modules/events';

export async function load({ locals }) {
  if (!cancanService.canAccessAdminArea(locals.user)) {
    error(403, 'Forbidden');
  }

  return {
    metrics: eventBus.getMetrics(),
    subscriptions: eventBus.getSubscriptions(),
    catalog: EVENT_CATALOG.map((event) => event.eventName),
    events: eventBus.listEvents().slice(0, 50),
  };
}
