import type { FieldChange } from './domain-events';

export const MAX_CHANGE_VALUE_LENGTH = 200;

export function changeValue(value: unknown): string | null {
  let text: string;
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) text = value.map(String).join(', ');
  else if (typeof value === 'object') return null;
  else text = String(value);
  text = text.trim();
  if (!text) return null;
  const chars = Array.from(text);
  return chars.length > MAX_CHANGE_VALUE_LENGTH
    ? `${chars.slice(0, MAX_CHANGE_VALUE_LENGTH - 1).join('')}…`
    : text;
}

export function fieldChange<F extends string>(
  field: F,
  before: unknown,
  after: unknown,
): FieldChange<F> {
  return { field, before: changeValue(before), after: changeValue(after) };
}
