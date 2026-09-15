import { DomainEvent } from '../domain-event';

export interface VaultEnvironmentCreatedPayload {
  projectId: string;
  environmentId: string;
  name: string;
  slug: string;
}

export class VaultEnvironmentCreatedEvent extends DomainEvent<VaultEnvironmentCreatedPayload> {
  static readonly eventName = 'vault.environment.created';

  get name(): string {
    return VaultEnvironmentCreatedEvent.eventName;
  }
}
