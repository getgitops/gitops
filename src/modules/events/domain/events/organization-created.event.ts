import { DomainEvent } from '../domain-event';

export interface OrganizationCreatedPayload {
  organizationId: string;
  name: string;
  slug: string;
}

export class OrganizationCreatedEvent extends DomainEvent<OrganizationCreatedPayload> {
  static readonly eventName = 'organization.created';

  get name(): string {
    return OrganizationCreatedEvent.eventName;
  }
}
