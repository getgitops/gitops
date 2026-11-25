import type { IacLock, IacSnapshot, IacStackRef, IacUpdate } from '../../domain/iac.model';
import type { ObjectStore } from '../object-store/object-store';

/** A stack found in a backend, with what is needed to read it and to cache it. */
export type EngineStack = {
  ref: IacStackRef;
  /** Object key of its current state. */
  key: string;
  size: number;
  updatedAt: string | null;
  /** ETag / generation of the state object. */
  version: string | null;
};

export type EngineDiscovery = {
  layout: 'project' | 'legacy' | 'empty';
  metaVersion: number | null;
  stacks: EngineStack[];
  truncated: boolean;
};

/**
 * Reads one IaC tool's layout and translates it into the normalized model. Pulumi is the only
 * engine in v1; a Terraform one implements the same interface (`listUpdates` from object
 * versions, as Terraform keeps no history). Engines only read.
 */
export interface StateEngine {
  readonly kind: IacStackRef['engine'];
  /** `root` is the backend's bookkeeping prefix (`<prefix>/.pulumi/`). */
  discoverStacks(store: ObjectStore, root: string, backendId: string): Promise<EngineDiscovery>;
  readSnapshot(
    store: ObjectStore,
    root: string,
    stack: EngineStack,
    options: { maxBytes: number },
  ): Promise<IacSnapshot>;
  /** Most recent first. */
  listUpdates(
    store: ObjectStore,
    root: string,
    stack: EngineStack,
    options: { limit: number; maxBytes: number },
  ): Promise<IacUpdate[]>;
  readLock(store: ObjectStore, root: string, stack: EngineStack): Promise<IacLock | null>;
}
