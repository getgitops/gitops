import { Domain } from '$lib/server/domain/domain';

export class ClusterSettingsDomain extends Domain {
  public registrationEnabled: boolean = false;

  constructor(data: any) {
    super(data);
    this.registrationEnabled = Boolean(data.registrationEnabled);
  }

  toJson() {
    return {
      id: this.id,
      registrationEnabled: this.registrationEnabled,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
