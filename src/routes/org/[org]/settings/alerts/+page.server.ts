import { alertActions, loadAlertList, organizationAlertContext } from '#lib/server/alerts/page';

export async function load(event) {
  return loadAlertList(event.locals, await organizationAlertContext(event));
}

export const actions = alertActions(organizationAlertContext);
