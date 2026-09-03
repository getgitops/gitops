import { ClusterSettingsService } from './application/cluster-settings.service';
import { ClusterSettingsRepository } from './infrastructure/repositories/cluster-settings.repository';

const clusterSettingsRepository = new ClusterSettingsRepository();

export const clusterSettingsService = new ClusterSettingsService(clusterSettingsRepository);
