import { error, redirect } from '@sveltejs/kit';
import { projectAlertContext } from '#lib/server/alerts/page';
import { canOpenNotificationSettings } from '#lib/server/notifications/settings';

/**
 * Projects have no notification settings of their own: channels and integrations belong to the
 * organization (#119). Old links land on the organization's page, for those who can open it.
 */
export async function load(event) {
  const { location } = await projectAlertContext(event);
  if (await canOpenNotificationSettings(event.locals, location.organizationId)) {
    throw redirect(303, `/org/${event.params.org}/settings/alerts/settings`);
  }
  throw error(404, 'Not found');
}
