import { InvalidNotificationLinkError, externalRecipientService } from '#modules/notifications';
import { organizationService } from '#modules/organization';

import type { NotificationLinkState } from '#lib/notifications/types';

export type { NotificationLinkState };

type Action = 'verify' | 'unsubscribe';

/** Response headers of both pages: the token is in the URL, keep it out of referrers and caches. */
export const LINK_PAGE_HEADERS = { 'referrer-policy': 'no-referrer', 'cache-control': 'no-store' };

async function organizationName(organizationId: string) {
  const organization = await organizationService.getOrganization(organizationId).catch(() => null);
  return organization?.name ?? 'GitOps';
}

async function run(action: Action, token: string, use: boolean): Promise<NotificationLinkState> {
  try {
    const recipient =
      action === 'verify'
        ? use
          ? await externalRecipientService.verify(token)
          : await externalRecipientService.inspectVerification(token)
        : use
          ? await externalRecipientService.unsubscribe(token)
          : await externalRecipientService.inspectUnsubscribe(token);
    return {
      state: use ? 'done' : 'ready',
      email: recipient.email,
      organization: await organizationName(recipient.organizationId),
    };
  } catch (error) {
    if (error instanceof InvalidNotificationLinkError) return { state: error.reason };
    throw error;
  }
}

/** GET: tells what the link would do, without using it (mail scanners open links). */
export function inspectLink(action: Action, token: string) {
  return run(action, token, false);
}

/** POST from the page's button: uses the link once. */
export function useLink(action: Action, token: string) {
  return run(action, token, true);
}
