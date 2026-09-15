import { DomainEvent } from '../domain-event';

export interface UserCreatedPayload {
  userId: string;
  username: string;
  email: string | null;
  scope: 'cluster' | 'organization';
  organizationId?: string | null;
  roleId?: string | null;
}

export class UserCreatedEvent extends DomainEvent<UserCreatedPayload> {
  static readonly eventName = 'user.created';

  get name(): string {
    return UserCreatedEvent.eventName;
  }
}
