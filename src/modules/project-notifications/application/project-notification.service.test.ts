import { describe, expect, it, vi } from 'vitest';
import { ProjectNotificationDomain } from '../domain/project-notification.domain';
import type { ProjectNotificationRepository } from '../infrastructure/repositories/project-notification.repository';
import type { ProjectNotificationTemplateRepository } from '../infrastructure/repositories/project-notification-template.repository';
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
  const templateRepository = {
    findById: vi.fn(async () => null),
  } as unknown as ProjectNotificationTemplateRepository;

  return {
    repository,
    templateRepository,
    service: new ProjectNotificationService(repository, templateRepository),
  };
}

describe('ProjectNotificationService', () => {
  it('maps legacy single-target rules to one destination', () => {
    const rule = new ProjectNotificationDomain({
      id: 'notification-1',
      projectId: 'project-1',
      eventName: 'vault.environment.updated',
      channel: 'google-chat',
      templateId: 'template-1',
      providerConfig: {},
      recipients: [],
    });

    expect(rule.destinations).toEqual([
      {
        channel: 'google-chat',
        templateId: 'template-1',
        providerConfig: {},
        recipients: [],
      },
    ]);
  });

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

  it('stores the Slack channel on the notification rule', async () => {
    const { repository, service } = setup();

    await service.create('project-1', {
      name: 'Slack alerts',
      eventName: 'vault.environment.updated',
      channel: 'slack',
      providerConfig: { channel: '#alerts' },
      recipients: '',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'slack',
        providerConfig: { channel: '#alerts' },
        recipients: [],
      }),
    );
  });

  it('creates a Google Chat rule without a per-rule channel', async () => {
    const { repository, service } = setup();

    await service.create('project-1', {
      name: 'Google Chat alerts',
      eventName: 'vault.environment.updated',
      channel: 'google-chat',
      providerConfig: {},
      recipients: '',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'google-chat',
        providerConfig: {},
        recipients: [],
      }),
    );
  });

  it('stores a template belonging to the selected target', async () => {
    const { repository, templateRepository, service } = setup();
    vi.mocked(templateRepository.findById).mockResolvedValueOnce({
      id: 'template-1',
      projectId: 'project-1',
      provider: 'mail',
    } as never);

    await service.create('project-1', {
      name: 'Email alerts',
      eventName: 'vault.environment.updated',
      channel: 'mail',
      templateId: 'template-1',
      recipients: '',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'template-1', recipients: [] }),
    );
  });

  it('rejects a template belonging to another target', async () => {
    const { templateRepository, service } = setup();
    vi.mocked(templateRepository.findById).mockResolvedValueOnce({
      id: 'template-1',
      projectId: 'project-1',
      provider: 'slack',
    } as never);

    await expect(
      service.create('project-1', {
        name: 'Email alerts',
        eventName: 'vault.environment.updated',
        channel: 'mail',
        templateId: 'template-1',
        recipients: '',
      }),
    ).rejects.toThrow('Notification template does not belong to this target');
  });

  it('stores multiple unique destinations on one rule', async () => {
    const { repository, service } = setup();

    await service.create('project-1', {
      name: 'Multi target alert',
      eventName: 'vault.environment.updated',
      recipients: '',
      destinations: [
        {
          channel: 'mail',
          recipients: ['ops@example.com'],
          templateId: null,
          providerConfig: {},
        },
        {
          channel: 'slack',
          recipients: [],
          templateId: null,
          providerConfig: { channel: '#alerts' },
        },
      ],
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        destinations: [
          expect.objectContaining({ channel: 'mail', recipients: ['ops@example.com'] }),
          expect.objectContaining({
            channel: 'slack',
            providerConfig: { channel: '#alerts' },
          }),
        ],
      }),
    );
  });

  it('rejects duplicate destinations on one rule', async () => {
    const { service } = setup();

    await expect(
      service.create('project-1', {
        name: 'Duplicate target alert',
        eventName: 'vault.environment.updated',
        recipients: '',
        destinations: [
          { channel: 'google-chat', recipients: [], providerConfig: {} },
          { channel: 'google-chat', recipients: [], providerConfig: {} },
        ],
      }),
    ).rejects.toThrow('A notification rule cannot repeat a destination');
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

  it('preserves the enabled state when editing a rule', async () => {
    const rule = new ProjectNotificationDomain({
      id: 'notification-1',
      projectId: 'project-1',
      name: 'Old name',
      eventName: 'vault.environment.updated',
      recipients: ['ops@example.com'],
      enabled: false,
    });
    const { repository, service } = setup(rule);

    await service.update(rule.id, rule.projectId, {
      name: 'New name',
      eventName: rule.eventName,
      recipients: rule.recipients,
    });

    expect(repository.update).toHaveBeenCalledWith(
      rule.id,
      expect.objectContaining({ name: 'New name', enabled: false }),
    );
  });
});
