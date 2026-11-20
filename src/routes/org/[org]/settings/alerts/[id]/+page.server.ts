import { alertActions, loadAlertEditor, organizationAlertContext } from '#lib/server/alerts/page';

export async function load(event) {
  return loadAlertEditor(event.locals, await organizationAlertContext(event), {
    alertId: event.params.id,
  });
}

export const actions = alertActions(organizationAlertContext);
