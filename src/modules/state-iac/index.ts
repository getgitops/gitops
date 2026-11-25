import { eventBus } from '#lib/server/events';
import { createLogger } from '#lib/server/logger';
import { passwordService } from '../auth';
import { projectService } from '../projects';
import { StateBackendService } from './application/state-backend.service';
import { StateBindingService } from './application/state-binding.service';
import { StateIacService } from './application/state-iac.service';
import { readStateIacConfig } from './infrastructure/config';
import { PulumiStateEngine } from './infrastructure/engines/pulumi/pulumi-state-engine';
import { createCredentialsCipher } from './infrastructure/crypto/credentials-cipher';
import { createObjectStore } from './infrastructure/object-store/factory';
import { StateBackendRepository } from './infrastructure/repositories/state-backend.repository';
import { StateBindingRepository } from './infrastructure/repositories/state-binding.repository';

const log = createLogger('state-iac');
const bindingRepository = new StateBindingRepository();

export const stateBackendService = new StateBackendService(
  new StateBackendRepository(),
  bindingRepository,
  createCredentialsCipher(() => passwordService.ensureEncryptionKey()),
  createObjectStore,
  { events: eventBus, logger: log },
);

export const stateBindingService = new StateBindingService(
  bindingRepository,
  {
    async getProject(id) {
      const project = await projectService.getProject(id).catch(() => null);
      return project ? { id: project.id, organizationId: project.organization?.id ?? null } : null;
    },
  },
  { events: eventBus, logger: log },
);

export const stateIacService = new StateIacService(
  stateBackendService,
  bindingRepository,
  new PulumiStateEngine(),
  readStateIacConfig,
  { logger: log },
);

const SUBSCRIBED_KEY = Symbol.for('gitops.state-iac.subscribed');
type GlobalWithFlag = typeof globalThis & { [SUBSCRIBED_KEY]?: boolean };

/** Once per process (HMR-safe): a deleted GitOps project takes its State IaC bindings with it. */
export function registerStateIac(): void {
  const scope = globalThis as GlobalWithFlag;
  if (scope[SUBSCRIBED_KEY]) return;
  scope[SUBSCRIBED_KEY] = true;
  eventBus.subscribe('project.deleted', async (event) => {
    const removed = await stateBindingService.removeForProject(event.payload.projectId);
    if (removed > 0) {
      log.info({ projectId: event.payload.projectId, removed }, '[state-iac] bindings removed');
    }
  });
}

export {
  StateBackendNotFoundError,
  StateIacValidationError,
  STATE_PROVIDERS,
  STATE_AUTH_MODES,
  type StateBackendView,
  type StateProvider,
  type StateAuthMode,
} from './domain/state-backend.domain';
export type { StateBindingRow } from './domain/state-binding.domain';
export type {
  BackendInput,
  BackendTestResult,
  DiscoveryOutcome,
} from './application/state-backend.service';
export type { BindingInput } from './application/state-binding.service';
export type { PulumiLayout } from './infrastructure/engines/pulumi/pulumi-discovery';
export {
  UNKNOWN_PROJECT,
  type BackendStacks,
  type StackDetail,
  type StackListItem,
} from './application/state-iac.service';
export type * from './domain/iac.model';
