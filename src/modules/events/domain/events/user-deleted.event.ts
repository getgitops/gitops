import { DomainEvent } from '../domain-event';

export interface UserDeletedPayload {
  userId: string;
  username: string | null;
  scope: 'cluster' | 'organization' | 'project';
  organizationId?: string | null;
}

export class UserDeletedEvent extends DomainEvent<UserDeletedPayload> {
  static readonly eventName = 'user.deleted';

  get name(): string {
    return UserDeletedEvent.eventName;
  }
}
