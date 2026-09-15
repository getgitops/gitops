import { DomainEvent } from '../domain-event';

export interface VaultEnvironmentUpdatedPayload {
  projectId: string;
  environmentId: string;
  slug: string;
  changes: { name?: string; slug?: string; description?: string };
}

export class VaultEnvironmentUpdatedEvent extends DomainEvent<VaultEnvironmentUpdatedPayload> {
  static readonly eventName = 'vault.environment.updated';

  get name(): string {
    return VaultEnvironmentUpdatedEvent.eventName;
  }
}
