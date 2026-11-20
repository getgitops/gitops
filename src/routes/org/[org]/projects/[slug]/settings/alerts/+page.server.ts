import { alertActions, loadAlertList, projectAlertContext } from '#lib/server/alerts/page';

export async function load(event) {
  return loadAlertList(event.locals, await projectAlertContext(event));
}

export const actions = alertActions(projectAlertContext);
