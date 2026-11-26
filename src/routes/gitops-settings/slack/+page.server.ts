import { slackConnectService } from '#modules/notifications';
import { slackRedirectUri } from '#lib/server/notifications/channels';

// the admin area is guarded by hooks.server.ts (cluster admins only)
export function load({ url }) {
  return {
    status: slackConnectService.status(),
    redirectUri: slackRedirectUri(url.origin),
    manifestUrl: slackConnectService.manifestUrl(url.origin),
    manifest: JSON.stringify(slackConnectService.manifest(url.origin), null, 2),
    https: url.protocol === 'https:',
  };
}
