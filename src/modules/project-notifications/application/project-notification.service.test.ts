import { describe, expect, it, vi } from 'vitest';
import { ProjectNotificationDomain } from '../domain/project-notification.domain';
import type { ProjectNotificationRepository } from '../infrastructure/repositories/project-notification.repository';
import { ProjectNotificationService } from './project-notification.service';

function setup(existing?: ProjectNotificationDomain) {
  const repository = {
    create: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    deleteById: vi.fn(async () => undefined),
    findById: vi.fn(async () => existing ?? null),
    findByProjectId: vi.fn(async () => []),
    listDeliveries: vi.fn(async () => []),
  } as unknown as ProjectNotificationRepository;

  return { repository, service: new ProjectNotificationService(repository) };
}

describe('ProjectNotificationService', () => {
  it('normalizes and deduplicates mail recipients', async () => {
    const { repository, service } = setup();

    await service.create('project-1', {
      name: ' Vault changes ',
      eventName: 'vault.environment.updated',
      description: '  Only production changes  ',
      filters: [{ field: 'slug', operator: 'equals', value: ' production ' }],
      recipients: ' OPS@example.com, owner@example.com, ops@example.com ',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        name: 'Vault changes',
        description: 'Only production changes',
        filters: [{ field: 'slug', operator: 'equals', value: 'production' }],
        recipients: ['ops@example.com', 'owner@example.com'],
        enabled: true,
      }),
    );
  });

  it('rejects properties that do not belong to the selected event', async () => {
    const { service } = setup();

    await expect(
      service.create('project-1', {
        name: 'Invalid filter',
        eventName: 'vault.environment.updated',
        filters: [{ field: 'roleSlug', operator: 'equals', value: 'admin' }],
        recipients: 'ops@example.com',
      }),
    ).rejects.toThrow('Unsupported filter field: roleSlug');
  });

  it('rejects events outside the project notification catalog', async () => {
    const { service } = setup();

    await expect(
      service.create('project-1', {
        name: 'Organization changes',
        eventName: 'organization.updated',
        recipients: 'ops@example.com',
      }),
    ).rejects.toThrow('Unsupported project event');
  });

  it('does not mutate a rule belonging to another project', async () => {
    const rule = new ProjectNotificationDomain({
      id: 'notification-1',
      projectId: 'project-2',
      name: 'Vault changes',
      eventName: 'vault.environment.updated',
      recipients: ['ops@example.com'],
    });
    const { repository, service } = setup(rule);

    await expect(service.setEnabled(rule.id, 'project-1', false)).rejects.toThrow(
      'Notification rule not found',
    );
    expect(repository.update).not.toHaveBeenCalled();
  });
});
