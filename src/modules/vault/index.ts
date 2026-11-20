import { VAULT_ENCRYPTION_PROVIDERS, VaultService } from './application/vault.service';
import { VaultRepository } from './infrastructure/repositories/vault.repository';
import { eventBus } from '#lib/server/events';
import { projectService } from '../projects';

const vaultRepository = new VaultRepository();

export const vaultService = new VaultService(vaultRepository, {
  events: eventBus,
  projects: projectService,
});
export { VAULT_ENCRYPTION_PROVIDERS };
