import { beforeEach, describe, expect, it, vi } from 'vitest';

// grants per session user in organization `org-1`
const grants: Record<string, string[]> = {};

vi.mock('#modules/auth', () => ({
  cancanService: {
    canSessionUser: async (
      user: { id?: string } | null,
      permission: string,
      context: { organizationId?: string },
    ) =>
      !!user?.id &&
      context.organizationId === 'org-1' &&
      (grants[user.id] ?? []).includes(permission),
    canApiKey: async () => false,
  },
}));
vi.mock('#modules/projects', () => ({ projectService: {} }));
vi.mock('#modules/organization', () => ({ organizationService: {} }));
vi.mock('#modules/alerts', () => ({ isMailConfigured: () => true }));

vi.mock('#modules/notifications', async () => {
  const { createNotificationsFixture } = await import('#modules/notifications/application/testing');
  const domain = await import('#modules/notifications/domain/external-recipient.domain');
  const fixture = createNotificationsFixture();
  return {
    ...domain,
    fixture,
    externalRecipientService: fixture.recipients,
    notificationSettingsService: fixture.settings,
  };
});

const notifications = (await import('#modules/notifications')) as unknown as {
  fixture: ReturnType<
    typeof import('#modules/notifications/application/testing').createNotificationsFixture
  >;
};
const {
  canOpenNotificationSettings,
  loadNotificationSettings,
  resendVerification,
  saveAllowedDomains,
} = await import('./settings');

const ORG = 'org-1';
const as = (id: string) => ({ user: { id } });

describe('notification settings authorization', () => {
  beforeEach(async () => {
    for (const key of Object.keys(grants)) delete grants[key];
    grants.admin = [
      'organization:settings:read',
      'organization:settings:update',
      'organization:notifications:read',
      'organization:notifications:update',
    ];
    grants.settingsEditor = ['organization:settings:read', 'organization:settings:update'];
    grants.notificationsManager = [
      'organization:notifications:read',
      'organization:notifications:update',
    ];
    grants.viewer = ['organization:settings:read', 'organization:notifications:read'];
    grants.developer = ['organization:projects:read'];

    notifications.fixture.recipientRepository.rows = [];
    // the fixture is shared: start every test with fresh rate-limit windows
    notifications.fixture.advance(2 * 60 * 60 * 1000);
    await notifications.fixture.settings.setAllowedDomains(ORG, ['partner.com']);
    await notifications.fixture.recipients.register(ORG, ['ana@partner.com'], 'admin');
  });

  it('opens the page with settings:read or notifications:read only', async () => {
    expect(await canOpenNotificationSettings(as('viewer'), ORG)).toBe(true);
    expect(await canOpenNotificationSettings(as('settingsEditor'), ORG)).toBe(true);
    expect(await canOpenNotificationSettings(as('notificationsManager'), ORG)).toBe(true);
    expect(await canOpenNotificationSettings(as('developer'), ORG)).toBe(false);
    expect(await loadNotificationSettings(as('developer'), ORG)).toMatchObject({ status: 403 });
    expect(await loadNotificationSettings({ user: null }, ORG)).toMatchObject({ status: 403 });
  });

  it('shows the external recipients only with notifications:read', async () => {
    const editor = await loadNotificationSettings(as('settingsEditor'), ORG);
    expect(editor).toMatchObject({
      ok: true,
      data: { allowedDomains: ['partner.com'], recipients: null, canEditDomains: true },
    });

    const manager = await loadNotificationSettings(as('notificationsManager'), ORG);
    expect(manager.ok && manager.data.canEditDomains).toBe(false);
    expect(manager.ok && manager.data.recipients?.map((recipient) => recipient.email)).toEqual([
      'ana@partner.com',
    ]);
    // the view never carries the token hash
    expect(JSON.stringify(manager)).not.toContain('verificationTokenHash');
  });

  it('changes the allowed domains only with organization:settings:update', async () => {
    for (const user of ['viewer', 'notificationsManager', 'developer']) {
      expect(await saveAllowedDomains(as(user), ORG, 'evil.com')).toMatchObject({ status: 403 });
    }
    expect((await notifications.fixture.settings.get(ORG)).allowedExternalEmailDomains).toEqual([
      'partner.com',
    ]);

    const saved = await saveAllowedDomains(as('settingsEditor'), ORG, 'client.io');
    expect(saved).toMatchObject({ ok: true, data: { allowedDomains: ['client.io'], blocked: 1 } });
    expect(notifications.fixture.recipientRepository.rows[0].status).toBe('blocked');
  });

  it('reports invalid domains as validation errors', async () => {
    expect(await saveAllowedDomains(as('admin'), ORG, 'partner.com\nnot a domain')).toMatchObject({
      ok: false,
      status: 400,
      errors: { 'allowedExternalEmailDomains.1': 'invalid_domain' },
    });
  });

  it('resends confirmations only with organization:notifications:update', async () => {
    const [{ id }] = notifications.fixture.recipientRepository.rows;
    for (const user of ['viewer', 'settingsEditor', 'developer']) {
      expect(await resendVerification(as(user), ORG, id)).toMatchObject({ status: 403 });
    }
    expect(await resendVerification(as('notificationsManager'), ORG, id)).toMatchObject({
      ok: true,
      data: { email: 'ana@partner.com', status: 'pending' },
    });
    expect(await resendVerification(as('notificationsManager'), ORG, 'missing')).toMatchObject({
      status: 404,
    });
    // another organization's grants don't reach this one
    expect(await resendVerification(as('notificationsManager'), 'org-2', id)).toMatchObject({
      status: 403,
    });
  });
});
