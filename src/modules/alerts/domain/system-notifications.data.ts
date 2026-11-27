import type { DomainEventMap, EventType } from '#lib/events/domain-events';

/** Fixed notification kinds; the notifier turns each into a subject and a message. */
export type SystemNotificationKind =
  'access_granted' | 'access_updated' | 'access_revoked' | 'api_key_created' | 'channel_disabled';

export type SystemNotificationRule<K extends EventType = EventType> = {
  eventType: K;
  kind: SystemNotificationKind;
  /** The user to tell, or `null` when this event needs no notification. */
  recipient(payload: DomainEventMap[K]): string | null;
};

type Rules = { [K in EventType]?: SystemNotificationRule<K> };

/**
 * Notifications nobody configures: people hear about changes to their own access and about new
 * personal API keys, and whoever created a notification channel hears when it disables itself
 * after repeated failures. They never go to the user who caused the event (the engine skips the actor).
 *
 * Invitations (`status: 'invited'`) are skipped: the invitation email already tells the user.
 */
export const SYSTEM_NOTIFICATIONS: Rules = {
  'access.granted': {
    eventType: 'access.granted',
    kind: 'access_granted',
    recipient: (payload) => (payload.status === 'active' ? payload.userId : null),
  },
  'access.updated': {
    eventType: 'access.updated',
    kind: 'access_updated',
    recipient: (payload) =>
      payload.status === 'active' && payload.roleId !== payload.previousRoleId
        ? payload.userId
        : null,
  },
  'access.revoked': {
    eventType: 'access.revoked',
    kind: 'access_revoked',
    recipient: (payload) => (payload.status === 'active' ? payload.userId : null),
  },
  'api_key.created': {
    eventType: 'api_key.created',
    kind: 'api_key_created',
    // project keys belong to a project, not to a person
    recipient: (payload) => (payload.projectId ? null : payload.userId),
  },
  'notifications.channel.disabled': {
    eventType: 'notifications.channel.disabled',
    kind: 'channel_disabled',
    recipient: (payload) => payload.createdByUserId,
  },
};

export function getSystemNotification<K extends EventType>(
  type: K,
): SystemNotificationRule<K> | undefined {
  return SYSTEM_NOTIFICATIONS[type] as SystemNotificationRule<K> | undefined;
}
