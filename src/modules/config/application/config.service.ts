import type { InstanceConfig } from '../domain/entities';
import type { ConfigRepository } from '../domain/repositories';

const DEFAULT_CONFIG: InstanceConfig = {
  publicAccess: false,
  googleSsoEnabled: false,
  samlEnabled: false,
};

export class ConfigService {
  constructor(private readonly configRepository: ConfigRepository) {}

  getConfig(): InstanceConfig | null {
    return this.configRepository.getConfig();
  }

  saveConfig(partial: Partial<InstanceConfig>): void {
    const existing = this.getConfig() ?? DEFAULT_CONFIG;
    const merged: InstanceConfig = { ...existing, ...partial };
    this.configRepository.saveConfig(merged);
  }
}
