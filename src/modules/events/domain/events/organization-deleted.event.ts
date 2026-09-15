import { DomainEvent } from '../domain-event';

export interface OrganizationDeletedPayload {
  organizationId: string;
  name: string;
  slug: string;
}

export class OrganizationDeletedEvent extends DomainEvent<OrganizationDeletedPayload> {
  static readonly eventName = 'organization.deleted';

  get name(): string {
    return OrganizationDeletedEvent.eventName;
  }
}
