import { DomainEvent } from '../domain-event';

export interface ProjectServerKeyDeletedPayload {
  projectId: string;
  keyId: string;
  name: string;
}

export class ProjectServerKeyDeletedEvent extends DomainEvent<ProjectServerKeyDeletedPayload> {
  static readonly eventName = 'project.server-key.deleted';

  get name(): string {
    return ProjectServerKeyDeletedEvent.eventName;
  }
}
