import { databaseClient } from '$lib/db';
import { ConfigService } from './application/config.service';
import { StorageBackendService } from './application/storage-backend.service';
import { SqliteConfigRepository } from './infrastructure/repositories/sqlite-config.repository';
import { SqliteStorageBackendRepository } from './infrastructure/repositories/sqlite-storage-backend.repository';

const configRepository = new SqliteConfigRepository(databaseClient);
const storageBackendRepository = new SqliteStorageBackendRepository(databaseClient);

export const configService = new ConfigService(configRepository);
export const storageBackendService = new StorageBackendService(storageBackendRepository);
