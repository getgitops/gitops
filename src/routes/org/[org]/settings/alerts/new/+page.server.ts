import { alertActions, loadAlertEditor, organizationAlertContext } from '#lib/server/alerts/page';

export async function load(event) {
  return loadAlertEditor(event.locals, await organizationAlertContext(event), {
    eventType: event.url.searchParams.get('event'),
  });
}

export const actions = alertActions(organizationAlertContext);
