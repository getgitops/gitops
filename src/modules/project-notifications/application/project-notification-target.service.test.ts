import { describe, expect, it, vi } from 'vitest';
import { ProjectNotificationTargetDomain } from '../domain/project-notification-target.domain';
import type { ProjectNotificationTargetRepository } from '../infrastructure/repositories/project-notification-target.repository';
import type { ProjectNotificationTemplateRepository } from '../infrastructure/repositories/project-notification-template.repository';
import { ProjectNotificationTargetService } from './project-notification-target.service';

vi.mock('../infrastructure/crypto/target-credential-cipher', () => ({
  encryptTargetCredential: vi.fn((_id, _provider, credential) => `encrypted:${credential}`),
  decryptTargetCredential: vi.fn(() => 'decrypted-credential'),
}));

function setup(existing: ProjectNotificationTargetDomain | null = null) {
  const repository = {
    findByProjectId: vi.fn(async () => (existing ? [existing] : [])),
    findByProjectAndProvider: vi.fn(async () => existing),
    create: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
  } as unknown as ProjectNotificationTargetRepository;
  const templateRepository = {
    findById: vi.fn(async () => null),
  } as unknown as ProjectNotificationTemplateRepository;
  return {
    repository,
    templateRepository,
    service: new ProjectNotificationTargetService(repository, templateRepository),
  };
}

describe('ProjectNotificationTargetService', () => {
  it('returns HTTP as available but not configured before it is enabled', async () => {
    const { service } = setup();

    const http = (await service.list('project-1')).find((item) => item.id === 'http');

    expect(http?.configured).toBe(false);
    expect(http?.enabled).toBe(true);
  });

  it('does not expose encrypted tokens in target listings', async () => {
    const target = new ProjectNotificationTargetDomain({
      id: 'target-1',
      projectId: 'project-1',
      provider: 'slack',
      credentialEncrypted: 'encrypted:xoxb-secret',
      enabled: true,
    });
    const { service } = setup(target);

    const slack = (await service.list('project-1')).find((item) => item.id === 'slack');

    expect(slack).toMatchObject({ configured: true, hasCredential: true });
    expect(slack?.credential).toBeNull();
    expect(slack).not.toHaveProperty('credentialEncrypted');
  });

  it('exposes decrypted credentials only when explicitly requested', async () => {
    const target = new ProjectNotificationTargetDomain({
      id: 'target-1',
      projectId: 'project-1',
      provider: 'google-chat',
      credentialEncrypted: 'encrypted:webhook',
      enabled: true,
    });
    const { service } = setup(target);

    const googleChat = (await service.list('project-1', { includeCredentials: true })).find(
      (item) => item.id === 'google-chat',
    );

    expect(googleChat?.credential).toBe('decrypted-credential');
  });

  it('does not mark a disabled target as configured', async () => {
    const target = new ProjectNotificationTargetDomain({
      id: 'target-1',
      projectId: 'project-1',
      provider: 'slack',
      credentialEncrypted: 'encrypted:xoxb-secret',
      enabled: false,
    });
    const { service } = setup(target);

    const slack = (await service.list('project-1')).find((item) => item.id === 'slack');

    expect(slack).toMatchObject({ configured: false, hasCredential: true, enabled: false });
  });

  it('preserves an existing token when the update leaves it blank', async () => {
    const target = new ProjectNotificationTargetDomain({
      id: 'target-1',
      projectId: 'project-1',
      provider: 'slack',
      credentialEncrypted: 'encrypted:existing',
      enabled: true,
    });
    const { repository, service } = setup(target);

    await service.save('project-1', {
      provider: 'slack',
      credential: '',
      enabled: false,
    });

    expect(repository.update).toHaveBeenCalledWith('target-1', { enabled: false });
  });

  it('does not store or validate an API URL for Slack', async () => {
    const { repository, service } = setup();

    await service.save('project-1', {
      provider: 'slack',
      credential: 'secret',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ url: expect.anything() }),
    );
  });

  it('stores a complete Google Chat webhook as an encrypted credential', async () => {
    const { repository, service } = setup();
    const webhook =
      'https://chat.googleapis.com/v1/spaces/AAAA/messages?key=key-value&token=token-value';

    await service.save('project-1', {
      provider: 'google-chat',
      credential: webhook,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ credentialEncrypted: `encrypted:${webhook}` }),
    );
  });

  it('enables HTTP without storing connection details on the target', async () => {
    const { repository, service } = setup();

    await service.save('project-1', {
      provider: 'http',
      enabled: true,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'http',
        credentialEncrypted: '',
        enabled: true,
      }),
    );
  });

  it('rejects incomplete Google Chat webhook URLs', async () => {
    const { service } = setup();

    await expect(
      service.save('project-1', {
        provider: 'google-chat',
        credential: 'https://chat.googleapis.com/v1/spaces/AAAA/messages',
      }),
    ).rejects.toThrow('Google Chat webhook must include key and token parameters');
  });

  it('rejects a default template belonging to another target', async () => {
    const { service, templateRepository } = setup();
    vi.mocked(templateRepository.findById).mockResolvedValueOnce({
      id: 'template-1',
      projectId: 'project-1',
      provider: 'mail',
    } as never);

    await expect(service.setDefaultTemplate('project-1', 'slack', 'template-1')).rejects.toThrow(
      'Notification template does not belong to this target',
    );
  });
});
