import type { EventType } from '../domain-events';
import { OPERATORS } from './fields';
import type { EventDefinition, EventDefinitionScope, EventFieldDefinition } from './types';

/**
 * Field an organization alert uses to narrow a project event to some projects. Its value comes
 * from the event scope (`scope.projectId`), not from the payload.
 */
export const PROJECT_SCOPE_FIELD = {
  key: 'projectId',
  label: 'events.scopeFields.projectId',
  type: 'reference',
  reference: 'project',
  operators: OPERATORS.reference,
  // never called: the evaluator reads `scope.projectId` for this field (see `isScopeField`)
  derive: () => undefined,
} as const satisfies EventFieldDefinition;

/**
 * Fields an alert of `alertScope` can filter `definition` by: the catalog fields plus, for an
 * organization alert on a project event, the project the event happened in.
 */
export function listAlertFields(
  definition: EventDefinition,
  alertScope: EventDefinitionScope,
): readonly EventFieldDefinition[] {
  const fields = definition.fields as readonly EventFieldDefinition[];
  const ownsProjectId = fields.some((field) => field.key === PROJECT_SCOPE_FIELD.key);
  if (alertScope === 'organization' && definition.scope === 'project' && !ownsProjectId) {
    return [...fields, PROJECT_SCOPE_FIELD as EventFieldDefinition];
  }
  return fields;
}

/** Whether `field` reads its value from the event scope rather than the payload. */
export function isScopeField(field: EventFieldDefinition): boolean {
  return field === (PROJECT_SCOPE_FIELD as EventFieldDefinition);
}

export type AlertableEventInput = {
  type: EventType;
  payload: unknown;
  scope?: { organizationId?: string | null; projectId?: string | null };
};
