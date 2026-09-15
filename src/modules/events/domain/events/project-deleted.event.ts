import { DomainEvent } from '../domain-event';

export interface ProjectDeletedPayload {
  projectId: string;
  organizationId: string | null;
  name: string | null;
  slug: string | null;
}

export class ProjectDeletedEvent extends DomainEvent<ProjectDeletedPayload> {
  static readonly eventName = 'project.deleted';

  get name(): string {
    return ProjectDeletedEvent.eventName;
  }
}
