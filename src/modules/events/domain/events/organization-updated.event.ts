import { DomainEvent } from '../domain-event';

export interface OrganizationUpdatedPayload {
  organizationId: string;
  name: string;
  slug: string;
  changes: { name?: string; slug?: string; description?: string };
}

export class OrganizationUpdatedEvent extends DomainEvent<OrganizationUpdatedPayload> {
  static readonly eventName = 'organization.updated';

  get name(): string {
    return OrganizationUpdatedEvent.eventName;
  }
}
