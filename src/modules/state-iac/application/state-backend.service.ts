import type { Logger } from 'pino';
import type { StateIacBackendChangedField } from '#lib/events/domain-events';
import { publishAfterWrite, type EventPublisher } from '#lib/server/events/publish';
import {
  StateBackendDomain,
  StateBackendNotFoundError,
  StateIacValidationError,
  type StateBackendCredentials,
  type StateBackendRow,
} from '../domain/state-backend.domain';
import {
  hasCredentialsInput,
  toBoolean,
  validateAuth,
  validateBucket,
  validateCredentials,
  validateEndpoint,
  validateEngine,
  validateName,
  validatePrefix,
  validateProvider,
  validateRegion,
  type CredentialsInput,
  type FieldErrors,
} from '../domain/state-backend.validation';
import type { CredentialsCipher } from '../infrastructure/crypto/credentials-cipher';
import {
  discoverPulumi,
  UnsupportedLayoutError,
  type PulumiDiscovery,
  type PulumiLayout,
} from '../infrastructure/engines/pulumi/pulumi-discovery';
import {
  InvalidStateError,
  UnsupportedStateVersionError,
} from '../infrastructure/engines/pulumi/pulumi-state';
import { StackStateMissingError } from '../infrastructure/engines/pulumi/pulumi-state-engine';
import type { ObjectStoreFactory } from '../infrastructure/object-store/factory';
import {
  classifyStoreError,
  type ObjectStore,
  type StoreErrorCode,
} from '../infrastructure/object-store/object-store';
import type {
  StateBackendChanges,
  StateBackendRepositoryPort,
} from '../infrastructure/repositories/state-backend.repository';
import type { StateBindingRepositoryPort } from '../infrastructure/repositories/state-binding.repository';

export type BackendInput = {
  name?: unknown;
  engine?: unknown;
  provider?: unknown;
  bucket?: unknown;
  prefix?: unknown;
  region?: unknown;
  endpoint?: unknown;
  forcePathStyle?: unknown;
  auth?: unknown;
  /** Only read when `auth` is `credentials`; on update an empty value keeps the stored ones. */
  credentials?: CredentialsInput | null;
  enabled?: unknown;
};

export type BackendErrorCode =
  | StoreErrorCode
  | 'unsupported_layout'
  | 'unsupported_state'
  | 'invalid_state'
  | 'state_missing'
  | 'undecryptable';

/** Short code of a failed read: stored in `lastError` and shown translated, never the message. */
export function readErrorCode(error: unknown): BackendErrorCode {
  if (error instanceof UnsupportedLayoutError || error instanceof UnsupportedStateVersionError) {
    return error instanceof UnsupportedLayoutError ? 'unsupported_layout' : 'unsupported_state';
  }
  if (error instanceof InvalidStateError) return 'invalid_state';
  if (error instanceof StackStateMissingError) return 'state_missing';
  return classifyStoreError(error);
}

export type BackendTestResult =
  | {
      ok: true;
      layout: PulumiLayout;
      metaVersion: number | null;
      projects: number;
      stacks: number;
    }
  | { ok: false; error: BackendErrorCode };

export type DiscoveryOutcome =
  ({ ok: true } & PulumiDiscovery) | { ok: false; error: BackendErrorCode };

export type StateBackendServiceOptions = {
  now?: () => Date;
  generateId?: () => string;
  events?: EventPublisher;
  logger?: Pick<Logger, 'error'>;
  /** How often a successful read records `lastScanAt` (each record is a GitDB commit). */
  scanStampIntervalMs?: number;
};

const DEFAULT_SCAN_STAMP_INTERVAL_MS = 60 * 60 * 1000;
const silentLogger = { error: () => {} } as unknown as Pick<Logger, 'error'>;

/**
 * State IaC backends of organizations: buckets where Pulumi keeps its state. Only the
 * configuration lives in GitDB; credentials are encrypted and never leave this service in clear
 * text except to build the bucket client. The bucket itself is only ever read.
 */
export class StateBackendService {
  private readonly now: () => Date;
  private readonly generateId: () => string;
  private readonly log: Pick<Logger, 'error'>;
  private readonly stampIntervalMs: number;

  constructor(
    private readonly repository: StateBackendRepositoryPort,
    private readonly bindings: StateBindingRepositoryPort,
    private readonly cipher: CredentialsCipher,
    private readonly stores: ObjectStoreFactory,
    private readonly options: StateBackendServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.generateId = options.generateId ?? (() => crypto.randomUUID());
    this.log = options.logger ?? silentLogger;
    this.stampIntervalMs = options.scanStampIntervalMs ?? DEFAULT_SCAN_STAMP_INTERVAL_MS;
  }

  async get(id: string): Promise<StateBackendDomain> {
    const backend = await this.repository.findById(id);
    if (!backend) throw new StateBackendNotFoundError(id);
    return backend;
  }

  list(organizationId: string): Promise<StateBackendDomain[]> {
    return this.repository.listByOrganization(organizationId);
  }

  async create(organizationId: string, input: BackendInput): Promise<StateBackendDomain> {
    const errors: FieldErrors = {};
    const name = validateName(input.name, errors);
    const engine = validateEngine(input.engine, errors);
    const provider = validateProvider(input.provider, errors);
    const bucket = validateBucket(input.bucket, errors);
    const prefix = validatePrefix(input.prefix, errors);
    const region = validateRegion(input.region, errors);
    const endpoint = validateEndpoint(input.endpoint, provider, errors);
    const auth = validateAuth(input.auth, errors);
    const credentials =
      auth === 'credentials' && provider
        ? validateCredentials(provider, input.credentials ?? {}, errors)
        : null;
    await this.checkUniqueName(organizationId, name, null, errors);
    if (Object.keys(errors).length > 0 || !provider) throw new StateIacValidationError(errors);

    const id = this.generateId();
    const timestamp = this.now().toISOString();
    const row: StateBackendRow = {
      id,
      organizationId,
      name,
      engine,
      provider,
      bucket,
      prefix,
      region,
      endpoint,
      forcePathStyle: provider === 's3' && toBoolean(input.forcePathStyle, Boolean(endpoint)),
      auth,
      credentials: credentials ? this.cipher.encrypt(id, JSON.stringify(credentials)) : null,
      enabled: toBoolean(input.enabled, true),
      lastScanAt: null,
      lastError: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.repository.create(row);
    const backend = new StateBackendDomain(row);
    await this.publish('state_iac.backend.created', backend);
    return backend;
  }

  /**
   * Partial update: omitted fields keep their value. Credentials are replaced only when new ones
   * are typed; switching to `ambient` removes them. The provider can't change: a bucket in
   * another cloud is another backend.
   */
  async update(id: string, input: BackendInput): Promise<StateBackendDomain> {
    const backend = await this.get(id);
    const errors: FieldErrors = {};
    const changes: StateBackendChanges = {};
    const provider = backend.provider;

    if (input.provider !== undefined && input.provider !== provider) {
      errors.provider = 'provider_immutable';
    }
    if (input.name !== undefined) {
      changes.name = validateName(input.name, errors);
      await this.checkUniqueName(backend.organizationId, changes.name, id, errors);
    }
    if (input.bucket !== undefined) changes.bucket = validateBucket(input.bucket, errors);
    if (input.prefix !== undefined) changes.prefix = validatePrefix(input.prefix, errors);
    if (input.region !== undefined) changes.region = validateRegion(input.region, errors);
    if (input.endpoint !== undefined) {
      changes.endpoint = validateEndpoint(input.endpoint, provider, errors);
    }
    if (input.forcePathStyle !== undefined) {
      changes.forcePathStyle = provider === 's3' && toBoolean(input.forcePathStyle, false);
    }
    if (input.enabled !== undefined) changes.enabled = toBoolean(input.enabled, backend.enabled);

    const auth = input.auth !== undefined ? validateAuth(input.auth, errors) : backend.auth;
    if (auth !== backend.auth) changes.auth = auth;
    if (auth === 'ambient') {
      if (backend.credentials) changes.credentials = null;
    } else if (hasCredentialsInput(input.credentials)) {
      const credentials = validateCredentials(provider, input.credentials ?? {}, errors);
      if (credentials) changes.credentials = this.cipher.encrypt(id, JSON.stringify(credentials));
    } else if (!backend.credentials) {
      errors.credentials = provider === 'gcs' ? 'required' : 'access_key_required';
    }

    if (Object.keys(errors).length > 0) throw new StateIacValidationError(errors);
    const changedFields = this.changedFields(backend, changes);
    if (changedFields.length === 0) return backend;
    // another bucket or credentials: the last error no longer applies
    if (
      changedFields.some((field) =>
        ['bucket', 'prefix', 'region', 'endpoint', 'auth', 'credentials'].includes(field),
      )
    ) {
      changes.lastError = null;
    }
    await this.repository.update(id, changes);
    const updated = new StateBackendDomain({ ...backend.toJson(), ...changes });
    await this.publish('state_iac.backend.updated', updated, changedFields);
    return updated;
  }

  /** Deletes the backend and its bindings; the bucket is untouched. */
  async delete(id: string): Promise<void> {
    const backend = await this.get(id);
    for (const binding of await this.bindings.listByBackend(id)) {
      await this.bindings.delete(binding.id);
    }
    await this.repository.delete(id);
    await this.publish('state_iac.backend.deleted', backend);
  }

  /** "Test connection": lists the bucket and reads `meta.yaml`. Works on disabled backends. */
  async test(id: string): Promise<BackendTestResult> {
    const backend = await this.get(id);
    const discovery = await this.runDiscovery(backend);
    if (!discovery.ok) return discovery;
    return {
      ok: true,
      layout: discovery.layout,
      metaVersion: discovery.metaVersion,
      projects: discovery.projects.length,
      stacks: discovery.projects.reduce((sum, project) => sum + project.stacks.length, 0),
    };
  }

  /** Pulumi projects and stacks in the bucket, to assign them. */
  async discover(id: string): Promise<DiscoveryOutcome> {
    return this.runDiscovery(await this.get(id));
  }

  /** The bucket client of a backend, credentials decrypted in memory only. */
  storeFor(backend: StateBackendDomain): ObjectStore {
    return this.stores(backend, this.decryptCredentials(backend));
  }

  private decryptCredentials(backend: StateBackendDomain): StateBackendCredentials | null {
    if (backend.auth !== 'credentials' || !backend.credentials) return null;
    const parsed = JSON.parse(this.cipher.decrypt(backend.id, backend.credentials));
    return parsed as StateBackendCredentials;
  }

  private async runDiscovery(backend: StateBackendDomain): Promise<DiscoveryOutcome> {
    let store: ObjectStore;
    try {
      store = this.storeFor(backend);
    } catch {
      await this.recordOutcome(backend, 'undecryptable');
      return { ok: false, error: 'undecryptable' };
    }
    try {
      const discovery = await discoverPulumi(store, backend.pulumiRoot);
      await this.recordOutcome(backend, null);
      return { ok: true, ...discovery };
    } catch (error) {
      const code = readErrorCode(error);
      // the provider message may echo the bucket or the account: only the code is kept
      this.log.error(
        { backendId: backend.id, code, err: error instanceof Error ? error.name : 'unknown' },
        '[state-iac] bucket read failed',
      );
      await this.recordOutcome(backend, code);
      return { ok: false, error: code };
    }
  }

  /** Records the outcome of a read made elsewhere (stack listings): the same rules as `test`. */
  reportRead(backend: StateBackendDomain, error: BackendErrorCode | null): Promise<void> {
    return this.recordOutcome(backend, error);
  }

  /** Each write is a commit: only when the error changes or the scan stamp got old. */
  private async recordOutcome(backend: StateBackendDomain, error: string | null) {
    const now = this.now();
    const last = backend.lastScanAt ? Date.parse(backend.lastScanAt) : 0;
    const changes: StateBackendChanges = {};
    if (backend.lastError !== error) changes.lastError = error;
    if (!error && now.getTime() - last >= this.stampIntervalMs) {
      changes.lastScanAt = now.toISOString();
    }
    if (Object.keys(changes).length === 0) return;
    await this.repository
      .update(backend.id, changes)
      .catch((err) =>
        this.log.error(
          { backendId: backend.id, err: err instanceof Error ? err.name : 'unknown' },
          '[state-iac] scan outcome could not be recorded',
        ),
      );
  }

  private async checkUniqueName(
    organizationId: string,
    name: string,
    exceptId: string | null,
    errors: FieldErrors,
  ) {
    if (!name || errors.name) return;
    const taken = (await this.repository.listByOrganization(organizationId)).some(
      (other) => other.id !== exceptId && other.name.toLowerCase() === name.toLowerCase(),
    );
    if (taken) errors.name = 'duplicate_name';
  }

  private changedFields(
    backend: StateBackendDomain,
    changes: StateBackendChanges,
  ): StateIacBackendChangedField[] {
    const fields: StateIacBackendChangedField[] = [];
    const tracked = ['name', 'bucket', 'prefix', 'region', 'endpoint', 'auth', 'enabled'] as const;
    for (const field of tracked) {
      if (field in changes && changes[field] !== backend[field]) fields.push(field);
    }
    if ('forcePathStyle' in changes && changes.forcePathStyle !== backend.forcePathStyle) {
      if (!fields.includes('endpoint')) fields.push('endpoint');
    }
    if ('credentials' in changes && changes.credentials !== backend.credentials) {
      fields.push('credentials');
    }
    return fields;
  }

  private async publish(
    type: 'state_iac.backend.created' | 'state_iac.backend.updated' | 'state_iac.backend.deleted',
    backend: StateBackendDomain,
    changedFields: StateIacBackendChangedField[] = [],
  ) {
    const payload = {
      backendId: backend.id,
      name: backend.name,
      engine: backend.engine,
      provider: backend.provider,
      bucket: backend.bucket,
      prefix: backend.prefix,
    };
    const scope = { organizationId: backend.organizationId, projectId: null };
    if (type === 'state_iac.backend.updated') {
      await publishAfterWrite(
        this.options.events,
        this.log,
        type,
        { ...payload, changedFields },
        scope,
      );
    } else {
      await publishAfterWrite(this.options.events, this.log, type, payload, scope);
    }
  }
}
