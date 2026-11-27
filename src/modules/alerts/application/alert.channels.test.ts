import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEventDefinition, type EventDefinition } from '#lib/events/catalog';
import type { AnyDomainEvent } from '#lib/server/events';
import { createChannelsFixture } from '#modules/notifications/application/testing';
import type { FetchLike } from '#lib/server/infra/http/guarded-fetch';
import { createSlackTransport } from '#lib/server/infra/notifications/slack/slack.transport';
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
const SLACK_HOOK = 'https://hooks.slack.com/services/T0/B0/xyz';
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
  /** A second organization channel, the one the project alerts below use. */
  let p1Channel: string;
  /** A project channel left from before #119: nobody can use it. */
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
      await channels.service.create(
        orgLocation,
        { type: 'slack', name: '#p1', destination: HOOK },
        'a',
      )
    ).channel.id;
    p2Channel = (
      await channels.service.create(
        orgLocation,
        { type: 'slack', name: '#p2', destination: HOOK },
        'a',
      )
    ).channel.id;
    const legacy = channels.repository.rows.find((row) => row.id === p2Channel)!;
    Object.assign(legacy, { scope: 'project', projectId: 'p2' });

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
    it('accepts the organization channels in a project alert', async () => {
      const alert = await service.create(
        p1,
        input({ channelIds: [p1Channel, orgChannel, p1Channel] }),
        actor('admin'),
      );
      expect(alert.channelIds).toEqual([p1Channel, orgChannel]);
      expect(alert.channels).toEqual(['mail', 'slack']);
    });

    it('rejects project channels left from before #119, in any location', async () => {
      expect(
        (
          await validationErrors(
            service.create(
              { ...p1, projectId: 'p2' },
              input({ channelIds: [p2Channel] }),
              actor('admin'),
            ),
          )
        ).channelIds,
      ).toBe('unknown_channel');
      expect(
        (
          await validationErrors(
            service.create(orgLocation, input({ channelIds: [p2Channel] }), actor('admin')),
          )
        ).channelIds,
      ).toBe('unknown_channel');
    });

    it('drops deleted channels from the alerts of the organization', async () => {
      const both = await service.create(
        p1,
        input({ channelIds: [p1Channel, orgChannel] }),
        actor('admin'),
      );
      const only = await service.create(
        p1,
        input({ recipients: {}, channelIds: [p1Channel] }),
        actor('admin'),
      );
      expect(only.channels).toEqual(['slack']);

      await expect(service.removeChannels(ORG, [p1Channel])).resolves.toBe(2);
      expect((await service.get(both.id)).channelIds).toEqual([orgChannel]);
      // an alert left without channels falls back to email
      expect(await service.get(only.id)).toMatchObject({ channelIds: [], channels: ['mail'] });
      await expect(service.removeChannels(ORG, [p1Channel])).resolves.toBe(0);
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

    it('emails, posts Block Kit to Slack and posts to a webhook at once; a failing Slack stops none', async () => {
      const slackBodies: Array<{ text: string; blocks: unknown[] }> = [];
      let slackStatus = 200;
      const fetch: FetchLike = async (_url, init) => {
        slackBodies.push(JSON.parse(String(init.body)));
        return new Response('ok', { status: slackStatus });
      };
      const mixed = createChannelsFixture({
        types: ['slack', 'webhook'],
        transports: { slack: createSlackTransport({ fetch }) },
      });
      const slack = await mixed.service.create(
        orgLocation,
        { type: 'slack', name: '#seguridad', destination: SLACK_HOOK },
        'a',
      );
      const webhook = await mixed.service.create(
        orgLocation,
        { type: 'webhook', name: 'SIEM', destination: HOOK },
        'a',
      );
      const mixedPort: NotificationChannelsPort = {
        ...port,
        listUsable: async (location) =>
          (await mixed.service.listUsable(location)).map((channel) => ({
            id: channel.id,
            name: channel.name,
            type: channel.type,
            scope: channel.scope,
            enabled: channel.enabled,
          })),
        deliver: (id, message, context) => mixed.service.deliver(id, message, context),
      };
      const mixedRepository = new InMemoryAlertRepository();
      const mixedService = new AlertService(mixedRepository, directory, {
        generateId: () => 'alert-mixed',
        channels: mixedPort,
      });
      const mixedEngine = new AlertEngine({
        repository: mixedRepository,
        directory,
        recipients: new RecipientResolver(directory, async () => true),
        notifier,
        channels: mixedPort,
        channelMessage: buildAlertChannelMessage,
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      });
      await mixedService.create(
        p1,
        input({ channelIds: [slack.channel.id, webhook.channel.id] }),
        actor('admin'),
      );

      await mixedEngine.handle(analysisEvent());
      expect(notifier.alerts).toHaveLength(1);
      expect(mixed.transport.sent).toHaveLength(1);
      expect(slackBodies).toHaveLength(1);
      expect(slackBodies[0].text).toContain('Críticas');
      expect(slackBodies[0].blocks[0]).toEqual({
        type: 'header',
        text: { type: 'plain_text', text: 'Críticas', emoji: false },
      });

      slackStatus = 404;
      await mixedEngine.handle({ ...analysisEvent(), id: 'evt-again' });
      expect(notifier.alerts).toHaveLength(2);
      expect(mixed.transport.sent).toHaveLength(2);
      expect(mixed.repository.rows.find((row) => row.id === slack.channel.id)?.lastError).toBe(
        'HTTP 404',
      );
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
      expect(channels.transport.sent[1].message.note).toMatch(/1/);
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

    function projectUpdated() {
      return {
        alert: { id: 'a1', name: 'Proyecto actualizado', description: null, scope: 'organization' },
        event: {
          id: 'e2',
          type: 'project.updated',
          occurredAt: '2026-11-26T08:49:41.000Z',
          actor: { kind: 'system' },
          scope: { organizationId: ORG, projectId: 'p1' },
          payload: {
            projectId: 'p1',
            name: 'Mordor',
            slug: 'mordor',
            changedFields: ['description', 'status'],
            changes: [
              { field: 'description', before: 'Old', after: 'New one' },
              { field: 'status', before: 'active', after: 'inactive' },
            ],
          },
        } as never,
        definition: getEventDefinition('project.updated') as EventDefinition,
        suppressed: 0,
        names: new Map([['p1', 'Mordor']]),
        where: { organization: 'Kettu', organizationSlug: 'kettu', project: 'Mordor' },
      } as const;
    }

    it('says what changed instead of repeating the project, the date or the field names', () => {
      const message = buildAlertChannelMessage(projectUpdated());
      expect(message.location).toEqual({ label: 'Project', name: 'Mordor' });
      expect(message.text).toBe('[GitOps] Proyecto actualizado');
      expect(message.labels).toEqual({
        date: 'Date',
        changes: 'Changes',
        before: 'Before',
        after: 'New',
        empty: 'empty',
      });
      expect(message.occurredAt).toBe('2026-11-26T08:49:41.000Z');
      expect(message.changes).toEqual([
        { label: 'Description', before: 'Old', after: 'New one' },
        { label: 'Status', before: 'active', after: 'inactive' },
      ]);
      expect(message.fields).toEqual([]);
    });

    it('is written in the language it is asked for', () => {
      const es = buildAlertChannelMessage(projectUpdated(), 'es');
      const en = buildAlertChannelMessage(projectUpdated(), 'en');
      expect(es.eventLabel).not.toBe(en.eventLabel);
      expect(es.changes?.[0].label).not.toBe(en.changes?.[0].label);
      expect(es.link === null || es.link.label !== en.link?.label).toBe(true);
    });

    it('keeps the changed field names when the event has no before/after values', () => {
      const input = projectUpdated();
      const { changes: _changes, ...payload } = (
        input.event as { payload: Record<string, unknown> }
      ).payload;
      void _changes;
      const message = buildAlertChannelMessage({
        ...input,
        event: { ...(input.event as object), payload } as never,
      });
      expect(message.changes).toBeUndefined();
      expect(message.fields.map((field) => field.value)).toEqual(['Description, Status']);
    });

    it('builds each channel message in that channel language', async () => {
      const mixed = createChannelsFixture();
      const es = await mixed.service.create(
        orgLocation,
        { type: 'slack', name: '#es', destination: HOOK, locale: 'es' },
        'a',
      );
      const en = await mixed.service.create(
        orgLocation,
        { type: 'slack', name: '#en', destination: HOOK },
        'a',
      );
      expect(es.channel.locale).toBe('es');
      expect(en.channel.locale).toBe('en');

      const build = (locale: 'es' | 'en') => buildAlertChannelMessage(projectUpdated(), locale);
      await mixed.service.deliver(es.channel.id, build);
      await mixed.service.deliver(en.channel.id, build);
      expect(mixed.transport.sent.map((sent) => sent.message.eventLabel)).toEqual([
        build('es').eventLabel,
        build('en').eventLabel,
      ]);
    });
  });
});
