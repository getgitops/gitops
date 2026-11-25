import { error, fail } from '@sveltejs/kit';
import { organizationService } from '#modules/organization';
import {
  loadNotificationSettings,
  removeExternalRecipient,
  resendVerification,
  saveAllowedDomains,
} from '#lib/server/notifications/settings';
import { channelActions, loadChannelsSection } from '#lib/server/notifications/channels-page';

export async function load({ parent, locals }) {
  const { organization } = await parent();
  const location = {
    scope: 'organization' as const,
    organizationId: organization.id,
    projectId: null,
  };
  const [result, channels] = await Promise.all([
    loadNotificationSettings(locals, organization.id),
    loadChannelsSection(locals, location).catch(() => null),
  ]);
  if (!result.ok && !channels) throw error(result.status, result.error);
  return { settings: result.ok ? result.data : null, channels };
}

export const actions = {
  ...channelActions(async ({ params }) => {
    const organization = await organizationOf(params.org);
    return { scope: 'organization', organizationId: organization.id, projectId: null };
  }),
  async domains({ request, locals, params }) {
    const organization = await organizationOf(params.org);
    const form = await request.formData();
    const domains = String(form.get('allowedExternalEmailDomains') ?? '');
    const result = await saveAllowedDomains(locals, organization.id, domains);
    if (!result.ok) {
      return fail(result.status, { domains, error: result.error, errors: result.errors ?? {} });
    }
    return { saved: true, blocked: result.data.blocked, restored: result.data.restored };
  },

  async resend({ request, locals, params }) {
    const organization = await organizationOf(params.org);
    const form = await request.formData();
    const recipientId = String(form.get('recipientId') ?? '');
    const result = await resendVerification(locals, organization.id, recipientId);
    if (!result.ok) return fail(result.status, { recipientId, resendError: result.error });
    return { resent: recipientId };
  },

  async remove({ request, locals, params }) {
    const organization = await organizationOf(params.org);
    const form = await request.formData();
    const recipientId = String(form.get('recipientId') ?? '');
    const result = await removeExternalRecipient(locals, organization.id, recipientId);
    if (!result.ok) return fail(result.status, { recipientId, removeError: result.error });
    return { removed: result.data.email, removedFromAlerts: result.data.alerts };
  },
};

async function organizationOf(slug: string) {
  const organization = await organizationService.tryFindBySlug(slug);
  if (!organization) throw error(404, 'Organization not found');
  return organization;
}
