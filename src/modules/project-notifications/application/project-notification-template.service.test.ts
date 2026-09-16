import { describe, expect, it, vi } from 'vitest';
import type { ProjectNotificationTemplateRepository } from '../infrastructure/repositories/project-notification-template.repository';
import { ProjectNotificationTemplateService } from './project-notification-template.service';

vi.mock('../infrastructure/crypto/target-credential-cipher', () => ({
  encryptTargetCredential: vi.fn((_id, _provider, credential) => `encrypted:${credential}`),
  decryptTargetCredential: vi.fn((_id, _provider, stored) => stored.replace('encrypted:', '')),
}));

function setup() {
  const rows = new Map<string, any>();
  const repository = {
    findBySlug: vi.fn(async (_projectId, provider, slug) =>
      [...rows.values()].find((row) => row.provider === provider && row.slug === slug),
    ),
    findByProjectId: vi.fn(async () => [...rows.values()]),
    findById: vi.fn(async (id) => rows.get(id) ?? null),
    create: vi.fn(async (input) => rows.set(input.id, { ...input, toJson: () => input })),
    update: vi.fn(async () => undefined),
    deleteById: vi.fn(async () => undefined),
  } as unknown as ProjectNotificationTemplateRepository;
  return { repository, service: new ProjectNotificationTemplateService(repository) };
}

describe('ProjectNotificationTemplateService', () => {
  it('creates one default template for every target', async () => {
    const { repository, service } = setup();

    await service.ensureDefaults('project-1');

    expect(repository.create).toHaveBeenCalledTimes(4);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'http',
        slug: 'default-http',
        format: 'json',
        httpConfigEncrypted: expect.stringContaining('cloud.getgitops.com'),
        system: true,
      }),
    );
  });

  it('generates a slug from the template name', async () => {
    const { repository, service } = setup();

    await service.create('project-1', {
      provider: 'slack',
      name: 'Critical Alerts',
      content: '{{event.name}}',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'critical-alerts' }),
    );
  });

  it('normalizes default recipients for email templates', async () => {
    const { repository, service } = setup();

    await service.create('project-1', {
      provider: 'mail',
      name: 'Operations email',
      content: '<p>{{event.name}}</p>',
      recipients: ' OPS@example.com, owner@example.com, ops@example.com ',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ recipients: ['ops@example.com', 'owner@example.com'] }),
    );
  });

  it('rejects invalid HTTP JSON templates', async () => {
    const { service } = setup();

    await expect(
      service.create('project-1', { provider: 'http', name: 'Broken', content: '{broken}' }),
    ).rejects.toThrow();
  });

  it('allows arbitrary text in HTTP text templates', async () => {
    const { repository, service } = setup();

    await service.create('project-1', {
      provider: 'http',
      name: 'Plain text webhook',
      content: 'event={{event.name}}',
      format: 'text',
      httpConfig: {
        url: 'https://example.com/webhook',
        method: 'POST',
        headers: '{}',
      },
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'text', content: 'event={{event.name}}' }),
    );
  });

  it('normalizes and encrypts HTTP URL, method, and headers with the template', async () => {
    const { repository, service } = setup();

    await service.create('project-1', {
      provider: 'http',
      name: 'Deployment webhook',
      content: '{"event":"{{event.name}}"}',
      format: 'json',
      httpConfig: {
        url: 'https://example.com/hooks/deploy',
        method: 'patch',
        headers: '{"Authorization":"Bearer secret"}',
      },
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'json',
        httpConfigEncrypted: expect.stringContaining('"url":"https://example.com/hooks/deploy"'),
      }),
    );
  });

  it('renders common variables with the target default template', async () => {
    const { service } = setup();
    await service.ensureDefaults('project-1');

    const rendered = await service.render('project-1', 'slack', null, {
      'rule.name': 'Critical alerts',
      'event.name': 'analysis.completed',
      'event.payload': '{"critical":1}',
    });

    expect(rendered).toContain('Critical alerts');
    expect(rendered).toContain('analysis.completed');
    expect(rendered).toContain('{"critical":1}');
  });
});
