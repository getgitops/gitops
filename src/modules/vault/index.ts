import { VaultService } from './application/vault.service';
import { VaultRepository } from './infrastructure/repositories/vault.repository';

const vaultRepository = new VaultRepository();

export const vaultService = new VaultService(vaultRepository);
