import { DomainEvent } from '../domain-event';

export interface VaultEnvironmentDeletedPayload {
  projectId: string;
  environmentId: string;
  name: string;
  slug: string;
}

export class VaultEnvironmentDeletedEvent extends DomainEvent<VaultEnvironmentDeletedPayload> {
  static readonly eventName = 'vault.environment.deleted';

  get name(): string {
    return VaultEnvironmentDeletedEvent.eventName;
  }
}
