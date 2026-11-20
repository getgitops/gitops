import {
  isScopeField,
  listAlertFields,
  type EventDefinition,
  type EventFieldDefinition,
} from '#lib/events/catalog';
import type { AlertCondition, AlertScope } from './alert.domain';

/** A value that satisfies `condition` for `field`, or `undefined` when none can be made up. */
function satisfying(field: EventFieldDefinition, condition: AlertCondition): unknown {
  const value = condition.value;
  const first = Array.isArray(value) ? value[0] : value;
  switch (condition.operator) {
    case 'eq':
    case 'contains':
    case 'starts_with':
      return field.type === 'number' ? Number(value) : value;
    case 'in':
      return Array.isArray(value) ? first : value;
    case 'gt':
    case 'gte':
      if (field.type === 'date') return new Date(Date.parse(String(value)) + 60_000).toISOString();
      return Number(value) + 1;
    case 'lt':
    case 'lte':
      if (field.type === 'date') return new Date(Date.parse(String(value)) - 60_000).toISOString();
      return Number(value) - 1;
    case 'is_true':
      return true;
    case 'is_false':
      return false;
    case 'exists':
      return field.type === 'number' ? 1 : 'sample';
    default:
      // neq / not_in: anything else works, but there is nothing sensible to invent
      return undefined;
  }
}

function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const segments = path.split('.');
  let node = target;
  for (const segment of segments.slice(0, -1)) {
    if (typeof node[segment] !== 'object' || node[segment] === null) node[segment] = {};
    node = node[segment] as Record<string, unknown>;
  }
  node[segments[segments.length - 1]] = value;
}

/**
 * Example event for "Test alert": a payload built so that, where possible, every condition holds
 * (derived fields can't be forced). Values the caller passes win over the invented ones.
 */
export function buildSampleEvent(
  definition: EventDefinition,
  alert: { scope: AlertScope; conditions: readonly AlertCondition[] },
  overrides: { payload?: Record<string, unknown>; projectId?: string | null } = {},
): { payload: Record<string, unknown>; projectId: string | null } {
  const fields = listAlertFields(definition, alert.scope);
  const payload: Record<string, unknown> = {};
  let projectId: string | null = null;

  for (const condition of alert.conditions) {
    const field = fields.find((candidate) => candidate.key === condition.field);
    if (!field) continue;
    const value = satisfying(field, condition);
    if (value === undefined) continue;
    if (isScopeField(field)) projectId = typeof value === 'string' ? value : null;
    else if (!field.derive) setPath(payload, field.key as string, value);
  }

  return {
    payload: { ...payload, ...(overrides.payload ?? {}) },
    projectId: overrides.projectId ?? projectId,
  };
}
