import { error } from '@sveltejs/kit';
import { projectAlertContext } from '#lib/server/alerts/page';
import { channelActions, loadChannelsSection } from '#lib/server/notifications/channels-page';
import { canOpenNotificationSettings } from '#lib/server/notifications/settings';

export async function load(event) {
  const { location, basePath } = await projectAlertContext(event);
  const [channels, canOpenOrganization] = await Promise.all([
    loadChannelsSection(event.locals, location),
    canOpenNotificationSettings(event.locals, location.organizationId),
  ]);
  if (!channels) throw error(403, 'Forbidden');
  return {
    channels,
    alertsPath: basePath,
    organizationSettingsPath: canOpenOrganization
      ? `/org/${event.params.org}/settings/alerts/settings`
      : null,
  };
}

export const actions = channelActions(async (event) => (await projectAlertContext(event)).location);
