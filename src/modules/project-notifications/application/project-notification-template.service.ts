import crypto from 'crypto';
import type { ProjectNotificationChannel } from '../domain/project-notification.domain';
import type { ProjectNotificationTemplateRepository } from '../infrastructure/repositories/project-notification-template.repository';

const DEFAULT_TEMPLATES: Array<{
  provider: ProjectNotificationChannel;
  name: string;
  slug: string;
  content: string;
  recipients: string[];
}> = [
  {
    provider: 'mail',
    name: 'Default email',
    slug: 'default-email',
    content:
      '<h1>{{rule.name}}</h1><p>The event <strong>{{event.name}}</strong> occurred.</p><pre>{{event.payload}}</pre>',
    recipients: [],
  },
  {
    provider: 'slack',
    name: 'Default Slack',
    slug: 'default-slack',
    content: '*{{rule.name}}*\nEvent: `{{event.name}}`\n```{{event.payload}}```',
    recipients: [],
  },
  {
    provider: 'google-chat',
    name: 'Default Google Chat',
    slug: 'default-google-chat',
    content: '{{rule.name}}\nEvent: {{event.name}}\n{{event.payload}}',
    recipients: [],
  },
  {
    provider: 'http',
    name: 'Default HTTP',
    slug: 'default-http',
    content:
      '{\n  "rule": "{{rule.name}}",\n  "event": "{{event.name}}",\n  "payload": {{event.payload}}\n}',
    recipients: [],
  },
];

export class ProjectNotificationTemplateService {
  constructor(private readonly repository: ProjectNotificationTemplateRepository) {}

  async ensureDefaults(projectId: string) {
    for (const template of DEFAULT_TEMPLATES) {
      const existing = await this.repository.findBySlug(
        projectId,
        template.provider,
        template.slug,
      );
      if (!existing) {
        await this.repository.create({
          id: crypto.randomUUID(),
          projectId,
          ...template,
          system: true,
        });
      }
    }
  }

  async list(projectId: string) {
    await this.ensureDefaults(projectId);
    return (await this.repository.findByProjectId(projectId)).map((template) => template.toJson());
  }

  async create(
    projectId: string,
    input: { provider: string; name: string; content: string; recipients?: string | string[] },
  ) {
    const normalized = await this.normalize(projectId, input);
    await this.repository.create({
      id: crypto.randomUUID(),
      projectId,
      ...normalized,
      system: false,
    });
  }

  async update(
    id: string,
    projectId: string,
    input: { provider: string; name: string; content: string; recipients?: string | string[] },
  ) {
    const template = await this.requireOwned(id, projectId);
    if (template.provider !== input.provider) throw new Error('Template target cannot be changed');
    const normalized = await this.normalize(
      projectId,
      { ...input, name: template.system ? template.name : input.name },
      id,
    );
    await this.repository.update(id, {
      name: template.system ? template.name : normalized.name,
      slug: template.system ? template.slug : normalized.slug,
      content: normalized.content,
      recipients: normalized.recipients,
    });
  }

  async delete(id: string, projectId: string) {
    const template = await this.requireOwned(id, projectId);
    if (template.system) throw new Error('Default templates cannot be deleted');
    await this.repository.deleteById(id);
  }

  async render(
    projectId: string,
    provider: ProjectNotificationChannel,
    templateId: string | null,
    variables: Record<string, string>,
  ) {
    const selected = await this.resolve(projectId, provider, templateId);

    return Object.entries(variables).reduce(
      (content, [key, value]) => content.replaceAll(`{{${key}}}`, value),
      selected.content,
    );
  }

  async recipients(
    projectId: string,
    provider: ProjectNotificationChannel,
    templateId: string | null,
  ): Promise<string[]> {
    return (await this.resolve(projectId, provider, templateId)).recipients;
  }

  private async normalize(
    projectId: string,
    input: { provider: string; name: string; content: string; recipients?: string | string[] },
    currentId?: string,
  ) {
    const provider = this.normalizeProvider(input.provider);
    const name = input.name.trim();
    const content = input.content.trim();
    if (!name) throw new Error('Template name is required');
    if (!content) throw new Error('Template content is required');
    const slug = this.slug(name);
    const existing = await this.repository.findBySlug(projectId, provider, slug);
    if (existing && existing.id !== currentId)
      throw new Error('A template with this name already exists');
    if (provider === 'http') JSON.parse(this.renderJsonPreview(content));
    const recipients = provider === 'mail' ? this.normalizeRecipients(input.recipients) : [];
    return { provider, name, slug, content, recipients };
  }

  private async resolve(
    projectId: string,
    provider: ProjectNotificationChannel,
    templateId: string | null,
  ) {
    await this.ensureDefaults(projectId);
    const template = templateId ? await this.repository.findById(templateId) : null;
    const selected =
      template && template.projectId === projectId && template.provider === provider
        ? template
        : await this.repository.findBySlug(
            projectId,
            provider,
            `default-${provider === 'mail' ? 'email' : provider}`,
          );
    if (!selected) throw new Error(`No ${provider} notification template is available`);
    return selected;
  }

  private normalizeRecipients(value: string | string[] | undefined): string[] {
    const source = Array.isArray(value) ? value : (value ?? '').split(',');
    const recipients = [
      ...new Set(source.map((item) => item.trim().toLowerCase()).filter(Boolean)),
    ];
    for (const recipient of recipients) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
        throw new Error(`Invalid email address: ${recipient}`);
      }
    }
    return recipients;
  }

  private async requireOwned(id: string, projectId: string) {
    const template = await this.repository.findById(id);
    if (!template || template.projectId !== projectId)
      throw new Error('Notification template not found');
    return template;
  }

  private normalizeProvider(value: string): ProjectNotificationChannel {
    if (!['mail', 'slack', 'google-chat', 'http'].includes(value)) {
      throw new Error('Unsupported template target');
    }
    return value as ProjectNotificationChannel;
  }

  private slug(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private renderJsonPreview(content: string) {
    return content
      .replaceAll('{{rule.name}}', 'rule')
      .replaceAll('{{event.name}}', 'event')
      .replaceAll('{{event.payload}}', '{}');
  }
}
