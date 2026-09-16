import {
  CodeReportAnalysisCompletedEvent,
  CodeReportAnalysisFailedEvent,
  CodeReportAnalysisStartedEvent,
  OrganizationUserAssignedEvent,
  ProjectServerKeyCreatedEvent,
  ProjectServerKeyDeletedEvent,
  ProjectServerKeyRegeneratedEvent,
  VaultEnvironmentCreatedEvent,
  VaultEnvironmentDeletedEvent,
  VaultEnvironmentUpdatedEvent,
} from '$modules/events';

export const PROJECT_NOTIFICATION_EVENT_CLASSES = [
  CodeReportAnalysisStartedEvent,
  CodeReportAnalysisCompletedEvent,
  CodeReportAnalysisFailedEvent,
  ProjectServerKeyCreatedEvent,
  ProjectServerKeyRegeneratedEvent,
  ProjectServerKeyDeletedEvent,
  VaultEnvironmentCreatedEvent,
  VaultEnvironmentUpdatedEvent,
  VaultEnvironmentDeletedEvent,
  OrganizationUserAssignedEvent,
];

export type ProjectNotificationEventField = {
  id: string;
  name: string;
  type?: 'text' | 'number' | 'datetime';
  options?: string[];
};

export type ProjectNotificationEventDefinition = {
  id: string;
  name: string;
  scope: 'project' | 'organization';
  fields: ProjectNotificationEventField[];
};

export const PROJECT_NOTIFICATION_EVENT_DEFINITIONS: ProjectNotificationEventDefinition[] = [
  {
    id: 'code-report.analysis.started',
    name: 'Code Report analysis started',
    scope: 'project',
    fields: [
      { id: 'tool', name: 'Tool' },
      { id: 'serviceId', name: 'Service ID' },
    ],
  },
  {
    id: 'code-report.analysis.completed',
    name: 'Code Report analysis completed',
    scope: 'project',
    fields: [
      { id: 'tool', name: 'Tool' },
      { id: 'serviceId', name: 'Service ID' },
      { id: 'policyCompliant', name: 'Policy compliant', options: ['true', 'false'] },
      { id: 'summary.vulnerabilities.critical', name: 'Critical', type: 'number' },
      { id: 'summary.vulnerabilities.high', name: 'High', type: 'number' },
      { id: 'summary.vulnerabilities.medium', name: 'Medium', type: 'number' },
      { id: 'summary.vulnerabilities.low', name: 'Low', type: 'number' },
    ],
  },
  {
    id: 'code-report.analysis.failed',
    name: 'Code Report analysis failed',
    scope: 'project',
    fields: [
      { id: 'tool', name: 'Tool' },
      { id: 'serviceId', name: 'Service ID' },
      { id: 'error', name: 'Error' },
    ],
  },
  ...['created', 'regenerated'].map((action) => ({
    id: `project.server-key.${action}`,
    name: `Project server key ${action}`,
    scope: 'project' as const,
    fields: [
      { id: 'name', name: 'Key name' },
      { id: 'keyId', name: 'Key ID' },
      { id: 'expiresAt', name: 'Expiration date', type: 'datetime' as const },
    ],
  })),
  {
    id: 'project.server-key.deleted',
    name: 'Project server key deleted',
    scope: 'project',
    fields: [
      { id: 'name', name: 'Key name' },
      { id: 'keyId', name: 'Key ID' },
    ],
  },
  ...['created', 'updated', 'deleted'].map((action) => ({
    id: `vault.environment.${action}`,
    name: `Vault environment ${action}`,
    scope: 'project' as const,
    fields: [
      { id: 'name', name: 'Environment name' },
      { id: 'slug', name: 'Environment slug' },
      { id: 'environmentId', name: 'Environment ID' },
    ],
  })),
  {
    id: 'organization.user.assigned',
    name: 'User added to organization',
    scope: 'organization',
    fields: [
      { id: 'roleSlug', name: 'Role slug' },
      { id: 'roleName', name: 'Role name' },
      { id: 'origin', name: 'Assignment origin', options: ['assigned', 'created', 'invited'] },
      { id: 'userId', name: 'User ID' },
    ],
  },
];

export const PROJECT_NOTIFICATION_EVENTS = PROJECT_NOTIFICATION_EVENT_CLASSES.map(
  (eventClass) => eventClass.eventName,
);

export function isProjectNotificationEvent(value: unknown): value is string {
  return (PROJECT_NOTIFICATION_EVENTS as readonly string[]).includes(String(value));
}

export function getProjectNotificationEventDefinition(eventName: string) {
  return PROJECT_NOTIFICATION_EVENT_DEFINITIONS.find((event) => event.id === eventName);
}
