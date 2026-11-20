import { alertActions, loadAlertEditor, projectAlertContext } from '#lib/server/alerts/page';

export async function load(event) {
  return loadAlertEditor(event.locals, await projectAlertContext(event), {
    alertId: event.params.id,
  });
}

export const actions = alertActions(projectAlertContext);
