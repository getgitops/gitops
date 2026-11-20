import { eventBus } from '#lib/server/events';
import { isSmtpConfigured } from '#lib/server/infra/notifications';
import { createLogger } from '#lib/server/logger';
import { cancanService, roleService, userAccessService, apiKeysService } from '../auth';
import { codeReportSecurityPolicyService, codeReportService } from '../code-report';
import { organizationService } from '../organization';
import { projectService } from '../projects';
import { vaultService } from '../vault';
import { AlertEngine } from './application/alert-engine';
import { AlertService } from './application/alert.service';
import { AlertThrottle } from './application/alert-throttle';
import { RecipientResolver } from './application/recipient-resolver';
import { AlertMailNotifier } from './infrastructure/alert-mail.notifier';
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
});

const recipientResolver = new RecipientResolver(alertDirectory, (userId, permission, context) =>
  cancanService.can(userId, permission, context),
);

const ENGINE_KEY = Symbol.for('gitops.alerts.engine');
type GlobalWithEngine = typeof globalThis & {
  [ENGINE_KEY]?: { engine: AlertEngine; attached: boolean };
};

// one engine per process: HMR re-evaluating this module must not subscribe a second one, and the
// throttle windows must survive it
const engineSlot = ((globalThis as GlobalWithEngine)[ENGINE_KEY] ??= {
  engine: new AlertEngine({
    repository: alertRepository,
    directory: alertDirectory,
    recipients: recipientResolver,
    notifier: new AlertMailNotifier(),
    throttle: new AlertThrottle(),
    logger: log,
    // without SMTP there is nobody to tell: skip the work instead of logging a failure per event
    deliveryEnabled: () => {
      try {
        return isSmtpConfigured();
      } catch {
        return false;
      }
    },
  }),
  attached: false,
});

export const alertEngine = engineSlot.engine;

export const alertService = new AlertService(alertRepository, alertDirectory, {
  onChange: () => alertEngine.invalidate(),
});

/** Subscribes the alert engine to the bus once per process (`hooks.server.ts`). */
export function registerAlertEngine(): void {
  if (engineSlot.attached) return;
  alertEngine.attach(eventBus);
  engineSlot.attached = true;
  log.info('[alerts] engine registered');
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
