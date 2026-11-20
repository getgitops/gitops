import type { EventType } from '../domain-events';
import type { Operator } from './types';

/** Operator sets offered by the alert builder, per field type. */
export const OPERATORS = {
  reference: ['eq', 'neq', 'in', 'not_in'],
  enum: ['eq', 'neq', 'in', 'not_in'],
  string: ['eq', 'neq', 'contains', 'starts_with'],
  number: ['eq', 'gt', 'gte', 'lt', 'lte'],
  boolean: ['is_true', 'is_false'],
  list: ['in', 'not_in'],
} as const satisfies Record<string, readonly Operator[]>;

/** `label` and `description` i18n keys of an event. */
export function eventText<K extends EventType>(type: K) {
  return {
    type,
    label: `events.${type}.label`,
    description: `events.${type}.description`,
  } as const;
}

/** i18n key of a field label. */
export function fieldLabel(type: EventType, key: string): string {
  return `events.${type}.fields.${key}`;
}

/** Enum options whose labels live under `events.options.<group>.<value>`. */
export function enumOptions(group: string, values: readonly string[]) {
  return values.map((value) => ({ value, label: `events.options.${group}.${value}` }));
}
