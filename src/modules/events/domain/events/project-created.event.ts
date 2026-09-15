import { DomainEvent } from '../domain-event';

export interface ProjectCreatedPayload {
  projectId: string;
  organizationId: string;
  name: string | null;
  slug: string | null;
}

export class ProjectCreatedEvent extends DomainEvent<ProjectCreatedPayload> {
  static readonly eventName = 'project.created';

  get name(): string {
    return ProjectCreatedEvent.eventName;
  }
}
