import { DomainEvent } from '../domain-event';

export interface ProjectServerKeyCreatedPayload {
  projectId: string;
  keyId: string;
  name: string;
  roleId: string;
  createdByUserId: string;
  expiresAt: string | null;
}

export class ProjectServerKeyCreatedEvent extends DomainEvent<ProjectServerKeyCreatedPayload> {
  static readonly eventName = 'project.server-key.created';

  get name(): string {
    return ProjectServerKeyCreatedEvent.eventName;
  }
}
