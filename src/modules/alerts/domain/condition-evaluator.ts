import {
  getFieldValue,
  isScopeField,
  listAlertFields,
  type AlertableEventInput,
  type EventDefinition,
  type EventFieldDefinition,
  type FieldType,
} from '#lib/events/catalog';
import type { AlertCondition, AlertMatch, AlertScope } from './alert.domain';

/** The part of an alert the evaluator needs. */
export type EvaluableAlert = {
  scope: AlertScope;
  match: AlertMatch;
  conditions: readonly AlertCondition[];
};

function isAbsent(value: unknown): boolean {
  return value === undefined || value === null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toTime(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Comparable value of `raw` for a field of `type`; `null` when it can't be compared. */
function comparable(type: FieldType, raw: unknown): number | string | null {
  if (type === 'number') return toNumber(raw);
  if (type === 'date') return toTime(raw);
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  return null;
}

function compare(type: FieldType, actual: unknown, expected: unknown): number | null {
  const left = comparable(type, actual);
  const right = comparable(type, expected);
  if (left === null || right === null || typeof left !== typeof right) return null;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function equals(type: FieldType, actual: unknown, expected: unknown): boolean {
  return compare(type, actual, expected) === 0;
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

/**
 * Evaluates one condition against the field value of an event.
 *
 * - An absent value (`undefined` / `null`) fails every operator except `exists`.
 * - A list value (e.g. `changedFields`) matches `in` when it shares any item with the condition
 *   value and `not_in` when it shares none; `eq` / `neq` test whether it contains the value.
 * - `contains` and `starts_with` ignore case; `gt`… compare numbers for `number` fields and
 *   instants for `date` fields (ISO 8601).
 */
export function evaluateCondition(
  field: Pick<EventFieldDefinition, 'type'>,
  condition: Pick<AlertCondition, 'operator' | 'value'>,
  actual: unknown,
): boolean {
  if (condition.operator === 'exists') return !isAbsent(actual);
  if (isAbsent(actual)) return false;

  const type = field.type;
  const expected = condition.value;

  switch (condition.operator) {
    case 'is_true':
      return actual === true;
    case 'is_false':
      return actual === false;
    case 'eq':
      return asList(actual).some((item) => equals(type, item, expected));
    case 'neq':
      return !asList(actual).some((item) => equals(type, item, expected));
    case 'in': {
      const options = asList(expected);
      return asList(actual).some((item) => options.some((option) => equals(type, item, option)));
    }
    case 'not_in': {
      const options = asList(expected);
      return !asList(actual).some((item) => options.some((option) => equals(type, item, option)));
    }
    case 'contains':
    case 'starts_with': {
      if (typeof actual !== 'string' || typeof expected !== 'string') return false;
      const haystack = actual.toLocaleLowerCase();
      const needle = expected.toLocaleLowerCase();
      return condition.operator === 'contains'
        ? haystack.includes(needle)
        : haystack.startsWith(needle);
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const order = compare(type, actual, expected);
      if (order === null) return false;
      if (condition.operator === 'gt') return order > 0;
      if (condition.operator === 'gte') return order >= 0;
      if (condition.operator === 'lt') return order < 0;
      return order <= 0;
    }
    default:
      return false;
  }
}

/** Value of `field` for `event`: the event scope for scope fields, the catalog otherwise. */
export function readAlertField(event: AlertableEventInput, field: EventFieldDefinition): unknown {
  if (isScopeField(field)) return event.scope?.projectId ?? undefined;
  try {
    return getFieldValue(event, field.key as string);
  } catch {
    // a `derive` on an incomplete payload (sample events, older payload shapes) counts as absent
    return undefined;
  }
}

/**
 * Whether `event` satisfies the alert's conditions: `all` is AND, `any` is OR, and no conditions
 * always match. A condition on a field the event definition doesn't have never matches.
 */
export function matches(
  event: AlertableEventInput,
  alert: EvaluableAlert,
  definition: EventDefinition,
): boolean {
  if (alert.conditions.length === 0) return true;

  const fields = listAlertFields(definition, alert.scope);
  const results = alert.conditions.map((condition) => {
    const field = fields.find((candidate) => candidate.key === condition.field);
    if (!field) return false;
    return evaluateCondition(field, condition, readAlertField(event, field));
  });

  return alert.match === 'any' ? results.some(Boolean) : results.every(Boolean);
}
