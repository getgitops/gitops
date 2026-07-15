import crypto from 'crypto';
import type {
  StorageBackend,
  StorageBackendPublic,
  UpsertStorageBackendInput,
} from '../domain/entities';
import type { StorageBackendRepository } from '../domain/repositories';

export class StorageBackendService {
  constructor(private readonly repository: StorageBackendRepository) {}

  list(): StorageBackendPublic[] {
    return this.repository.list().map((backend) => ({
      ...backend,
      secretAccessKey: backend.secretAccessKey ? '***' : null,
      gcpCredentials: backend.gcpCredentials ? '***' : null,
    }));
  }

  getById(id: string): StorageBackend | null {
    return this.repository.findById(id);
  }

  upsert(input: UpsertStorageBackendInput): string {
    const id = input.id || crypto.randomUUID();
    const existing = input.id ? this.repository.findById(input.id) : null;

    const secretAccessKey =
      input.secretAccessKey === '***' ? (existing?.secretAccessKey ?? null) : (input.secretAccessKey ?? null);
    const gcpCredentials =
      input.gcpCredentials === '***' ? (existing?.gcpCredentials ?? null) : (input.gcpCredentials ?? null);

    return this.repository.upsert({
      id,
      name: input.name || 'Unnamed Backend',
      provider: input.provider,
      bucket: input.bucket,
      region: input.region ?? null,
      accessKeyId: input.accessKeyId ?? null,
      secretAccessKey,
      endpoint: input.endpoint ?? null,
      gcpProjectId: input.gcpProjectId ?? null,
      gcpCredentials,
    });
  }

  deleteById(id: string): void {
    this.repository.deleteById(id);
  }
}
