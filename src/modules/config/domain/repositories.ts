import type { InstanceConfig, StorageBackend } from './entities';

export interface ConfigRepository {
  getConfig(): InstanceConfig | null;
  saveConfig(config: InstanceConfig): void;
}

export interface StorageBackendRepository {
  list(): StorageBackend[];
  findById(id: string): StorageBackend | null;
  upsert(backend: StorageBackend): string;
  deleteById(id: string): void;
}
