import { Repository } from '$lib/server/infra/repository';
import { ClusterSettingsEntity } from '$lib/database/schemas';
import { ClusterSettingsDomain } from '../../domain/cluster-settings.domain';

// the row is a singleton; every read/write targets this fixed id
const CLUSTER_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

export class ClusterSettingsRepository extends Repository {
  async get(): Promise<ClusterSettingsDomain | null> {
    const result = await this.db
      .select()
      .from(ClusterSettingsEntity)
      .where({ id: CLUSTER_SETTINGS_ID })
      .limit(1);
    const row = result.rows[0];
    return row ? new ClusterSettingsDomain(row) : null;
  }

  async upsert(changes: { registrationEnabled?: boolean }): Promise<ClusterSettingsDomain> {
    const existing = await this.get();

    if (!existing) {
      await this.db.insert(ClusterSettingsEntity).values({
        id: CLUSTER_SETTINGS_ID,
        registrationEnabled: changes.registrationEnabled ?? false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } else {
      await this.db
        .update(ClusterSettingsEntity)
        .set({ ...changes, updatedAt: new Date().toISOString() })
        .where({ id: CLUSTER_SETTINGS_ID });
    }

    const updated = await this.get();
    if (!updated) throw new Error('Failed to persist cluster settings');
    return updated;
  }
}
