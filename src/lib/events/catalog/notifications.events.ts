import { OPERATORS, enumOptions, eventText, fieldLabel } from './fields';
import type { EventDefinitions } from './types';
import { organizationPath, projectPath } from './links';

/** Values of `notification_channels.type` (`#lib/server/infra/notifications/chat-types`). */
const CHANNEL_TYPES = ['webhook', 'slack', 'google-chat'] as const;
export const CHANNEL_TYPE_OPTIONS = enumOptions('channelType', CHANNEL_TYPES);

const DISABLED = 'notifications.channel.disabled';

export const notificationEvents: EventDefinitions<typeof DISABLED> = {
  [DISABLED]: {
    // where the channel is managed: the alert settings of its project or organization
    link: (context) =>
      context.projectSlug
        ? projectPath(context, '/settings/alerts')
        : organizationPath(context, '/settings/alerts'),
    mailSummary: ({ name, failures }) => ({
      key: 'alerts.email.summary.channelDisabled',
      values: { name, failures },
    }),
    ...eventText(DISABLED),
    module: 'notifications',
    scope: 'organization',
    readPermission: 'organization:notifications:read',
    alertable: true,
    fields: [
      {
        key: 'type',
        label: fieldLabel(DISABLED, 'type'),
        type: 'enum',
        options: CHANNEL_TYPE_OPTIONS,
        operators: OPERATORS.enum,
      },
      {
        key: 'name',
        label: fieldLabel(DISABLED, 'name'),
        type: 'string',
        operators: OPERATORS.string,
      },
      {
        key: 'failures',
        label: fieldLabel(DISABLED, 'failures'),
        type: 'number',
        operators: OPERATORS.number,
      },
      {
        key: 'lastError',
        label: fieldLabel(DISABLED, 'lastError'),
        type: 'string',
        operators: OPERATORS.string,
      },
    ],
  },
};
