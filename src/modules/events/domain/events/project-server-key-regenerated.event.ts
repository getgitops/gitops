import { DomainEvent } from '../domain-event';

export interface ProjectServerKeyRegeneratedPayload {
  projectId: string;
  keyId: string;
  name: string;
  expiresAt: string | null;
}

export class ProjectServerKeyRegeneratedEvent extends DomainEvent<ProjectServerKeyRegeneratedPayload> {
  static readonly eventName = 'project.server-key.regenerated';

  get name(): string {
    return ProjectServerKeyRegeneratedEvent.eventName;
  }
}
