export const PROJECT_NOTIFICATION_FILTER_OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'starts_with',
  'greater_than',
  'greater_or_equal',
  'less_than',
  'less_or_equal',
  'exists',
] as const;

export type ProjectNotificationFilterOperator =
  (typeof PROJECT_NOTIFICATION_FILTER_OPERATORS)[number];

export type ProjectNotificationFilter = {
  field: string;
  operator: ProjectNotificationFilterOperator;
  value: string;
};

function fieldValue(payload: unknown, field: string): unknown {
  return field.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, payload);
}

function comparable(value: unknown): number | string {
  const number = Number(value);
  if (value !== '' && Number.isFinite(number)) return number;

  const timestamp = Date.parse(String(value));
  if (Number.isFinite(timestamp)) return timestamp;

  return String(value).toLowerCase();
}

export function matchesProjectNotificationFilters(
  payload: unknown,
  filters: ProjectNotificationFilter[],
): boolean {
  return filters.every((filter) => {
    const actual = fieldValue(payload, filter.field);
    const expected = filter.value.trim().toLowerCase();
    const normalized = String(actual ?? '').toLowerCase();

    switch (filter.operator) {
      case 'equals':
        return normalized === expected;
      case 'not_equals':
        return normalized !== expected;
      case 'contains':
        return Array.isArray(actual)
          ? actual.some((item) => String(item).toLowerCase() === expected)
          : normalized.includes(expected);
      case 'not_contains':
        return Array.isArray(actual)
          ? actual.every((item) => String(item).toLowerCase() !== expected)
          : !normalized.includes(expected);
      case 'starts_with':
        return normalized.startsWith(expected);
      case 'greater_than':
        if (actual === undefined || actual === null || actual === '') return false;
        return comparable(actual) > comparable(filter.value);
      case 'greater_or_equal':
        if (actual === undefined || actual === null || actual === '') return false;
        return comparable(actual) >= comparable(filter.value);
      case 'less_than':
        if (actual === undefined || actual === null || actual === '') return false;
        return comparable(actual) < comparable(filter.value);
      case 'less_or_equal':
        if (actual === undefined || actual === null || actual === '') return false;
        return comparable(actual) <= comparable(filter.value);
      case 'exists':
        return actual !== undefined && actual !== null && actual !== '';
    }
  });
}

export function formatProjectNotificationFilter(filters: ProjectNotificationFilter[]): string {
  const symbols: Record<ProjectNotificationFilterOperator, string> = {
    equals: '=',
    not_equals: '!=',
    contains: '~',
    not_contains: '!~',
    starts_with: '^=',
    greater_than: '>',
    greater_or_equal: '>=',
    less_than: '<',
    less_or_equal: '<=',
    exists: 'IS NOT EMPTY',
  };

  return filters
    .map((filter) =>
      filter.operator === 'exists'
        ? `${filter.field} ${symbols[filter.operator]}`
        : `${filter.field} ${symbols[filter.operator]} "${filter.value.replaceAll('"', '\\"')}"`,
    )
    .join(' AND ');
}
