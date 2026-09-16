import crypto from 'crypto';
import type { ConfigurableNotificationTarget } from '../domain/project-notification-target.domain';
import {
  decryptTargetCredential,
  encryptTargetCredential,
} from '../infrastructure/crypto/target-credential-cipher';
import type { ProjectNotificationTargetRepository } from '../infrastructure/repositories/project-notification-target.repository';
import type { ProjectNotificationTemplateRepository } from '../infrastructure/repositories/project-notification-template.repository';
import type { ProjectNotificationChannel } from '../domain/project-notification.domain';

export const NOTIFICATION_TARGETS = [
  { id: 'mail', configurable: false },
  { id: 'slack', configurable: true },
  { id: 'google-chat', configurable: true },
  { id: 'http', configurable: true },
] as const;

export class ProjectNotificationTargetService {
  constructor(
    private readonly repository: ProjectNotificationTargetRepository,
    private readonly templateRepository: ProjectNotificationTemplateRepository,
  ) {}

  async list(projectId: string, options: { includeCredentials?: boolean } = {}) {
    const configured = await this.repository.findByProjectId(projectId);
    return NOTIFICATION_TARGETS.map((definition) => {
      const target = configured.find((item) => item.provider === definition.id);
      const credential =
        options.includeCredentials && target?.credentialEncrypted
          ? decryptTargetCredential(target.id, target.provider, target.credentialEncrypted)
          : null;
      return {
        id: definition.id,
        configurable: definition.configurable,
        configured:
          definition.id === 'mail' ||
          (definition.id === 'http'
            ? Boolean(target?.enabled)
            : Boolean(target?.credentialEncrypted && target.enabled)),
        hasCredential: Boolean(target?.credentialEncrypted),
        credential: definition.id === 'http' ? null : credential,
        defaultTemplateId: target?.defaultTemplateId ?? null,
        enabled: target?.enabled ?? true,
      };
    });
  }

  async save(
    projectId: string,
    input: {
      provider: string;
      credential?: string;
      enabled?: boolean;
    },
  ) {
    const provider = this.normalizeProvider(input.provider);
    const existing = await this.repository.findByProjectAndProvider(projectId, provider);
    const credential = provider === 'http' ? '' : input.credential?.trim();

    if (!existing && provider !== 'http' && !credential) {
      throw new Error('Target credential is required');
    }
    if (provider === 'google-chat' && credential) this.validateGoogleChatWebhook(credential);

    if (existing) {
      const changes: Parameters<ProjectNotificationTargetRepository['update']>[1] = {
        enabled: input.enabled ?? true,
      };
      if (credential) {
        changes.credentialEncrypted = encryptTargetCredential(existing.id, provider, credential);
      }
      await this.repository.update(existing.id, changes);
    } else {
      const id = crypto.randomUUID();
      await this.repository.create({
        id,
        projectId,
        provider,
        credentialEncrypted: credential ? encryptTargetCredential(id, provider, credential) : '',
        enabled: input.enabled ?? true,
      });
    }
  }

  async credentials(projectId: string, provider: ConfigurableNotificationTarget) {
    const target = await this.repository.findByProjectAndProvider(projectId, provider);
    if (!target?.enabled || (provider !== 'http' && !target.credentialEncrypted)) {
      throw new Error(`${provider} target is not configured or enabled`);
    }
    return {
      credential: target.credentialEncrypted
        ? decryptTargetCredential(target.id, provider, target.credentialEncrypted)
        : '',
      defaultTemplateId: target.defaultTemplateId ?? null,
    };
  }

  async defaultTemplateId(
    projectId: string,
    provider: ProjectNotificationChannel,
  ): Promise<string | null> {
    return (
      (await this.repository.findByProjectAndProvider(projectId, provider))?.defaultTemplateId ??
      null
    );
  }

  async setDefaultTemplate(
    projectId: string,
    providerValue: string,
    templateId: string,
  ): Promise<void> {
    const provider = this.normalizeTarget(providerValue);
    const template = await this.templateRepository.findById(templateId);
    if (!template || template.projectId !== projectId || template.provider !== provider) {
      throw new Error('Notification template does not belong to this target');
    }

    const existing = await this.repository.findByProjectAndProvider(projectId, provider);
    if (existing) {
      await this.repository.update(existing.id, { defaultTemplateId: template.id });
      return;
    }

    await this.repository.create({
      id: crypto.randomUUID(),
      projectId,
      provider,
      credentialEncrypted: '',
      defaultTemplateId: template.id,
      enabled: provider === 'mail',
    });
  }

  private normalizeProvider(value: string): ConfigurableNotificationTarget {
    if (value !== 'slack' && value !== 'google-chat' && value !== 'http') {
      throw new Error('This notification target cannot be configured yet');
    }
    return value;
  }

  private normalizeTarget(value: string): ProjectNotificationChannel {
    if (!['mail', 'slack', 'google-chat', 'http'].includes(value)) {
      throw new Error('Unsupported notification target');
    }
    return value as ProjectNotificationChannel;
  }

  private validateGoogleChatWebhook(value: string): void {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:') {
      throw new Error('Target URL must use HTTPS');
    }
    if (url.hostname !== 'chat.googleapis.com') {
      throw new Error('Google Chat webhook must use chat.googleapis.com');
    }
    if (!url.pathname.includes('/spaces/') || !url.pathname.endsWith('/messages')) {
      throw new Error('Google Chat webhook must be a complete space webhook URL');
    }
    if (!url.searchParams.get('key') || !url.searchParams.get('token')) {
      throw new Error('Google Chat webhook must include key and token parameters');
    }
  }
}
