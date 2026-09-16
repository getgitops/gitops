import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CodeReportAnalysisFailedEvent,
  OrganizationUserAssignedEvent,
  VaultEnvironmentCreatedEvent,
} from '$modules/events';
import { ProjectNotificationDomain } from '../domain/project-notification.domain';
import type { ProjectNotificationRepository } from '../infrastructure/repositories/project-notification.repository';

const send = vi.fn(async () => undefined);

vi.mock('$lib/server/infra/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/server/infra/notifications')>();
  return { ...actual, notify: send };
});

const { ProjectNotificationSubscriber } = await import('./project-notification.subscriber');

function setup() {
  const rule = new ProjectNotificationDomain({
    id: 'notification-1',
    projectId: 'project-1',
    name: 'Environment created',
    eventName: 'vault.environment.created',
    recipients: ['ops@example.com'],
  });
  const repository = {
    findEnabledByProjectAndEvent: vi.fn(async () => [rule]),
    findEnabledByEvent: vi.fn(async () => [rule]),
    createDelivery: vi.fn(async () => undefined),
    finishDelivery: vi.fn(async () => undefined),
  } as unknown as ProjectNotificationRepository;
  return { repository, subscriber: new ProjectNotificationSubscriber(repository) };
}

describe('ProjectNotificationSubscriber', () => {
  beforeEach(() => send.mockReset());

  it('sends matching mail rules and marks their delivery as sent', async () => {
    const { repository, subscriber } = setup();
    const event = new VaultEnvironmentCreatedEvent({
      projectId: 'project-1',
      environmentId: 'environment-1',
      name: 'Production',
      slug: 'production',
    });

    await subscriber.handle(event);

    expect(repository.findEnabledByProjectAndEvent).toHaveBeenCalledWith(
      'project-1',
      'vault.environment.created',
    );
    expect(send).toHaveBeenCalledOnce();
    expect(repository.createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: event.id, notificationId: 'notification-1' }),
    );
    expect(repository.finishDelivery).toHaveBeenCalledWith(expect.any(String), 'sent');
  });

  it('records a failed delivery when the transport rejects', async () => {
    send.mockRejectedValueOnce(new Error('SMTP unavailable'));
    const { repository, subscriber } = setup();

    await expect(
      subscriber.handle(
        new VaultEnvironmentCreatedEvent({
          projectId: 'project-1',
          environmentId: 'environment-1',
          name: 'Production',
          slug: 'production',
        }),
      ),
    ).rejects.toThrow('SMTP unavailable');
    expect(repository.finishDelivery).toHaveBeenCalledWith(
      expect.any(String),
      'failed',
      'SMTP unavailable',
    );
  });

  it('resolves Code Report events through their service', async () => {
    const { repository } = setup();
    const projectResolver = { getById: vi.fn(async () => ({ projectId: 'project-1' })) };
    const subscriber = new ProjectNotificationSubscriber(repository, projectResolver);

    await subscriber.handle(
      new CodeReportAnalysisFailedEvent({
        analysisId: 'analysis-1',
        serviceId: 'service-1',
        tool: 'trivy',
        error: 'Scan failed',
        failedAt: new Date().toISOString(),
      }),
    );

    expect(projectResolver.getById).toHaveBeenCalledWith('service-1');
    expect(repository.findEnabledByProjectAndEvent).toHaveBeenCalledWith(
      'project-1',
      'code-report.analysis.failed',
    );
  });

  it('does not deliver when a rule condition does not match', async () => {
    const { repository, subscriber } = setup();
    vi.mocked(repository.findEnabledByProjectAndEvent).mockResolvedValueOnce([
      new ProjectNotificationDomain({
        id: 'notification-1',
        projectId: 'project-1',
        name: 'Production only',
        eventName: 'vault.environment.created',
        filters: [{ field: 'slug', operator: 'equals', value: 'production' }],
        recipients: ['ops@example.com'],
      }),
    ]);

    await subscriber.handle(
      new VaultEnvironmentCreatedEvent({
        projectId: 'project-1',
        environmentId: 'environment-1',
        name: 'Staging',
        slug: 'staging',
      }),
    );

    expect(send).not.toHaveBeenCalled();
  });

  it('matches organization rules by project organization and role slug', async () => {
    const { repository } = setup();
    vi.mocked(repository.findEnabledByEvent).mockResolvedValueOnce([
      new ProjectNotificationDomain({
        id: 'notification-1',
        projectId: 'project-1',
        name: 'New administrators',
        eventName: 'organization.user.assigned',
        filters: [{ field: 'roleSlug', operator: 'equals', value: 'admin' }],
        recipients: ['ops@example.com'],
      }),
    ]);
    const projectLookup = {
      getProject: vi.fn(async () => ({ organization: { id: 'organization-1' } })),
    };
    const subscriber = new ProjectNotificationSubscriber(repository, undefined, projectLookup);

    await subscriber.handle(
      new OrganizationUserAssignedEvent({
        organizationId: 'organization-1',
        userId: 'user-1',
        roleId: 'role-1',
        roleName: 'Administrator',
        roleSlug: 'admin',
        accessId: 'access-1',
        origin: 'assigned',
      }),
    );

    expect(send).toHaveBeenCalledOnce();
    expect(projectLookup.getProject).toHaveBeenCalledWith('project-1');
  });
});
