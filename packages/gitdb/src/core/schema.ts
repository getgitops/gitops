export type ColumnDataType =
  | 'integer'
  | 'bigint'
  | 'text'
  | 'varchar'
  | 'char'
  | 'boolean'
  | 'uuid'
  | 'double'
  | 'real'
  | 'numeric'
  | 'json'
  | 'date'
  | 'timestamp';

export type ColumnReference = {
  entity: string;
  field: string;
};

export type ColumnDefinition = {
  kind: 'column';
  dataType: ColumnDataType;
  mode?: string;
  length?: number;
  precision?: number;
  scale?: number;
  notNull?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  autoincrement?: boolean;
  hasDefault?: boolean;
  defaultValue?: unknown;
  defaultFn?: () => unknown;
  references?: ColumnReference;
};

export type EntitySchema = Record<string, ColumnDefinition>;

export type EntityDefinition<TSchema extends EntitySchema = EntitySchema> = {
  kind: 'entity';
  name: string;
  schema: TSchema;
};

export type ColumnInput = ColumnBuilder | ColumnDefinition | string;

export type EntitySchemaInput = Record<string, ColumnInput>;

export type ValidationMode = 'insert' | 'update';

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

const LEGACY_TYPE_MAP: Record<string, ColumnDataType> = {
  int: 'integer',
  integer: 'integer',
  bigint: 'bigint',
  string: 'text',
  text: 'text',
  varchar: 'varchar',
  char: 'char',
  bool: 'boolean',
  boolean: 'boolean',
  uuid: 'uuid',
  double: 'double',
  real: 'real',
  numeric: 'numeric',
  json: 'json',
  date: 'date',
  timestamp: 'timestamp',
};

function normalizeLegacyType(value: string): ColumnDataType {
  const normalized = LEGACY_TYPE_MAP[value.toLowerCase()];
  if (!normalized) {
    throw new Error(`Unsupported legacy column type: ${value}`);
  }

  return normalized;
}

function normalizeColumn(input: ColumnInput): ColumnDefinition {
  if (typeof input === 'string') {
    return {
      kind: 'column',
      dataType: normalizeLegacyType(input),
    };
  }

  if (input instanceof ColumnBuilder) {
    return input.build();
  }

  return {
    ...input,
    kind: 'column',
  };
}

function withFlag(source: ColumnDefinition, patch: Partial<ColumnDefinition>): ColumnDefinition {
  return {
    ...source,
    ...patch,
    kind: 'column',
  };
}

export class ColumnBuilder {
  constructor(private readonly definition: ColumnDefinition) {}

  build(): ColumnDefinition {
    return { ...this.definition, kind: 'column' };
  }

  notNull(): ColumnBuilder {
    return new ColumnBuilder(withFlag(this.definition, { notNull: true }));
  }

  default(value: unknown): ColumnBuilder {
    return new ColumnBuilder(
      withFlag(this.definition, {
        hasDefault: true,
        defaultValue: value,
      }),
    );
  }

  $defaultFn(fn: () => unknown): ColumnBuilder {
    return new ColumnBuilder(
      withFlag(this.definition, {
        hasDefault: true,
        defaultFn: fn,
      }),
    );
  }

  primaryKey(): ColumnBuilder {
    return new ColumnBuilder(withFlag(this.definition, { primaryKey: true, notNull: true }));
  }

  unique(): ColumnBuilder {
    return new ColumnBuilder(withFlag(this.definition, { unique: true }));
  }

  autoincrement(): ColumnBuilder {
    return new ColumnBuilder(withFlag(this.definition, { autoincrement: true }));
  }

  references(target: EntityDefinition | string, field = 'id'): ColumnBuilder {
    return new ColumnBuilder(
      withFlag(this.definition, {
        references: {
          entity: typeof target === 'string' ? target : target.name,
          field,
        },
      }),
    );
  }

  defaultRandom(): ColumnBuilder {
    return this.$defaultFn(() => crypto.randomUUID());
  }
}

function column(dataType: ColumnDataType, options: Partial<ColumnDefinition> = {}): ColumnBuilder {
  return new ColumnBuilder({
    kind: 'column',
    dataType,
    ...options,
  });
}

export function integer(): ColumnBuilder {
  return column('integer');
}

export function int(): ColumnBuilder {
  return integer();
}

export function bigint(): ColumnBuilder {
  return column('bigint');
}

export function text(): ColumnBuilder {
  return column('text');
}

export function varchar(options: { length?: number } = {}): ColumnBuilder {
  return column('varchar', { length: options.length });
}

export function char(options: { length?: number } = {}): ColumnBuilder {
  return column('char', { length: options.length });
}

export function boolean(): ColumnBuilder {
  return column('boolean');
}

export function bool(): ColumnBuilder {
  return boolean();
}

export function uuid(): ColumnBuilder {
  return column('uuid');
}

export function double(): ColumnBuilder {
  return column('double');
}

export function doublePrecision(): ColumnBuilder {
  return double();
}

export function real(): ColumnBuilder {
  return column('real');
}

export function numeric(options: { precision?: number; scale?: number } = {}): ColumnBuilder {
  return column('numeric', { precision: options.precision, scale: options.scale });
}

export function json(): ColumnBuilder {
  return column('json');
}

export function date(): ColumnBuilder {
  return column('date');
}

export function timestamp(): ColumnBuilder {
  return column('timestamp');
}

export function entity<TSchema extends EntitySchemaInput>(
  name: string,
  schema: TSchema,
): EntityDefinition<EntitySchema> {
  const normalizedEntries = Object.entries(schema).map(([fieldName, fieldDefinition]) => {
    return [fieldName, normalizeColumn(fieldDefinition)] as const;
  });

  return {
    kind: 'entity',
    name,
    schema: Object.fromEntries(normalizedEntries),
  };
}

function isJsonValue(value: unknown): boolean {
  if (value === null) {
    return true;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item));
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).every((item) => isJsonValue(item));
  }

  return false;
}

function isValueCompatible(dataType: ColumnDataType, value: unknown): boolean {
  switch (dataType) {
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'bigint':
      return typeof value === 'bigint' || (typeof value === 'number' && Number.isInteger(value));
    case 'double':
    case 'real':
    case 'numeric':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'text':
    case 'varchar':
    case 'char':
    case 'uuid':
    case 'date':
    case 'timestamp':
      return typeof value === 'string';
    case 'json':
      return isJsonValue(value);
    default:
      return true;
  }
}

export function validateEntityRow(
  entityDefinition: EntityDefinition,
  data: Record<string, unknown>,
  mode: ValidationMode = 'insert',
): ValidationResult {
  const errors: string[] = [];

  for (const [fieldName, fieldDefinition] of Object.entries(entityDefinition.schema)) {
    const hasValue = Object.prototype.hasOwnProperty.call(data, fieldName);
    const value = data[fieldName];

    if (mode === 'insert' && !hasValue) {
      const required = Boolean(fieldDefinition.notNull) && !fieldDefinition.hasDefault && !fieldDefinition.autoincrement;
      if (required) {
        errors.push(`Field ${fieldName} is required`);
      }
      continue;
    }

    if (mode === 'update' && !hasValue) {
      continue;
    }

    if ((value === null || value === undefined) && fieldDefinition.notNull) {
      errors.push(`Field ${fieldName} cannot be null`);
      continue;
    }

    if (value !== null && value !== undefined && !isValueCompatible(fieldDefinition.dataType, value)) {
      errors.push(`Field ${fieldName} expects ${fieldDefinition.dataType}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
