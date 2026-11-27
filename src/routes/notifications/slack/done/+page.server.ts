import { LINK_PAGE_HEADERS } from '#lib/server/notifications/links';

/** End of a channel connected from `/gitops channel`: no session, only the outcome to show. */
export function load({ url, setHeaders }) {
  setHeaders(LINK_PAGE_HEADERS);
  const status = url.searchParams.get('slack') ?? 'slack_invalid_state';
  const team = url.searchParams.get('team') ?? '';
  const channel = url.searchParams.get('channel') ?? '';
  const valid = (value: string) => /^[A-Z0-9]{1,32}$/.test(value);
  return {
    connected: status === 'connected',
    // only a code shape from our own list reaches the i18n lookup
    error:
      status === 'connected'
        ? null
        : /^[A-Za-z_]{1,64}$/.test(status)
          ? status
          : 'slack_invalid_state',
    name: (url.searchParams.get('name') ?? '').slice(0, 80),
    // deep link back to the channel in the Slack app, when Slack said which one
    slackUrl:
      valid(team) && valid(channel)
        ? `slack://channel?${new URLSearchParams({ team, id: channel })}`
        : valid(team)
          ? `slack://open?${new URLSearchParams({ team })}`
          : null,
  };
}
