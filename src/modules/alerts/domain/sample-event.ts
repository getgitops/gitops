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

/** Placeholder for a field no condition sets, so templates and summaries have data to show. */
function placeholder(field: EventFieldDefinition): unknown {
  switch (field.type) {
    case 'string':
      return 'example';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'enum':
      return field.options?.[0]?.value;
    case 'date':
      return new Date().toISOString();
    default:
      // references must point at real entities: none is invented
      return undefined;
  }
}

function getPath(target: Record<string, unknown>, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, segment) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[segment] : undefined,
      target,
    );
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
 * `complete` (test emails) starts from the definition's `samplePayload` and fills every other
 * catalog field with a typed placeholder, so the email has something to show.
 */
export function buildSampleEvent(
  definition: EventDefinition,
  alert: { scope: AlertScope; conditions: readonly AlertCondition[] },
  overrides: {
    payload?: Record<string, unknown>;
    projectId?: string | null;
    complete?: boolean;
  } = {},
): { payload: Record<string, unknown>; projectId: string | null } {
  const fields = listAlertFields(definition, alert.scope);
  const payload: Record<string, unknown> = overrides.complete
    ? structuredClone((definition.samplePayload ?? {}) as Record<string, unknown>)
    : {};
  let projectId: string | null = null;

  if (overrides.complete) {
    for (const field of fields) {
      if (field.derive || isScopeField(field)) continue;
      if (getPath(payload, field.key as string) !== undefined) continue;
      const value = placeholder(field);
      if (value !== undefined) setPath(payload, field.key as string, value);
    }
  }

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
