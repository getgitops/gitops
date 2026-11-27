import {
  ExternalRecipientNotFoundError,
  ExternalRecipientStateError,
  NotificationSettingsValidationError,
  VerificationRateLimitedError,
  externalRecipientService,
  notificationSettingsService,
  type ExternalRecipientView,
} from '#modules/notifications';
import { alertService, isMailConfigured } from '#modules/alerts';
import { readPublicOrigin } from '#lib/server/infra/notifications';
import { callerCan, type AlertLocals } from '#lib/server/alerts/access';
import type { NotificationSettingsPage } from '#lib/notifications/types';

export type { NotificationSettingsPage };

/** Outcome of a settings operation; form actions map failures to `fail()`. */
export type SettingsResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; errors?: Record<string, string> };

const forbidden = { ok: false as const, status: 403, error: 'Forbidden' };

function permissions(locals: AlertLocals, organizationId: string) {
  const context = { scope: 'organization' as const, organizationId };
  return Promise.all([
    callerCan(locals, 'organization:settings:read', context),
    callerCan(locals, 'organization:settings:update', context),
    callerCan(locals, 'organization:notifications:read', context),
    callerCan(locals, 'organization:notifications:update', context),
  ]).then(([settingsRead, settingsUpdate, notificationsRead, notificationsUpdate]) => ({
    settingsRead,
    settingsUpdate,
    notificationsRead,
    notificationsUpdate,
  }));
}

/** Who may open `/org/<org>/settings/alerts/settings` (the alert list links to it). */
export async function canOpenNotificationSettings(locals: AlertLocals, organizationId: string) {
  const allowed = await permissions(locals, organizationId);
  return allowed.settingsRead || allowed.notificationsRead;
}

/**
 * The page: allowed domains (read with `organization:settings:read` or
 * `organization:notifications:read`, changed with `organization:settings:update`) and the
 * external recipients (`organization:notifications:read`, resent with `…:update`).
 */
export async function loadNotificationSettings(
  locals: AlertLocals,
  organizationId: string,
): Promise<SettingsResult<NotificationSettingsPage>> {
  const allowed = await permissions(locals, organizationId);
  if (!allowed.settingsRead && !allowed.notificationsRead) return forbidden;
  const [settings, recipients] = await Promise.all([
    notificationSettingsService.get(organizationId),
    allowed.notificationsRead ? externalRecipientService.list(organizationId) : null,
  ]);
  return {
    ok: true,
    data: {
      allowedDomains: settings.allowedExternalEmailDomains,
      recipients,
      canEditDomains: allowed.settingsUpdate,
      canManageRecipients: allowed.notificationsUpdate,
      mailConfigured: isMailConfigured(),
      originConfigured: Boolean(readPublicOrigin()),
    },
  };
}

export async function saveAllowedDomains(
  locals: AlertLocals,
  organizationId: string,
  input: unknown,
): Promise<SettingsResult<{ allowedDomains: string[]; blocked: number; restored: number }>> {
  const context = { scope: 'organization' as const, organizationId };
  if (!(await callerCan(locals, 'organization:settings:update', context))) return forbidden;
  try {
    const result = await notificationSettingsService.setAllowedDomains(organizationId, input);
    return {
      ok: true,
      data: {
        allowedDomains: result.settings.allowedExternalEmailDomains,
        blocked: result.blocked,
        restored: result.restored,
      },
    };
  } catch (error) {
    if (error instanceof NotificationSettingsValidationError) {
      return { ok: false, status: 400, error: 'Invalid settings', errors: error.errors };
    }
    throw error;
  }
}

export async function removeExternalRecipient(
  locals: AlertLocals,
  organizationId: string,
  recipientId: string,
): Promise<SettingsResult<{ email: string; alerts: number }>> {
  const context = { scope: 'organization' as const, organizationId };
  if (!(await callerCan(locals, 'organization:notifications:update', context))) return forbidden;
  try {
    const removed = await externalRecipientService.remove(organizationId, recipientId);
    const alerts = await alertService.removeEmail(organizationId, removed.email);
    return { ok: true, data: { email: removed.email, alerts } };
  } catch (error) {
    if (error instanceof ExternalRecipientNotFoundError) {
      return { ok: false, status: 404, error: 'not_found' };
    }
    if (error instanceof ExternalRecipientStateError) {
      return { ok: false, status: 409, error: 'invalid_status' };
    }
    throw error;
  }
}

export async function resendVerification(
  locals: AlertLocals,
  organizationId: string,
  recipientId: string,
): Promise<SettingsResult<ExternalRecipientView>> {
  const context = { scope: 'organization' as const, organizationId };
  if (!(await callerCan(locals, 'organization:notifications:update', context))) return forbidden;
  try {
    const recipient = await externalRecipientService.resendVerification(
      organizationId,
      recipientId,
    );
    return { ok: true, data: recipient };
  } catch (error) {
    if (error instanceof ExternalRecipientNotFoundError) {
      return { ok: false, status: 404, error: 'not_found' };
    }
    if (error instanceof ExternalRecipientStateError) {
      return { ok: false, status: 409, error: 'invalid_status' };
    }
    if (error instanceof VerificationRateLimitedError) {
      return { ok: false, status: 429, error: 'rate_limited' };
    }
    return { ok: false, status: 502, error: 'send_failed' };
  }
}
