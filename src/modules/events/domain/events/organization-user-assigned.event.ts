import { DomainEvent } from '../domain-event';

export interface OrganizationUserAssignedPayload {
  organizationId: string;
  userId: string;
  roleId: string;
  roleName: string;
  roleSlug: string;
  accessId: string;
  /** How the user landed in the organization. */
  origin: 'assigned' | 'created' | 'invited';
}

export class OrganizationUserAssignedEvent extends DomainEvent<OrganizationUserAssignedPayload> {
  static readonly eventName = 'organization.user.assigned';

  get name(): string {
    return OrganizationUserAssignedEvent.eventName;
  }
}
