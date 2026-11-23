import { alertActions, loadAlertEditor, projectAlertContext } from '#lib/server/alerts/page';

export async function load(event) {
  return loadAlertEditor(event.locals, await projectAlertContext(event), {
    eventType: event.url.searchParams.get('event'),
  });
}

export const actions = alertActions(projectAlertContext);
