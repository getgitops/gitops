export type EntityRow = Record<string, unknown>;

export type WhereClause = Record<string, unknown>;

export type RowPredicate = {
  kind: 'predicate';
  test: (row: EntityRow) => boolean;
  debug: string;
};

export type WhereInput = WhereClause | RowPredicate;

function isRowPredicate(input: WhereInput): input is RowPredicate {
  return (
    typeof input === 'object' &&
    input !== null &&
    'kind' in input &&
    (input as { kind?: unknown }).kind === 'predicate' &&
    'test' in input &&
    typeof (input as { test?: unknown }).test === 'function'
  );
}

export function toPredicate(input: WhereInput): RowPredicate {
  if (isRowPredicate(input)) {
    return input;
  }

  return {
    kind: 'predicate',
    debug: 'object-equality',
    test: (row) => Object.entries(input).every(([field, value]) => row[field] === value),
  };
}

export function toPredicates(inputs: WhereInput[]): RowPredicate[] {
  return inputs.map((input) => toPredicate(input));
}

function asString(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function normalizeIlikePattern(value: string): string {
  return value.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
}

function compareValues(left: unknown, right: unknown): number {
  if (left === right) {
    return 0;
  }

  if (left === undefined || left === null) {
    return -1;
  }

  if (right === undefined || right === null) {
    return 1;
  }

  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function makePredicate(debug: string, test: (row: EntityRow) => boolean): RowPredicate {
  return {
    kind: 'predicate',
    debug,
    test,
  };
}

export function eq(field: string, value: unknown): RowPredicate {
  return makePredicate(`eq(${field})`, (row) => row[field] === value);
}

export function ne(field: string, value: unknown): RowPredicate {
  return makePredicate(`ne(${field})`, (row) => row[field] !== value);
}

export function lt(field: string, value: unknown): RowPredicate {
  return makePredicate(`lt(${field})`, (row) => compareValues(row[field], value) < 0);
}

export function gte(field: string, value: unknown): RowPredicate {
  return makePredicate(`gte(${field})`, (row) => compareValues(row[field], value) >= 0);
}

export function ilike(field: string, pattern: string): RowPredicate {
  const regex = new RegExp(`^${normalizeIlikePattern(pattern)}$`, 'i');
  return makePredicate(`ilike(${field})`, (row) => regex.test(asString(row[field])));
}

export function and(...conditions: WhereInput[]): RowPredicate {
  const predicates = conditions.map((condition) => toPredicate(condition));
  return makePredicate('and(...)', (row) => predicates.every((predicate) => predicate.test(row)));
}

export function or(...conditions: WhereInput[]): RowPredicate {
  const predicates = conditions.map((condition) => toPredicate(condition));
  return makePredicate('or(...)', (row) => predicates.some((predicate) => predicate.test(row)));
}

export function not(condition: WhereInput): RowPredicate {
  const predicate = toPredicate(condition);
  return makePredicate('not(...)', (row) => !predicate.test(row));
}
