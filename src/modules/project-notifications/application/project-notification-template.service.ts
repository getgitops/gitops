import crypto from 'crypto';
import type { ProjectNotificationChannel } from '../domain/project-notification.domain';
import type { ProjectNotificationTemplateRepository } from '../infrastructure/repositories/project-notification-template.repository';
import type { NotificationTemplateFormat } from '../domain/project-notification-template.domain';
import {
  DEFAULT_HTTP_TEMPLATE_CONFIG,
  HTTP_METHODS,
  type HttpMethod,
  type HttpTemplateConfig,
} from '../domain/project-notification-http';
import {
  decryptTargetCredential,
  encryptTargetCredential,
} from '../infrastructure/crypto/target-credential-cipher';

const DEFAULT_TEMPLATES: Array<{
  provider: ProjectNotificationChannel;
  name: string;
  slug: string;
  content: string;
  format: NotificationTemplateFormat;
  recipients: string[];
  httpConfig?: HttpTemplateConfig;
}> = [
  {
    provider: 'mail',
    name: 'Default email',
    slug: 'default-email',
    content:
      '<h1>{{rule.name}}</h1><p>The event <strong>{{event.name}}</strong> occurred.</p><pre>{{event.payload}}</pre>',
    format: 'html',
    recipients: [],
  },
  {
    provider: 'slack',
    name: 'Default Slack',
    slug: 'default-slack',
    content: '*{{rule.name}}*\nEvent: `{{event.name}}`\n```{{event.payload}}```',
    format: 'text',
    recipients: [],
  },
  {
    provider: 'google-chat',
    name: 'Default Google Chat',
    slug: 'default-google-chat',
    content: '{{rule.name}}\nEvent: {{event.name}}\n{{event.payload}}',
    format: 'text',
    recipients: [],
  },
  {
    provider: 'http',
    name: 'Default HTTP',
    slug: 'default-http',
    content:
      '{\n  "rule": "{{rule.name}}",\n  "event": "{{event.name}}",\n  "payload": {{event.payload}}\n}',
    format: 'json',
    recipients: [],
    httpConfig: DEFAULT_HTTP_TEMPLATE_CONFIG,
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
        const id = crypto.randomUUID();
        const { httpConfig, ...storedTemplate } = template;
        await this.repository.create({
          id,
          projectId,
          ...storedTemplate,
          httpConfigEncrypted: httpConfig
            ? encryptTargetCredential(id, 'http-template', JSON.stringify(httpConfig))
            : '',
          system: true,
        });
      }
    }
  }

  async list(projectId: string, options: { includeHttpConfig?: boolean } = {}) {
    await this.ensureDefaults(projectId);
    return (await this.repository.findByProjectId(projectId)).map((template) => ({
      ...template.toJson(),
      httpConfig:
        options.includeHttpConfig && template.provider === 'http'
          ? this.decryptHttpConfig(template.id, template.httpConfigEncrypted)
          : null,
    }));
  }

  async create(
    projectId: string,
    input: {
      provider: string;
      name: string;
      content: string;
      format?: string;
      httpConfig?: { url?: string; method?: string; headers?: string | Record<string, string> };
      recipients?: string | string[];
    },
  ) {
    const normalized = await this.normalize(projectId, input);
    const id = crypto.randomUUID();
    const { httpConfig, ...storedTemplate } = normalized;
    await this.repository.create({
      id,
      projectId,
      ...storedTemplate,
      httpConfigEncrypted: httpConfig
        ? encryptTargetCredential(id, 'http-template', JSON.stringify(httpConfig))
        : '',
      system: false,
    });
  }

  async update(
    id: string,
    projectId: string,
    input: {
      provider: string;
      name: string;
      content: string;
      format?: string;
      httpConfig?: { url?: string; method?: string; headers?: string | Record<string, string> };
      recipients?: string | string[];
    },
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
      format: normalized.format,
      httpConfigEncrypted: normalized.httpConfig
        ? encryptTargetCredential(id, 'http-template', JSON.stringify(normalized.httpConfig))
        : '',
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
    return (await this.renderMessage(projectId, provider, templateId, variables)).content;
  }

  async renderMessage(
    projectId: string,
    provider: ProjectNotificationChannel,
    templateId: string | null,
    variables: Record<string, string>,
  ) {
    const selected = await this.resolve(projectId, provider, templateId);

    const content = Object.entries(variables).reduce(
      (content, [key, value]) => content.replaceAll(`{{${key}}}`, value),
      selected.content,
    );
    if (selected.format === 'json') JSON.parse(content);
    return {
      content,
      format: selected.format,
      httpConfig:
        selected.provider === 'http'
          ? this.decryptHttpConfig(selected.id, selected.httpConfigEncrypted)
          : undefined,
    };
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
    input: {
      provider: string;
      name: string;
      content: string;
      format?: string;
      httpConfig?: { url?: string; method?: string; headers?: string | Record<string, string> };
      recipients?: string | string[];
    },
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
    const format = this.normalizeFormat(provider, input.format);
    if (provider === 'http' && format === 'json') JSON.parse(this.renderJsonPreview(content));
    const httpConfig = provider === 'http' ? this.normalizeHttpConfig(input.httpConfig) : undefined;
    const recipients = provider === 'mail' ? this.normalizeRecipients(input.recipients) : [];
    return { provider, name, slug, content, format, httpConfig, recipients };
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

  private normalizeFormat(
    provider: ProjectNotificationChannel,
    value: string | undefined,
  ): NotificationTemplateFormat {
    if (provider === 'mail') return 'html';
    if (provider !== 'http') return 'text';
    if (!value || value === 'json') return 'json';
    if (value === 'text') return 'text';
    throw new Error('HTTP template format must be text or json');
  }

  private normalizeHttpConfig(
    input: { url?: string; method?: string; headers?: string | Record<string, string> } | undefined,
  ): HttpTemplateConfig {
    const url = new URL(input?.url?.trim() || DEFAULT_HTTP_TEMPLATE_CONFIG.url);
    if (url.protocol !== 'https:') throw new Error('HTTP template URL must use HTTPS');
    const method = String(
      input?.method || DEFAULT_HTTP_TEMPLATE_CONFIG.method,
    ).toUpperCase() as HttpMethod;
    if (!HTTP_METHODS.includes(method)) throw new Error('Unsupported HTTP method');
    const rawHeaders = input?.headers ?? DEFAULT_HTTP_TEMPLATE_CONFIG.headers;
    const parsedHeaders =
      typeof rawHeaders === 'string'
        ? rawHeaders.trim()
          ? JSON.parse(rawHeaders)
          : {}
        : rawHeaders;
    if (!parsedHeaders || Array.isArray(parsedHeaders) || typeof parsedHeaders !== 'object') {
      throw new Error('HTTP headers must be a JSON object');
    }
    const headers = Object.fromEntries(
      Object.entries(parsedHeaders).map(([key, value]) => [
        key.trim().toLowerCase(),
        String(value),
      ]),
    );
    return { url: url.toString(), method, headers };
  }

  private decryptHttpConfig(id: string, stored: string): HttpTemplateConfig {
    if (!stored) return DEFAULT_HTTP_TEMPLATE_CONFIG;
    try {
      return this.normalizeHttpConfig(
        JSON.parse(decryptTargetCredential(id, 'http-template', stored)),
      );
    } catch {
      throw new Error('Stored HTTP template configuration is invalid');
    }
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
