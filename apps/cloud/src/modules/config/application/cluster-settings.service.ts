import type { ClusterSettingsRepository } from '../infrastructure/repositories/cluster-settings.repository';

export class ClusterSettingsService {
  constructor(private readonly repository: ClusterSettingsRepository) {}

  async getSettings() {
    const settings = await this.repository.get();
    return settings ? settings.toJson() : { registrationEnabled: false };
  }

  async isRegistrationEnabled(): Promise<boolean> {
    const settings = await this.repository.get();
    return settings?.registrationEnabled ?? false;
  }

  async setRegistrationEnabled(enabled: boolean) {
    const updated = await this.repository.upsert({ registrationEnabled: enabled });
    return updated.toJson();
  }
}
