import { fileURLToPath } from 'node:url';
import { RecordingEventBus } from '#lib/server/events/testing';
import { createCredentialsCipher } from '../infrastructure/crypto/credentials-cipher';
import { InMemoryObjectStore } from '../infrastructure/object-store/in-memory-object-store';
import type { ObjectStoreFactory } from '../infrastructure/object-store/factory';
import type { StateBackendCredentials } from '../domain/state-backend.domain';
import {
  InMemoryStateBackendRepository,
  InMemoryStateBindingRepository,
} from '../infrastructure/repositories/in-memory.repositories';
import { StateBackendService } from './state-backend.service';
import { StateBindingService } from './state-binding.service';
import { StateIacService } from './state-iac.service';
import { PulumiStateEngine } from '../infrastructure/engines/pulumi/pulumi-state-engine';
import type { StateIacConfig } from '../infrastructure/config';

/** `test/fixtures/state-iac/<name>`: buckets copied from real (anonymized) Pulumi state. */
export function fixtureDir(name: 'project-layout' | 'legacy-layout'): string {
  return fileURLToPath(new URL(`../../../../test/fixtures/state-iac/${name}`, import.meta.url));
}

/** A bucket with the fixture under `prefix` (`''` for the bucket root). */
export function fixtureStore(
  name: 'project-layout' | 'legacy-layout',
  prefix = '',
): InMemoryObjectStore {
  return InMemoryObjectStore.fromDirectory(fixtureDir(name), prefix ? `${prefix}/` : '');
}

/**
 * Services wired to in-memory repositories, a recording event bus and in-memory buckets keyed
 * by bucket name. `credentialsSeen` records what each store was built with.
 */
export function createStateIacFixture() {
  const backends = new InMemoryStateBackendRepository();
  const bindings = new InMemoryStateBindingRepository();
  const events = new RecordingEventBus();
  const buckets = new Map<string, InMemoryObjectStore>();
  const credentialsSeen: Array<StateBackendCredentials | null> = [];
  const projects = new Map<string, { id: string; organizationId: string | null }>([
    ['p1', { id: 'p1', organizationId: 'org-1' }],
    ['p2', { id: 'p2', organizationId: 'org-1' }],
    ['other-org-project', { id: 'other-org-project', organizationId: 'org-2' }],
  ]);
  const stores: ObjectStoreFactory = (backend, credentials) => {
    credentialsSeen.push(credentials);
    let store = buckets.get(backend.bucket);
    if (!store) {
      store = new InMemoryObjectStore();
      buckets.set(backend.bucket, store);
    }
    return store;
  };
  const cipher = createCredentialsCipher(() => 'test-encryption-key');
  let ids = 0;
  const generateId = () => `id-${++ids}`;

  const backendService = new StateBackendService(backends, bindings, cipher, stores, {
    events,
    generateId,
  });
  const bindingService = new StateBindingService(
    bindings,
    { getProject: async (id) => projects.get(id) ?? null },
    { events, generateId },
  );
  const config: StateIacConfig = { maxStateBytes: 50 * 1024 * 1024, cacheTtlMs: 60_000 };
  let clock = 1_000_000;
  const stateIacService = new StateIacService(
    backendService,
    bindings,
    new PulumiStateEngine(),
    () => config,
    {
      now: () => clock,
    },
  );
  return {
    config,
    /** Moves the cache clock forward. */
    advance(ms: number) {
      clock += ms;
    },
    stateIacService,
    backends,
    bindings,
    events,
    buckets,
    credentialsSeen,
    projects,
    cipher,
    backendService,
    bindingService,
  };
}
