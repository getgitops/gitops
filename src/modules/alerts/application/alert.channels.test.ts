import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEventDefinition, type EventDefinition } from '#lib/events/catalog';
import type { AnyDomainEvent } from '#lib/server/events';
import { createChannelsFixture } from '#modules/notifications/application/testing';
import {
  AlertDomain,
  AlertValidationError,
  type AlertInput,
  type AlertLocation,
} from '../domain/alert.domain';
import { buildAlertChannelMessage } from '../infrastructure/alert-channel-message';
import { InMemoryAlertRepository } from '../infrastructure/repositories/in-memory-alert.repository';
import {
  AlertEngine,
  type AlertEmail,
  type AlertNotifierPort,
  type SystemEmail,
} from './alert-engine';
import { AlertService } from './alert.service';
import { AlertThrottle } from './alert-throttle';
import { RecipientResolver } from './recipient-resolver';
import { FakeAlertDirectory, actor } from './testing';
import type { NotificationChannelsPort } from './types';

const ORG = 'org-1';
const orgLocation: AlertLocation = { scope: 'organization', organizationId: ORG, projectId: null };
const p1: AlertLocation = { scope: 'project', organizationId: ORG, projectId: 'p1' };
const HOOK = 'https://hooks.example.com/hook/T0/B0/xyz';
const WITHOUT_NOTIFICATIONS = ['project:codereport:reports:read', 'organization:projects:read'];

function input(overrides: AlertInput = {}): AlertInput {
  return {
    name: 'Críticas',
    eventType: 'code_report.analysis.completed',
    recipients: { userIds: ['u1'] },
    ...overrides,
  };
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
      gitInfo: { repositoryUrl: null, branch: 'main', commit: 'abc', version: null },
      summary: { critical: 1, high: 0, medium: 0, low: 0, unknown: 0, total: 1, secrets: 0 },
      policies: {
        status: 'compliant',
        totalViolations: 0,
        blockingFailures: 0,
        failedPolicyIds: [],
      },
    },
  } as unknown as AnyDomainEvent;
}

async function validationErrors(promise: Promise<unknown>) {
  const error = await promise.catch((caught) => caught);
  expect(error).toBeInstanceOf(AlertValidationError);
  return (error as AlertValidationError).errors;
}

class RecordingNotifier implements AlertNotifierPort {
  alerts: AlertEmail[] = [];
  system: SystemEmail[] = [];
  fail = false;
  async sendAlert(email: AlertEmail) {
    if (this.fail) throw new Error('SMTP down');
    this.alerts.push(email);
  }
  async sendSystemNotification(email: SystemEmail) {
    this.system.push(email);
  }
}

describe('alerts with notification channels', () => {
  let channels: ReturnType<typeof createChannelsFixture>;
  let port: NotificationChannelsPort;
  let repository: InMemoryAlertRepository;
  let directory: FakeAlertDirectory;
  let service: AlertService;
  let orgChannel: string;
  let p1Channel: string;
  let p2Channel: string;

  beforeEach(async () => {
    channels = createChannelsFixture();
    port = {
      listUsable: async (location) =>
        (await channels.service.listUsable(location)).map((channel) => ({
          id: channel.id,
          name: channel.name,
          type: channel.type,
          scope: channel.scope,
          enabled: channel.enabled,
        })),
      deliver: (id, message, context) => channels.service.deliver(id, message, context),
    };
    orgChannel = (
      await channels.service.create(
        orgLocation,
        { type: 'slack', name: '#org', destination: HOOK },
        'a',
      )
    ).channel.id;
    p1Channel = (
      await channels.service.create(p1, { type: 'slack', name: '#p1', destination: HOOK }, 'a')
    ).channel.id;
    p2Channel = (
      await channels.service.create(
        { ...p1, projectId: 'p2' },
        { type: 'slack', name: '#p2', destination: HOOK },
        'a',
      )
    ).channel.id;

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
      channels: port,
    });
  });

  describe('validation', () => {
    it('accepts the project and organization channels a project alert may use', async () => {
      const alert = await service.create(
        p1,
        input({ channelIds: [p1Channel, orgChannel, p1Channel] }),
        actor('admin'),
      );
      expect(alert.channelIds).toEqual([p1Channel, orgChannel]);
      expect(alert.channels).toEqual(['mail', 'slack']);
    });

    it('rejects channels of another project or another location', async () => {
      expect(
        (
          await validationErrors(
            service.create(p1, input({ channelIds: [p2Channel] }), actor('admin')),
          )
        ).channelIds,
      ).toBe('unknown_channel');
      // an organization alert can't use a project channel either
      expect(
        (
          await validationErrors(
            service.create(orgLocation, input({ channelIds: [p1Channel] }), actor('admin')),
          )
        ).channelIds,
      ).toBe('unknown_channel');
    });

    it('needs <scope>:notifications:update to add channels, not to keep them', async () => {
      const refused = await validationErrors(
        service.create(p1, input({ channelIds: [p1Channel] }), actor('dev', WITHOUT_NOTIFICATIONS)),
      );
      expect(refused.channelIds).toBe('forbidden_channel');

      const alert = await service.create(p1, input({ channelIds: [p1Channel] }), actor('admin'));
      const editor = actor('dev', [...WITHOUT_NOTIFICATIONS, 'project:alerts:update']);
      await expect(service.update(alert.id, { name: 'Renamed' }, editor)).resolves.toMatchObject({
        channelIds: [p1Channel],
      });
      expect(
        (
          await validationErrors(
            service.update(alert.id, { channelIds: [p1Channel, orgChannel] }, editor),
          )
        ).channelIds,
      ).toBe('forbidden_channel');
    });

    it('accepts an alert whose only destination is a channel', async () => {
      const alert = await service.create(
        p1,
        input({ recipients: {}, channelIds: [p1Channel] }),
        actor('admin'),
      );
      expect(alert.channels).toEqual(['slack']);
    });
  });

  describe('engine', () => {
    let notifier: RecordingNotifier;
    let mail: boolean;
    let engine: AlertEngine;

    beforeEach(() => {
      notifier = new RecordingNotifier();
      mail = true;
      engine = new AlertEngine({
        repository,
        directory,
        recipients: new RecipientResolver(directory, async () => true),
        notifier,
        channels: port,
        channelMessage: buildAlertChannelMessage,
        deliveryEnabled: () => mail,
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      });
    });

    it('emails the recipients and posts one message per channel', async () => {
      await service.create(p1, input({ channelIds: [p1Channel, orgChannel] }), actor('admin'));
      await engine.handle(analysisEvent());

      expect(notifier.alerts).toHaveLength(1);
      expect(channels.transport.sent).toHaveLength(2);
      expect(channels.transport.sent[0].message).toMatchObject({
        title: 'Críticas',
        summary: '1 critical, 0 high (1 in total)',
        test: false,
        alert: { name: 'Críticas' },
      });
    });

    it('keeps going when a channel fails, and the other way around', async () => {
      await service.create(p1, input({ channelIds: [p1Channel, orgChannel] }), actor('admin'));
      channels.transport.failWith = [404];
      notifier.fail = true;
      await engine.handle(analysisEvent());

      // the email failed, one channel answered 404: the other channel still got its message
      expect(channels.transport.sent).toHaveLength(1);
      expect(channels.repository.rows.find((row) => row.lastError === 'HTTP 404')).toBeDefined();
    });

    it('still posts to channels without SMTP, but sends no emails', async () => {
      mail = false;
      await service.create(p1, input({ channelIds: [p1Channel] }), actor('admin'));
      await engine.handle(analysisEvent());
      expect(notifier.alerts).toHaveLength(0);
      expect(channels.transport.sent).toHaveLength(1);
    });

    it('never posts system notifications to channels', async () => {
      await service.create(p1, input({ channelIds: [p1Channel] }), actor('admin'));
      directory.users = [{ userId: 'u1', username: 'ana', email: 'ana@kettu.io', disabled: false }];
      await engine.handle({
        id: 'evt-2',
        type: 'access.granted',
        occurredAt: '2026-11-24T10:00:00.000Z',
        actor: { kind: 'user', userId: 'admin' },
        scope: { organizationId: ORG, projectId: 'p1' },
        payload: { accessId: 'x', userId: 'u1', roleId: 'r1', scope: 'project', status: 'active' },
      } as unknown as AnyDomainEvent);
      expect(notifier.system).toHaveLength(1);
      expect(channels.transport.sent).toHaveLength(0);
    });

    it('reports throttled events in the next channel message', async () => {
      let now = 0;
      engine = new AlertEngine({
        repository,
        directory,
        recipients: new RecipientResolver(directory, async () => true),
        notifier,
        channels: port,
        channelMessage: buildAlertChannelMessage,
        now: () => now,
        throttle: new AlertThrottle(() => now),
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      });
      await service.create(
        p1,
        input({ throttleMinutes: 10, channelIds: [p1Channel] }),
        actor('admin'),
      );
      await engine.handle(analysisEvent());
      await engine.handle(analysisEvent());
      expect(channels.transport.sent).toHaveLength(1);
      expect(channels.transport.sent[0].message.suppressed).toBe(0);

      now = 11 * 60 * 1000;
      await engine.handle(analysisEvent());
      expect(channels.transport.sent).toHaveLength(2);
      expect(channels.transport.sent[1].message.suppressed).toBe(1);
    });

    it('includes the channels in test sends and dry runs', async () => {
      const alert = await service.create(p1, input({ channelIds: [p1Channel] }), actor('admin'));
      await channels.service.update(orgChannel, { enabled: false });

      const delivery = await engine.sendTest(alert, analysisEvent());
      expect(delivery).toEqual({ sent: 2, failed: 0 });
      expect(channels.transport.sent[0].message.test).toBe(true);

      const dry = await engine.dryRun(
        new AlertDomain({ ...alert.toJson(), channelIds: [p1Channel, orgChannel] }),
        analysisEvent(),
      );
      expect(dry.channels).toEqual([
        { id: p1Channel, name: '#p1', type: 'slack', delivers: true },
        { id: orgChannel, name: '#org', type: 'slack', delivers: false },
      ]);
    });
  });

  describe('channel message', () => {
    it('leaves out sensitive fields and links to the resource', () => {
      process.env.ORIGIN = 'https://gitops.example.com';
      const definition = getEventDefinition('vault.secret.deleted') as EventDefinition;
      const message = buildAlertChannelMessage({
        alert: { id: 'a1', name: 'Secretos', description: null, scope: 'project' },
        event: {
          id: 'e1',
          type: 'vault.secret.deleted',
          occurredAt: '2026-11-24T10:00:00.000Z',
          actor: { kind: 'system' },
          scope: { organizationId: ORG, projectId: 'p1' },
          payload: {
            secretId: 's1',
            key: 'DB_PASSWORD',
            folderId: null,
            folderPath: '/pay',
            environmentIds: ['e'],
          },
        } as never,
        definition,
        suppressed: 3,
        names: new Map([['e', 'Production']]),
        where: {
          organization: 'Kettu',
          organizationSlug: 'kettu',
          project: 'Web',
          projectSlug: 'web',
        },
      });
      const text = JSON.stringify(message);
      expect(text).not.toContain('DB_PASSWORD');
      expect(text).not.toContain('/pay');
      expect(text).toContain('Production');
      // raw catalog values for data formats (generic webhooks), sensitive ones left out too
      expect(message.event?.fields).toMatchObject({ environmentIds: ['e'] });
      expect(message.event?.fields).not.toHaveProperty('key');
      expect(message.event?.fields).not.toHaveProperty('folderPath');
      expect(message.suppressed).toBe(3);
      expect(message.link).toEqual({
        url: 'https://gitops.example.com/org/kettu/projects/web/vault',
        label: 'View in GitOps',
      });
    });
  });
});
