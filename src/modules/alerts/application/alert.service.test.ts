import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createNotificationsFixture } from '#modules/notifications/application/testing';
import { AlertValidationError, type AlertInput, type AlertLocation } from '../domain/alert.domain';
import { InMemoryAlertRepository } from '../infrastructure/repositories/in-memory-alert.repository';
import { AlertService } from './alert.service';
import { FakeAlertDirectory, actor } from './testing';

const ORG = 'org-1';
const orgLocation: AlertLocation = { scope: 'organization', organizationId: ORG, projectId: null };
const projectLocation: AlertLocation = { scope: 'project', organizationId: ORG, projectId: 'p1' };

function guidedExample(overrides: AlertInput = {}): AlertInput {
  return {
    name: 'Críticas en api-gateway',
    eventType: 'code_report.analysis.completed',
    match: 'all',
    conditions: [
      { field: 'serviceId', operator: 'eq', value: 'svc-gateway' },
      { field: 'summary.critical', operator: 'gt', value: '0' },
    ],
    recipients: { userIds: [], roleIds: ['role-project-admin'] },
    throttleMinutes: 30,
    ...overrides,
  };
}

async function validationErrors(promise: Promise<unknown>) {
  const error = await promise.catch((caught) => caught);
  expect(error).toBeInstanceOf(AlertValidationError);
  return (error as AlertValidationError).errors;
}

describe('AlertService', () => {
  let repository: InMemoryAlertRepository;
  let directory: FakeAlertDirectory;
  let onChange: Mock<() => void>;
  let service: AlertService;

  beforeEach(async () => {
    const notifications = createNotificationsFixture();
    await notifications.settings.setAllowedDomains(ORG, ['example.com']);
    repository = new InMemoryAlertRepository();
    directory = new FakeAlertDirectory();
    directory.members = [
      {
        organizationId: ORG,
        projectId: 'p1',
        userId: 'u1',
        username: 'ana',
        email: 'ana@x.io',
        disabled: false,
        roleIds: [],
      },
    ];
    directory.roles = [
      { organizationId: ORG, projectId: 'p1', id: 'role-project-admin', name: 'Project Admin' },
      { organizationId: ORG, projectId: 'p2', id: 'role-other-project', name: 'Project Admin' },
      { organizationId: ORG, id: 'role-org-admin', name: 'Org Admin' },
    ];
    directory.references = [
      {
        organizationId: ORG,
        projectId: 'p1',
        reference: 'code_report_service',
        id: 'svc-gateway',
        label: 'api-gateway',
      },
      {
        organizationId: ORG,
        projectId: 'p2',
        reference: 'code_report_service',
        id: 'svc-other',
        label: 'web',
      },
      { organizationId: ORG, projectId: 'p1', reference: 'project', id: 'p1', label: 'Kettu' },
      { organizationId: ORG, projectId: 'p2', reference: 'project', id: 'p2', label: 'Other' },
    ];
    onChange = vi.fn();
    service = new AlertService(repository, directory, {
      generateId: () => 'alert-1',
      now: () => new Date('2026-11-20T10:00:00.000Z'),
      onChange,
      externalRecipients: notifications.recipients,
    });
  });

  it('creates the guided example with normalized values', async () => {
    const alert = await service.create(projectLocation, guidedExample(), actor('u1'));

    expect(alert.toJson()).toMatchObject({
      id: 'alert-1',
      scope: 'project',
      organizationId: ORG,
      projectId: 'p1',
      enabled: true,
      channels: ['mail'],
      throttleMinutes: 30,
      createdByUserId: 'u1',
      conditions: [
        { field: 'serviceId', operator: 'eq', value: 'svc-gateway' },
        { field: 'summary.critical', operator: 'gt', value: 0 },
      ],
    });
    expect(repository.rows).toHaveLength(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('reports every invalid field at once', async () => {
    const errors = await validationErrors(
      service.create(
        projectLocation,
        { name: ' ', match: 'some', recipients: {}, throttleMinutes: -1, channels: ['sms'] },
        actor(),
      ),
    );
    expect(errors).toEqual({
      name: 'required',
      match: 'invalid',
      eventType: 'required',
      recipients: 'required',
      throttleMinutes: 'invalid',
      channels: 'invalid_channel',
    });
    expect(repository.rows).toHaveLength(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  describe('event type', () => {
    it('rejects unknown and non-alertable events', async () => {
      expect(
        await validationErrors(
          service.create(orgLocation, guidedExample({ eventType: 'nope' }), actor()),
        ),
      ).toEqual({
        eventType: 'unknown_event',
      });
    });

    it('rejects organization events on a project alert', async () => {
      const errors = await validationErrors(
        service.create(
          projectLocation,
          guidedExample({ eventType: 'organization.updated', conditions: [] }),
          actor(),
        ),
      );
      expect(errors.eventType).toBe('scope_mismatch');
    });

    it('accepts a project event on an organization alert', async () => {
      await expect(
        service.create(
          orgLocation,
          guidedExample({ recipients: { roleIds: ['role-org-admin'] } }),
          actor(),
        ),
      ).resolves.toBeDefined();
    });

    it('refuses an author who cannot read the event (anti-escalation)', async () => {
      const errors = await validationErrors(
        service.create(
          projectLocation,
          guidedExample(),
          actor('u1', ['project:vault:secrets:read']),
        ),
      );
      expect(errors.eventType).toBe('forbidden');
    });

    it('accepts organization:projects:read for project events of an organization alert', async () => {
      await expect(
        service.create(
          orgLocation,
          guidedExample({ recipients: { roleIds: ['role-org-admin'] } }),
          actor('u1', ['organization:projects:read']),
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('conditions', () => {
    async function conditionErrors(conditions: unknown, location = projectLocation) {
      return validationErrors(service.create(location, guidedExample({ conditions }), actor()));
    }

    it('rejects unknown fields', async () => {
      expect(
        await conditionErrors([{ field: 'summary.secrets', operator: 'gt', value: 0 }]),
      ).toEqual({
        'conditions.0.field': 'unknown_field',
      });
    });

    it('rejects operators the field does not allow', async () => {
      expect(
        await conditionErrors([{ field: 'summary.critical', operator: 'contains', value: '1' }]),
      ).toEqual({
        'conditions.0.operator': 'invalid_operator',
      });
    });

    it('rejects values of the wrong type', async () => {
      expect(
        await conditionErrors([
          { field: 'summary.critical', operator: 'gt', value: 'many' },
          { field: 'tool', operator: 'eq', value: 'unknown-scanner' },
          { field: 'gitInfo.branch', operator: 'eq', value: '' },
          { field: 'tool', operator: 'in', value: [] },
        ]),
      ).toEqual({
        'conditions.0.value': 'invalid',
        'conditions.1.value': 'unknown_option',
        'conditions.2.value': 'required',
        'conditions.3.value': 'required',
      });
    });

    it('drops the value of valueless operators', async () => {
      const alert = await service.create(
        projectLocation,
        guidedExample({
          conditions: [{ field: 'hasVulnerabilities', operator: 'is_true', value: 'x' }],
        }),
        actor(),
      );
      expect(alert.conditions).toEqual([{ field: 'hasVulnerabilities', operator: 'is_true' }]);
    });

    it('rejects a reference from another project', async () => {
      expect(
        await conditionErrors([{ field: 'serviceId', operator: 'eq', value: 'svc-other' }]),
      ).toEqual({
        'conditions.0.value': 'unknown_reference',
      });
    });

    it('accepts references of any project of the organization on an organization alert', async () => {
      const alert = await service.create(
        orgLocation,
        guidedExample({
          conditions: [
            { field: 'serviceId', operator: 'in', value: ['svc-gateway', 'svc-other'] },
            { field: 'projectId', operator: 'eq', value: 'p2' },
          ],
          recipients: { roleIds: ['role-org-admin'] },
        }),
        actor(),
      );
      expect(alert.conditions).toHaveLength(2);
    });

    it('only offers the project field to organization alerts', async () => {
      expect(await conditionErrors([{ field: 'projectId', operator: 'eq', value: 'p1' }])).toEqual({
        'conditions.0.field': 'unknown_field',
      });
    });

    it('limits the number of conditions', async () => {
      const many = Array.from({ length: 21 }, () => ({
        field: 'summary.critical',
        operator: 'gt',
        value: 0,
      }));
      expect(await conditionErrors(many)).toEqual({ conditions: 'too_many' });
    });
  });

  describe('channels', () => {
    it('keeps the targets of every enabled channel and normalizes them', async () => {
      const alert = await service.create(
        projectLocation,
        guidedExample({
          channels: ['mail', 'slack', 'google_chat', 'webhook'],
          recipients: {
            roleIds: ['role-project-admin'],
            emails: [' Ops@Example.com ', 'ops@example.com'],
            slackChannels: ['Alerts', '#alerts'],
            googleChatSpaces: ['Incidencias'],
            webhookUrls: ['https://hooks.example.com/gitops'],
          },
        }),
        actor(),
      );
      expect(alert.channels).toEqual(['mail', 'slack', 'google_chat', 'webhook']);
      expect(alert.recipients).toMatchObject({
        emails: ['ops@example.com'],
        slackChannels: ['#alerts'],
        googleChatSpaces: ['Incidencias'],
        webhookUrls: ['https://hooks.example.com/gitops'],
      });
    });

    it('drops the targets of disabled channels', async () => {
      const alert = await service.create(
        projectLocation,
        guidedExample({
          channels: ['slack'],
          recipients: { roleIds: ['role-project-admin'], slackChannels: ['#alerts'] },
        }),
        actor(),
      );
      expect(alert.recipients.roleIds).toEqual([]);
      expect(alert.recipients.slackChannels).toEqual(['#alerts']);
    });

    it('requires a valid target for each enabled channel', async () => {
      const errors = await validationErrors(
        service.create(
          projectLocation,
          guidedExample({
            channels: ['mail', 'slack', 'google_chat', 'webhook'],
            recipients: {
              emails: ['not-an-email'],
              slackChannels: ['bad channel!'],
              webhookUrls: ['ftp://example.com'],
            },
          }),
          actor(),
        ),
      );
      expect(errors).toEqual({
        'recipients.emails': 'invalid_email',
        'recipients.emails.0': 'invalid_email',
        'recipients.slackChannels': 'invalid_slack_channel',
        'recipients.googleChatSpaces': 'required',
        'recipients.webhookUrls': 'invalid_url',
      });
    });

    it('accepts external addresses as the only mail targets', async () => {
      const alert = await service.create(
        projectLocation,
        guidedExample({ recipients: { emails: ['oncall@example.com'] } }),
        actor(),
      );
      expect(alert.recipients.emails).toEqual(['oncall@example.com']);
    });
  });

  describe('recipients', () => {
    it('removes an external address from every alert of the organization', async () => {
      const alert = await service.create(
        projectLocation,
        guidedExample({ recipients: { emails: ['typo@example.com', 'ops@example.com'] } }),
        actor(),
      );
      repository.rows.push(
        {
          ...alert.toJson(),
          id: 'alert-2',
          recipients: { ...alert.recipients, emails: ['typo@example.com'] },
        },
        { ...alert.toJson(), id: 'other-org', organizationId: 'org-2' },
      );
      onChange.mockClear();

      expect(await service.removeEmail(ORG, 'typo@example.com')).toBe(2);
      const emails = (id: string) =>
        repository.rows.find((row) => row.id === id)?.recipients.emails;
      expect(emails('alert-1')).toEqual(['ops@example.com']);
      expect(emails('alert-2')).toEqual([]);
      expect(emails('other-org')).toEqual(['typo@example.com', 'ops@example.com']);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('rejects users and roles outside the location', async () => {
      const errors = await validationErrors(
        service.create(
          projectLocation,
          guidedExample({ recipients: { userIds: ['stranger'], roleIds: ['role-other-project'] } }),
          actor(),
        ),
      );
      expect(errors).toEqual({
        'recipients.userIds': 'unknown_user',
        'recipients.roleIds': 'unknown_role',
      });
    });

    it('accepts organization roles on a project alert', async () => {
      await expect(
        service.create(
          projectLocation,
          guidedExample({ recipients: { roleIds: ['role-org-admin'] } }),
          actor(),
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('update and delete', () => {
    it('merges a partial update and validates the result', async () => {
      await service.create(projectLocation, guidedExample(), actor());

      const updated = await service.update('alert-1', { enabled: false, name: 'Renamed' }, actor());
      expect(updated).toMatchObject({ enabled: false, name: 'Renamed', throttleMinutes: 30 });
      expect(repository.rows[0]).toMatchObject({ enabled: false, name: 'Renamed' });

      const errors = await validationErrors(
        service.update('alert-1', { throttleMinutes: 99999 }, actor()),
      );
      expect(errors).toEqual({ throttleMinutes: 'invalid' });
      expect(onChange).toHaveBeenCalledTimes(2);
    });

    it('deletes alerts and fails on unknown ids', async () => {
      await service.create(projectLocation, guidedExample(), actor());
      await service.delete('alert-1');
      expect(repository.rows).toHaveLength(0);
      await expect(service.delete('alert-1')).rejects.toThrow(/not found/);
    });
  });

  describe('listing', () => {
    it('separates organization alerts from project alerts and finds inherited ones', async () => {
      let id = 0;
      service = new AlertService(repository, directory, { generateId: () => `a${++id}` });
      const orgActor = actor();
      await service.create(projectLocation, guidedExample({ name: 'project' }), orgActor);
      await service.create(
        orgLocation,
        guidedExample({ name: 'all projects', recipients: { roleIds: ['role-org-admin'] } }),
        orgActor,
      );
      await service.create(
        orgLocation,
        guidedExample({
          name: 'only p2',
          conditions: [{ field: 'projectId', operator: 'eq', value: 'p2' }],
          recipients: { roleIds: ['role-org-admin'] },
        }),
        orgActor,
      );
      await service.create(
        orgLocation,
        guidedExample({
          name: 'org event',
          eventType: 'organization.updated',
          conditions: [],
          recipients: { roleIds: ['role-org-admin'] },
        }),
        orgActor,
      );

      expect(
        (await service.list({ organizationId: ORG, projectId: 'p1' })).map((a) => a.name),
      ).toEqual(['project']);
      expect(
        (await service.list({ organizationId: ORG, projectId: null })).map((a) => a.name),
      ).toEqual(['all projects', 'only p2', 'org event']);
      expect((await service.listInherited(ORG, 'p1')).map((a) => a.name)).toEqual(['all projects']);
      expect((await service.listInherited(ORG, 'p2')).map((a) => a.name)).toEqual([
        'all projects',
        'only p2',
      ]);
    });
  });
});
