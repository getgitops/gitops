import { eventBus, type Unsubscribe } from '#lib/server/events';
import {
  isSmtpConfigured,
  mailQueue,
  readPublicOrigin,
  registerMailShutdown,
} from '#lib/server/infra/notifications';
import { createLogger } from '#lib/server/logger';
import { cancanService, roleService, userAccessService, apiKeysService } from '../auth';
import { codeReportSecurityPolicyService, codeReportService } from '../code-report';
import {
  externalRecipientService,
  notificationChannelService,
  registerChannelShutdown,
} from '../notifications';
import { organizationService } from '../organization';
import { projectService } from '../projects';
import { vaultService } from '../vault';
import { monitorService } from '../monitoring';
import { AlertEngine, type AlertEngineOptions } from './application/alert-engine';
import { AlertService } from './application/alert.service';
import { AlertThrottle } from './application/alert-throttle';
import { RecipientResolver } from './application/recipient-resolver';
import { AlertMailNotifier } from './infrastructure/alert-mail.notifier';
import { buildAlertChannelMessage } from './infrastructure/alert-channel-message';
import type { NotificationChannelsPort } from './application/types';
import { PlatformDirectory } from './infrastructure/platform-directory';
import { AlertRepository } from './infrastructure/repositories/alert.repository';

const log = createLogger('alerts');

const alertRepository = new AlertRepository();

export const alertDirectory = new PlatformDirectory({
  projects: projectService,
  organizations: organizationService,
  access: userAccessService,
  roles: roleService,
  codeReportServices: codeReportService,
  codeReportPolicies: codeReportSecurityPolicyService,
  vaultEnvironments: vaultService,
  apiKeys: apiKeysService,
  monitors: { listByProject: (projectId) => monitorService.listByProject(projectId) },
});

const recipientResolver = new RecipientResolver(alertDirectory, (userId, permission, context) =>
  cancanService.can(userId, permission, context),
);

const alertChannels: NotificationChannelsPort = {
  async listUsable(location) {
    const channels = await notificationChannelService.listUsable(location);
    return channels.map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      scope: channel.scope,
      enabled: channel.enabled,
    }));
  },
  deliver: (channelId, message, context) =>
    notificationChannelService.deliver(channelId, message, context),
};

const ENGINE_KEY = Symbol.for('gitops.alerts.engine');
type EngineDependencies = Pick<
  AlertEngineOptions,
  | 'repository'
  | 'directory'
  | 'recipients'
  | 'externalRecipients'
  | 'notifier'
  | 'channels'
  | 'channelMessage'
>;
const ENGINE_WIRING = 3;

type EngineSlot = {
  engine: AlertEngine | null;
  wiring?: number;
  throttle: AlertThrottle;
  detach: Unsubscribe | null;
  attached: boolean;
  dependencies: EngineDependencies;
};
type GlobalWithEngine = typeof globalThis & { [ENGINE_KEY]?: EngineSlot };

function latest<T extends object>(get: () => T): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const target = get();
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

const dependencies: EngineDependencies = {
  repository: alertRepository,
  directory: alertDirectory,
  recipients: recipientResolver,
  externalRecipients: externalRecipientService,
  notifier: new AlertMailNotifier(mailQueue),
  channels: alertChannels,
  channelMessage: buildAlertChannelMessage,
};

// one engine per process: HMR re-evaluating this module must not subscribe a second one, and the
// throttle windows must survive it
const engineSlot: EngineSlot = ((globalThis as GlobalWithEngine)[ENGINE_KEY] ??= {
  engine: null,
  throttle: new AlertThrottle(),
  detach: null,
  attached: false,
  dependencies,
});
engineSlot.dependencies = dependencies;
engineSlot.throttle ??= new AlertThrottle();

function createEngine(): AlertEngine {
  return new AlertEngine({
    repository: latest(() => engineSlot.dependencies.repository),
    directory: latest(() => engineSlot.dependencies.directory),
    recipients: latest(() => engineSlot.dependencies.recipients),
    externalRecipients: latest(() => engineSlot.dependencies.externalRecipients!),
    notifier: latest(() => engineSlot.dependencies.notifier),
    channels: latest(() => engineSlot.dependencies.channels!),
    channelMessage: (input, locale) => engineSlot.dependencies.channelMessage!(input, locale),
    throttle: engineSlot.throttle,
    logger: log,
    // without SMTP there is nobody to tell: skip the work instead of logging a failure per event
    deliveryEnabled: () => isMailConfigured(),
  });
}

if (!(engineSlot.engine instanceof AlertEngine) || engineSlot.wiring !== ENGINE_WIRING) {
  engineSlot.detach?.();
  engineSlot.engine = createEngine();
  engineSlot.wiring = ENGINE_WIRING;
  engineSlot.detach = engineSlot.attached ? engineSlot.engine.attach(eventBus) : null;
}

export const alertEngine: AlertEngine = engineSlot.engine;

export const alertService = new AlertService(alertRepository, alertDirectory, {
  onChange: () => alertEngine.invalidate(),
  externalRecipients: externalRecipientService,
  channels: alertChannels,
  logger: log,
});

/** Subscribes the alert engine to the bus once per process (`hooks.server.ts`). */
export function registerAlertEngine(): void {
  if (engineSlot.attached) return;
  engineSlot.detach = alertEngine.attach(eventBus);
  registerMailShutdown();
  registerChannelShutdown();
  engineSlot.attached = true;
  log.info('[alerts] engine registered');

  // said once at startup; skipped events are only logged in debug
  if (!isMailConfigured()) {
    log.warn('[alerts] NOTIFICATION_SMTP_* is not configured: alerts and notices will not be sent');
  }
  if (!readPublicOrigin()) {
    log.warn('[alerts] ORIGIN is not set: emails will be sent without links');
  }
}

/** Whether emails can be sent; a broken SMTP configuration counts as not configured. */
export function isMailConfigured(): boolean {
  try {
    return isSmtpConfigured();
  } catch {
    return false;
  }
}

export { buildSampleEvent } from './domain/sample-event';
export {
  AlertDomain,
  AlertNotFoundError,
  AlertValidationError,
  ALERT_CHANNELS,
  type AlertCondition,
  type AlertInput,
  type AlertLocation,
  type AlertRow,
  type AlertScope,
  type AlertValidationErrors,
} from './domain/alert.domain';
export type { AlertActor, ReferenceOption, ScopeMember, ScopeRole } from './application/types';
export type { AlertDryRun } from './application/alert-engine';
