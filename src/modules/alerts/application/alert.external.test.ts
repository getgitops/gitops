import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnyDomainEvent } from '#lib/server/events';
import { createNotificationsFixture } from '#modules/notifications/application/testing';
import { AlertValidationError, type AlertInput, type AlertLocation } from '../domain/alert.domain';
import { InMemoryAlertRepository } from '../infrastructure/repositories/in-memory-alert.repository';
import {
  AlertEngine,
  type AlertEmail,
  type AlertNotifierPort,
  type SystemEmail,
} from './alert-engine';
import { AlertService } from './alert.service';
import { RecipientResolver } from './recipient-resolver';
import { FakeAlertDirectory, actor } from './testing';

const ORG = 'org-1';
const orgLocation: AlertLocation = { scope: 'organization', organizationId: ORG, projectId: null };
const projectLocation: AlertLocation = { scope: 'project', organizationId: ORG, projectId: 'p1' };

const ALL_BUT_NOTIFICATIONS = [
  'project:codereport:reports:read',
  'organization:projects:read',
  'project:alerts:update',
];

function input(overrides: AlertInput = {}): AlertInput {
  return {
    name: 'Críticas',
    eventType: 'code_report.analysis.completed',
    conditions: [],
    recipients: { userIds: [], roleIds: [], emails: ['ana@partner.com'] },
    ...overrides,
  };
}

async function validationErrors(promise: Promise<unknown>) {
  const error = await promise.catch((caught) => caught);
  expect(error).toBeInstanceOf(AlertValidationError);
  return (error as AlertValidationError).errors;
}

function analysisEvent(): AnyDomainEvent {
  return {
    id: 'evt-1',
    type: 'code_report.analysis.completed',
    occurredAt: '2026-11-24T10:00:00.000Z',
    actor: { kind: 'system' },
    scope: { organizationId: ORG, projectId: 'p1' },
    payload: {
      analysisId: 'a1',
      serviceId: 'svc-1',
      tool: 'trivy',
      status: 'completed',
      summary: { critical: 1, high: 0, medium: 0, low: 0, total: 1 },
    },
  } as unknown as AnyDomainEvent;
}

class RecordingNotifier implements AlertNotifierPort {
  alerts: AlertEmail[] = [];
  system: SystemEmail[] = [];
  async sendAlert(email: AlertEmail) {
    this.alerts.push(email);
  }
  async sendSystemNotification(email: SystemEmail) {
    this.system.push(email);
  }
}

describe('alerts with external email recipients', () => {
  let notifications: ReturnType<typeof createNotificationsFixture>;
  let repository: InMemoryAlertRepository;
  let directory: FakeAlertDirectory;
  let service: AlertService;

  beforeEach(async () => {
    notifications = createNotificationsFixture();
    await notifications.settings.setAllowedDomains(ORG, ['partner.com']);
    repository = new InMemoryAlertRepository();
    directory = new FakeAlertDirectory();
    directory.members = [
      {
        organizationId: ORG,
        projectId: 'p1',
        userId: 'u1',
        username: 'ana',
        email: 'ana@kettu.io',
        disabled: false,
        roleIds: [],
      },
    ];
    let id = 0;
    service = new AlertService(repository, directory, {
      generateId: () => `alert-${++id}`,
      externalRecipients: notifications.recipients,
    });
  });

  describe('validation (API level, not only the UI)', () => {
    it('saves allowed addresses normalized and sends their confirmation email', async () => {
      const alert = await service.create(
        projectLocation,
        input({ recipients: { emails: ['  Ana@Partner.COM', 'ana@partner.com'] } }),
        actor('admin'),
      );

      expect(alert.recipients).toMatchObject({
        userIds: [],
        roleIds: [],
        emails: ['ana@partner.com'],
      });
      expect(notifications.recipientRepository.rows).toMatchObject([
        { email: 'ana@partner.com', status: 'pending', organizationId: ORG },
      ]);
      expect(notifications.notifier.sent).toHaveLength(1);
    });

    it('rejects addresses of a domain that is not allowed', async () => {
      const errors = await validationErrors(
        service.create(
          projectLocation,
          input({ recipients: { emails: ['ok@partner.com', 'bob@evil.com', 'nope'] } }),
          actor('admin'),
        ),
      );

      expect(errors).toMatchObject({
        'recipients.emails': 'domain_not_allowed',
        'recipients.emails.1': 'domain_not_allowed',
        'recipients.emails.2': 'invalid_email',
      });
      expect(repository.rows).toHaveLength(0);
      expect(notifications.notifier.sent).toHaveLength(0);
    });

    it('rejects every external address while the organization allows no domain', async () => {
      await notifications.settings.setAllowedDomains(ORG, []);
      const errors = await validationErrors(service.create(orgLocation, input(), actor('admin')));
      expect(errors['recipients.emails']).toBe('domain_not_allowed');
    });

    it('needs <scope>:notifications:update to add external addresses', async () => {
      const project = await validationErrors(
        service.create(projectLocation, input(), actor('dev', ALL_BUT_NOTIFICATIONS)),
      );
      expect(project['recipients.emails']).toBe('forbidden_external');

      const organization = await validationErrors(
        service.create(
          orgLocation,
          input(),
          actor('dev', [...ALL_BUT_NOTIFICATIONS, 'project:notifications:update']),
        ),
      );
      expect(organization['recipients.emails']).toBe('forbidden_external');

      await expect(
        service.create(
          projectLocation,
          input(),
          actor('admin', [...ALL_BUT_NOTIFICATIONS, 'project:notifications:update']),
        ),
      ).resolves.toBeDefined();
    });

    it('lets editors without the permission keep or remove existing addresses, not add new ones', async () => {
      const alert = await service.create(projectLocation, input(), actor('admin'));
      const editor = actor('dev', ALL_BUT_NOTIFICATIONS);

      await expect(service.update(alert.id, { name: 'Renamed' }, editor)).resolves.toMatchObject({
        recipients: { emails: ['ana@partner.com'] },
      });
      const added = await validationErrors(
        service.update(
          alert.id,
          { recipients: { emails: ['ana@partner.com', 'eva@partner.com'] } },
          editor,
        ),
      );
      expect(added['recipients.emails']).toBe('forbidden_external');
      await expect(
        service.update(alert.id, { recipients: { userIds: ['u1'], emails: [] } }, editor),
      ).resolves.toMatchObject({ recipients: { userIds: ['u1'], emails: [] } });
    });

    it('accepts an alert whose only recipients are external', async () => {
      await expect(service.create(orgLocation, input(), actor('admin'))).resolves.toBeDefined();
      const errors = await validationErrors(
        service.create(orgLocation, input({ recipients: { emails: [] } }), actor('admin')),
      );
      expect(errors.recipients).toBe('required');
    });

    it('rejects external addresses when the module has no external recipients support', async () => {
      const plain = new AlertService(repository, directory);
      const errors = await validationErrors(plain.create(orgLocation, input(), actor('admin')));
      expect(errors['recipients.emails']).toBe('domain_not_allowed');
    });
  });

  describe('engine', () => {
    let notifier: RecordingNotifier;
    let engine: AlertEngine;

    beforeEach(() => {
      notifier = new RecordingNotifier();
      engine = new AlertEngine({
        repository,
        directory,
        // members can't read the event: externals are not filtered by cancan
        recipients: new RecipientResolver(directory, async () => false),
        externalRecipients: notifications.recipients,
        notifier,
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      });
    });

    async function verify(email: string) {
      await notifications.recipients.verify(notifications.notifier.tokenFor(email));
    }

    it('emails verified external recipients only, each with its unsubscribe link', async () => {
      await service.create(
        projectLocation,
        input({
          recipients: {
            userIds: ['u1'],
            emails: ['ana@partner.com', 'pending@partner.com'],
          },
        }),
        actor('admin'),
      );
      await verify('ana@partner.com');

      await engine.handle(analysisEvent());

      expect(notifier.alerts).toHaveLength(1);
      expect(notifier.alerts[0].recipient).toMatchObject({
        kind: 'external',
        email: 'ana@partner.com',
        unsubscribeUrl: expect.stringContaining('/notifications/unsubscribe?token='),
      });
    });

    it('stops emailing unsubscribed and blocked recipients', async () => {
      await service.create(projectLocation, input(), actor('admin'));
      await verify('ana@partner.com');
      await engine.handle(analysisEvent());
      expect(notifier.alerts).toHaveLength(1);

      await notifications.settings.setAllowedDomains(ORG, ['other.com']);
      await engine.handle(analysisEvent());
      expect(notifier.alerts).toHaveLength(1);

      await notifications.settings.setAllowedDomains(ORG, ['partner.com']);
      const url = (notifier.alerts[0].recipient as { unsubscribeUrl: string }).unsubscribeUrl;
      await notifications.recipients.unsubscribe(new URL(url).searchParams.get('token')!);
      await engine.handle(analysisEvent());
      expect(notifier.alerts).toHaveLength(1);
    });

    it('never sends system notifications to external recipients', async () => {
      await service.create(projectLocation, input(), actor('admin'));
      await verify('ana@partner.com');
      directory.users = [{ userId: 'u1', username: 'ana', email: 'ana@kettu.io', disabled: false }];

      await engine.handle({
        id: 'evt-2',
        type: 'access.granted',
        occurredAt: '2026-11-24T10:00:00.000Z',
        actor: { kind: 'user', userId: 'admin' },
        scope: { organizationId: ORG, projectId: 'p1' },
        payload: { accessId: 'a1', userId: 'u1', roleId: 'r1', scope: 'project', status: 'active' },
      } as unknown as AnyDomainEvent);

      expect(notifier.system.map((email) => email.recipient.email)).toEqual(['ana@kettu.io']);
      expect(notifier.alerts).toHaveLength(0);
    });

    it('sends a real test email to members and verified external addresses, never pending ones', async () => {
      const alert = await service.create(
        projectLocation,
        input({
          recipients: {
            userIds: ['u1'],
            emails: ['ana@partner.com', 'pending@partner.com'],
          },
        }),
        actor('admin'),
      );
      await verify('ana@partner.com');
      // members pass the usual read check
      engine = new AlertEngine({
        repository,
        directory,
        recipients: new RecipientResolver(directory, async () => true),
        externalRecipients: notifications.recipients,
        notifier,
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      });

      const delivery = await engine.sendTest(alert, analysisEvent());

      expect(delivery).toEqual({ sent: 2, failed: 0 });
      expect(notifier.alerts.map((email) => [email.recipient.kind, email.recipient.email])).toEqual(
        [
          ['member', 'ana@kettu.io'],
          ['external', 'ana@partner.com'],
        ],
      );
      expect(notifier.alerts.every((email) => email.test === true)).toBe(true);
    });

    it('does not touch the throttle when sending a test email', async () => {
      const alert = await service.create(
        projectLocation,
        input({ throttleMinutes: 60 }),
        actor('admin'),
      );
      await verify('ana@partner.com');

      await engine.sendTest(alert, analysisEvent());
      await engine.handle(analysisEvent());

      expect(notifier.alerts.map((email) => email.test ?? false)).toEqual([true, false]);
    });

    it('tells in a dry run which external addresses would get the email', async () => {
      const alert = await service.create(
        projectLocation,
        input({ recipients: { emails: ['ana@partner.com', 'pending@partner.com'] } }),
        actor('admin'),
      );
      await verify('ana@partner.com');

      const result = await engine.dryRun(alert, analysisEvent());

      expect(result.external).toEqual([
        { email: 'ana@partner.com', status: 'verified', delivers: true },
        { email: 'pending@partner.com', status: 'pending', delivers: false },
      ]);
      expect(notifier.alerts).toHaveLength(0);
    });
  });
});
