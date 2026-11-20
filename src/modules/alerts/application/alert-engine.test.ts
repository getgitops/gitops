import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AnyDomainEvent } from '#lib/server/events';
import { InProcessEventBus } from '#lib/server/events';
import type { CodeReportAnalysisCompletedPayload } from '#lib/events/domain-events';
import { CanCanService } from '../../auth/application/cancan.service';
import { RoleDomain } from '../../auth/domain/role.domain';
import { UserDomain } from '../../auth/domain/user.domain';
import { UserAccessDomain } from '../../auth/domain/user-access.domain';
import type { AlertRow } from '../domain/alert.domain';
import { InMemoryAlertRepository } from '../infrastructure/repositories/in-memory-alert.repository';
import {
  AlertEngine,
  type AlertEmail,
  type AlertNotifierPort,
  type SystemEmail,
} from './alert-engine';
import { AlertThrottle } from './alert-throttle';
import { RecipientResolver } from './recipient-resolver';
import { FakeAlertDirectory } from './testing';

const ORG = 'org-1';
const TIMESTAMP = '2024-01-01T00:00:00.000Z';

function role(id: string, scope: 'organization' | 'project', permissions: string[]) {
  return new RoleDomain({
    id,
    slug: id,
    name: id,
    scope,
    permissions,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  });
}

const roles = {
  orgViewer: role('org-viewer', 'organization', [
    'organization:projects:read',
    'organization:users:read',
  ]),
  orgOutsider: role('org-nothing', 'organization', []),
  projectReporter: role('project-reporter', 'project', ['project:codereport:reports:read']),
  projectGuest: role('project-guest', 'project', ['project:project:read']),
};

function access(
  id: string,
  userId: string,
  entry: { role: RoleDomain; organizationId?: string; projectId?: string },
) {
  return new UserAccessDomain({
    id,
    userId,
    roleId: entry.role.id,
    role: entry.role,
    scope: entry.projectId ? 'project' : 'organization',
    organizationId: entry.organizationId ?? null,
    projectId: entry.projectId ?? null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  });
}

function completed(
  summary: Partial<CodeReportAnalysisCompletedPayload['summary']> = {},
  scope = { organizationId: ORG, projectId: 'p1' },
  id = 'event-1',
): AnyDomainEvent {
  return {
    id,
    type: 'code_report.analysis.completed',
    occurredAt: TIMESTAMP,
    actor: { kind: 'api_key', apiKeyId: 'key-1', projectId: 'p1' },
    scope,
    payload: {
      analysisId: 'analysis-1',
      serviceId: 'svc-gateway',
      tool: 'trivy',
      gitInfo: { repositoryUrl: null, branch: 'main', commit: null, version: null },
      summary: {
        critical: 1,
        high: 0,
        medium: 0,
        low: 0,
        unknown: 0,
        total: 1,
        secrets: 0,
        ...summary,
      },
      policies: {
        status: 'compliant',
        totalViolations: 0,
        blockingFailures: 0,
        failedPolicyIds: [],
      },
    },
  };
}

function alertRow(overrides: Partial<AlertRow> = {}): AlertRow {
  return {
    id: 'alert-1',
    name: 'Críticas',
    description: null,
    enabled: true,
    scope: 'project',
    organizationId: ORG,
    projectId: 'p1',
    eventType: 'code_report.analysis.completed',
    match: 'all',
    conditions: [{ field: 'summary.critical', operator: 'gt', value: 0 }],
    recipients: { userIds: [], roleIds: ['project-reporter'] },
    channels: ['mail'],
    throttleMinutes: 0,
    createdByUserId: 'author',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

class RecordingNotifier implements AlertNotifierPort {
  alerts: AlertEmail[] = [];
  system: SystemEmail[] = [];
  failFor = new Set<string>();

  async sendAlert(email: AlertEmail) {
    if (this.failFor.has(email.recipient.userId)) throw new Error('SMTP down');
    this.alerts.push(email);
  }

  async sendSystemNotification(email: SystemEmail) {
    this.system.push(email);
  }
}

describe('AlertEngine', () => {
  let repository: InMemoryAlertRepository;
  let directory: FakeAlertDirectory;
  let notifier: RecordingNotifier;
  let clock: number;
  let engine: AlertEngine;
  let logger: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };

  const sentTo = () => notifier.alerts.map((email) => email.recipient.userId).sort();

  beforeEach(() => {
    repository = new InMemoryAlertRepository();
    directory = new FakeAlertDirectory();
    notifier = new RecordingNotifier();
    clock = Date.parse('2026-11-20T10:00:00.000Z');
    logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    const member = (
      userId: string,
      roleIds: string[],
      extra: { projectId?: string; disabled?: boolean; email?: string | null } = {},
    ) => ({
      organizationId: ORG,
      projectId: extra.projectId ?? null,
      userId,
      username: userId,
      email: extra.email === undefined ? `${userId}@example.com` : extra.email,
      disabled: extra.disabled ?? false,
      roleIds,
    });

    directory.members = [
      member('ana', ['project-reporter'], { projectId: 'p1' }),
      member('bea', ['project-reporter'], { projectId: 'p1' }),
      member('carl', ['project-reporter'], { projectId: 'p1', disabled: true }),
      member('nomail', ['project-reporter'], { projectId: 'p1', email: null }),
      member('dora', ['org-viewer', 'project-guest']),
      member('eli', ['org-viewer']),
      member('fran', ['org-nothing']),
      member('pia', ['project-reporter'], { projectId: 'p2' }),
    ];

    const accessByUser: Record<string, UserAccessDomain[]> = {
      ana: [access('a1', 'ana', { role: roles.projectReporter, projectId: 'p1' })],
      bea: [access('a2', 'bea', { role: roles.projectReporter, projectId: 'p1' })],
      carl: [access('a3', 'carl', { role: roles.projectReporter, projectId: 'p1' })],
      nomail: [access('a4', 'nomail', { role: roles.projectReporter, projectId: 'p1' })],
      // org role that cascades into projects, but an explicit project role in p1 wins
      dora: [
        access('a5', 'dora', { role: roles.orgViewer, organizationId: ORG }),
        access('a6', 'dora', { role: roles.projectGuest, projectId: 'p1' }),
      ],
      eli: [access('a7', 'eli', { role: roles.orgViewer, organizationId: ORG })],
      fran: [access('a8', 'fran', { role: roles.orgOutsider, organizationId: ORG })],
      pia: [access('a9', 'pia', { role: roles.projectReporter, projectId: 'p2' })],
    };
    const cancan = new CanCanService(
      {
        findById: async (id: string) =>
          new UserDomain({
            id,
            username: id,
            email: null,
            password: 'x',
            role: null,
            createdAt: TIMESTAMP,
            updatedAt: TIMESTAMP,
          }),
      },
      { findByUserId: async (userId: string) => accessByUser[userId] ?? [] },
      { getProject: async (id: string) => ({ id, organization: { id: ORG } }) },
    );

    engine = new AlertEngine({
      repository,
      directory,
      recipients: new RecipientResolver(directory, (userId, permission, context) =>
        cancan.can(userId, permission, context),
      ),
      notifier,
      throttle: new AlertThrottle(() => clock),
      logger: logger as never,
      now: () => clock,
    });
  });

  it('sends one email per recipient that can read the event', async () => {
    repository.rows = [alertRow()];
    await engine.handle(completed());

    expect(sentTo()).toEqual(['ana', 'bea']);
    expect(notifier.alerts[0]).toMatchObject({ alert: { id: 'alert-1' }, suppressed: 0 });
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ alertId: 'alert-1', recipients: 2, sent: 2 }),
      '[alerts] alert fired',
    );
  });

  it('skips disabled users and users without an email', async () => {
    repository.rows = [
      alertRow({ recipients: { userIds: ['carl', 'nomail', 'ana'], roleIds: [] } }),
    ];
    await engine.handle(completed());
    expect(sentTo()).toEqual(['ana']);
  });

  it('does not email recipients without the read permission, most-specific-wins included', async () => {
    repository.rows = [
      alertRow({ recipients: { userIds: ['ana', 'dora', 'eli', 'fran'], roleIds: [] } }),
    ];
    await engine.handle(completed());

    // eli reads p1 through the organization cascade; dora's explicit p1 role has no report access;
    // fran's organization role can't read projects at all
    expect(sentTo()).toEqual(['ana', 'eli']);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ deniedUserIds: expect.arrayContaining(['dora', 'fran']) }),
      expect.any(String),
    );
  });

  it('only fires alerts whose scope covers the event', async () => {
    repository.rows = [
      alertRow({ id: 'p1-alert' }),
      alertRow({ id: 'p2-alert', projectId: 'p2', recipients: { userIds: ['pia'], roleIds: [] } }),
      alertRow({
        id: 'org-alert',
        scope: 'organization',
        projectId: null,
        recipients: { userIds: ['eli'], roleIds: [] },
      }),
      alertRow({
        id: 'other-org',
        organizationId: 'org-2',
        scope: 'organization',
        projectId: null,
      }),
      alertRow({ id: 'disabled', enabled: false }),
    ];
    await engine.handle(completed());

    expect(notifier.alerts.map((email) => email.alert.id).sort()).toEqual([
      'org-alert',
      'p1-alert',
      'p1-alert',
    ]);
  });

  it('ignores events that do not match the conditions', async () => {
    repository.rows = [alertRow()];
    await engine.handle(completed({ critical: 0 }));
    expect(notifier.alerts).toHaveLength(0);
  });

  it('throttles an alert and reports the suppressed events in the next email', async () => {
    repository.rows = [
      alertRow({ throttleMinutes: 30, recipients: { userIds: ['ana'], roleIds: [] } }),
    ];

    await engine.handle(completed({}, undefined, 'e1'));
    clock += 10 * 60_000;
    await engine.handle(completed({}, undefined, 'e2'));
    await engine.handle(completed({}, undefined, 'e3'));
    expect(notifier.alerts).toHaveLength(1);

    clock += 25 * 60_000;
    await engine.handle(completed({}, undefined, 'e4'));
    expect(notifier.alerts.map((email) => [email.event.id, email.suppressed])).toEqual([
      ['e1', 0],
      ['e4', 2],
    ]);
  });

  it('keeps sending to the other recipients when one email fails', async () => {
    repository.rows = [alertRow()];
    notifier.failFor.add('ana');
    await engine.handle(completed());

    expect(sentTo()).toEqual(['bea']);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'ana' }),
      '[alerts] email to recipient failed',
    );
  });

  it('caches alerts per event type until invalidated or expired', async () => {
    const list = vi.spyOn(repository, 'listEnabledByEventType');
    repository.rows = [alertRow()];

    await engine.handle(completed());
    await engine.handle(completed());
    expect(list).toHaveBeenCalledTimes(1);

    engine.invalidate();
    await engine.handle(completed());
    expect(list).toHaveBeenCalledTimes(2);

    clock += 61_000;
    await engine.handle(completed());
    expect(list).toHaveBeenCalledTimes(3);
  });

  it('runs from the bus without failing the publisher', async () => {
    const bus = new InProcessEventBus({ logger: { error: vi.fn() }, resolveActor: () => null });
    repository.rows = [alertRow()];
    engine.attach(bus);

    bus.publish('code_report.analysis.completed', completed().payload as never, {
      scope: { organizationId: ORG, projectId: 'p1' },
    });
    await bus.drain();

    expect(sentTo()).toEqual(['ana', 'bea']);
  });

  describe('dry run', () => {
    it('tells who would receive the alert without sending or throttling', async () => {
      const alert = new (await import('../domain/alert.domain')).AlertDomain(
        alertRow({ throttleMinutes: 60 }),
      );
      const result = await engine.dryRun(alert, completed());

      expect(result.matched).toBe(true);
      expect(result.recipients.map((recipient) => recipient.userId).sort()).toEqual(['ana', 'bea']);
      expect(notifier.alerts).toHaveLength(0);

      repository.rows = [alertRow({ throttleMinutes: 60 })];
      await engine.handle(completed());
      expect(notifier.alerts).toHaveLength(2);
    });
  });

  describe('system notifications', () => {
    function accessEvent(
      type: 'access.granted' | 'access.updated' | 'access.revoked',
      overrides: Record<string, unknown> = {},
      actor: AnyDomainEvent['actor'] = { kind: 'user', userId: 'admin' },
    ): AnyDomainEvent {
      return {
        id: 'event-access',
        type,
        occurredAt: TIMESTAMP,
        actor,
        scope: { organizationId: ORG, projectId: 'p1' },
        payload: {
          accessId: 'a1',
          userId: 'ana',
          roleId: 'project-reporter',
          scope: 'project',
          status: 'active',
          previousRoleId: 'project-guest',
          previousStatus: 'active',
          ...overrides,
        },
      } as AnyDomainEvent;
    }

    beforeEach(() => {
      directory.users = [
        { userId: 'ana', username: 'ana', email: 'ana@example.com', disabled: false },
        { userId: 'carl', username: 'carl', email: 'carl@example.com', disabled: true },
      ];
      directory.names = { [ORG]: 'Kettu', p1: 'Web', 'project-reporter': 'Reporter' };
    });

    it.each(['access.granted', 'access.updated', 'access.revoked'] as const)(
      'tells the affected user about %s',
      async (type) => {
        await engine.handle(accessEvent(type));
        expect(notifier.system).toHaveLength(1);
        expect(notifier.system[0]).toMatchObject({
          recipient: { userId: 'ana', email: 'ana@example.com' },
          kind: type.replace('.', '_'),
          names: { organization: 'Kettu', project: 'Web', role: 'Reporter' },
        });
      },
    );

    it('does not notify the user who made the change', async () => {
      await engine.handle(accessEvent('access.granted', {}, { kind: 'user', userId: 'ana' }));
      expect(notifier.system).toHaveLength(0);
    });

    it('skips invitations, unchanged roles and disabled users', async () => {
      await engine.handle(accessEvent('access.granted', { status: 'invited' }));
      await engine.handle(accessEvent('access.updated', { previousRoleId: 'project-reporter' }));
      await engine.handle(accessEvent('access.revoked', { userId: 'carl' }));
      expect(notifier.system).toHaveLength(0);
    });

    it('warns the owner of a new personal API key, not of project keys', async () => {
      const apiKeyEvent = (projectId: string | null): AnyDomainEvent => ({
        id: 'event-key',
        type: 'api_key.created',
        occurredAt: TIMESTAMP,
        actor: { kind: 'system' },
        scope: { organizationId: null, projectId },
        payload: { apiKeyId: 'k1', name: 'laptop', keyPrefix: 'gvs_abc', projectId, userId: 'ana' },
      });

      await engine.handle(apiKeyEvent('p1'));
      expect(notifier.system).toHaveLength(0);

      await engine.handle(apiKeyEvent(null));
      expect(notifier.system).toMatchObject([
        { kind: 'api_key_created', recipient: { userId: 'ana' } },
      ]);
    });

    it('runs before the alerts of the same event', async () => {
      const order: string[] = [];
      notifier.sendSystemNotification = async () => void order.push('system');
      notifier.sendAlert = async () => void order.push('alert');
      repository.rows = [
        alertRow({
          eventType: 'access.granted',
          scope: 'organization',
          projectId: null,
          conditions: [],
          recipients: { userIds: ['eli'], roleIds: [] },
        }),
      ];

      await engine.handle(accessEvent('access.granted'));
      expect(order).toEqual(['system', 'alert']);
    });
  });
});
