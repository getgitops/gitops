/** Human-readable summaries for gitdb entity row changes, used by the audit log UI. */

export type EntityRowChange =
  | { type: 'added'; row: Record<string, unknown> }
  | { type: 'removed'; row: Record<string, unknown> }
  | { type: 'modified'; before: Record<string, unknown>; after: Record<string, unknown>; changedFields: string[] };

export type FieldValue =
  | { kind: 'text'; text: string }
  | { kind: 'flags'; flags: { label: string; value: boolean }[] }
  | { kind: 'list'; items: string[] }
  | { kind: 'json'; json: unknown };

export type ListDiffEntry = { item: string; status: 'added' | 'removed' | 'unchanged' };

export type FieldSummary = {
  label: string;
  before?: FieldValue;
  after?: FieldValue;
};

export type ChangeSummary = {
  title: string;
  fields: FieldSummary[];
};

type EntityLabel = { label: string; feminine: boolean };

const ENTITY_LABELS: Record<string, EntityLabel> = {
  organizations: { label: 'organización', feminine: true },
  roles: { label: 'rol', feminine: false },
  users: { label: 'usuario', feminine: false },
  projects: { label: 'proyecto', feminine: false },
  user_access: { label: 'acceso de usuario', feminine: false },
};

// fields that are noise in a human summary (always touched, rarely meaningful on their own)
const IGNORED_FIELDS = new Set(['id', 'createdAt', 'updatedAt']);

const FIELD_LABELS: Record<string, string> = {
  id: 'ID',
  name: 'Nombre',
  slug: 'Slug',
  description: 'Descripción',
  email: 'Email',
  permissions: 'Permisos',
  scope: 'Alcance',
  organizationId: 'Organización',
  projectId: 'Proyecto',
  roleId: 'Rol',
  userId: 'Usuario',
  isActive: 'Activo',
  modules: 'Módulos',
  settings: 'Configuración',
  status: 'Estado',
};

function entityLabel(entity: string): EntityLabel {
  return ENTITY_LABELS[entity] ?? { label: entity, feminine: false };
}

function humanizeField(field: string): string {
  if (FIELD_LABELS[field]) {
    return FIELD_LABELS[field];
  }

  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (typeof value === 'boolean') {
    return value ? 'Sí' : 'No';
  }
  if (Array.isArray(value)) {
    return value.length ? value.map((item) => formatValue(item)).join(', ') : '—';
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }
  return String(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// { key: boolean, ... } shapes (e.g. project `modules`) render as toggle chips instead of raw JSON
function isFlagsObject(value: Record<string, unknown>): boolean {
  const values = Object.values(value);
  return values.length > 0 && values.every((entry) => typeof entry === 'boolean');
}

/** Classifies a raw field value into how it should be rendered: plain text, flag chips, a chip list, or a JSON block. */
export function classifyValue(value: unknown): FieldValue {
  if (isPlainObject(value)) {
    if (isFlagsObject(value)) {
      return {
        kind: 'flags',
        flags: Object.entries(value).map(([key, entry]) => ({ label: humanizeField(key), value: Boolean(entry) })),
      };
    }
    return { kind: 'json', json: value };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { kind: 'text', text: '—' };
    }
    if (value.every((item) => typeof item === 'string' || typeof item === 'number')) {
      return { kind: 'list', items: value.map((item) => String(item)) };
    }
    return { kind: 'json', json: value };
  }

  return { kind: 'text', text: formatValue(value) };
}

/** Diffs two string lists (e.g. role permissions) so additions/removals can be highlighted together. */
export function diffListItems(before: string[], after: string[]): ListDiffEntry[] {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const entries: ListDiffEntry[] = after.map((item) => ({
    item,
    status: beforeSet.has(item) ? 'unchanged' : 'added',
  }));

  for (const item of before) {
    if (!afterSet.has(item)) {
      entries.push({ item, status: 'removed' });
    }
  }

  return entries;
}

function displayName(row: Record<string, unknown> | undefined): string {
  if (!row) return '';
  const candidate = row.name ?? row.slug ?? row.title ?? row.email ?? row.id;
  return candidate !== undefined && candidate !== null ? String(candidate) : '';
}

export function summarizeChange(entity: string, change: EntityRowChange): ChangeSummary {
  const { label, feminine } = entityLabel(entity);
  const capitalizedLabel = label.charAt(0).toUpperCase() + label.slice(1);

  if (change.type === 'added') {
    const name = displayName(change.row);
    const newWord = feminine ? 'Nueva' : 'Nuevo';
    const fields = Object.entries(change.row)
      .filter(([field]) => !IGNORED_FIELDS.has(field))
      .map(([field, value]) => ({ label: humanizeField(field), after: classifyValue(value) }));

    return {
      title: `${newWord} ${label} cread${feminine ? 'a' : 'o'}${name ? `: ${name}` : ''}`,
      fields,
    };
  }

  if (change.type === 'removed') {
    const name = displayName(change.row);
    const fields = Object.entries(change.row)
      .filter(([field]) => !IGNORED_FIELDS.has(field))
      .map(([field, value]) => ({ label: humanizeField(field), before: classifyValue(value) }));

    return {
      title: `${capitalizedLabel} eliminad${feminine ? 'a' : 'o'}${name ? `: ${name}` : ''}`,
      fields,
    };
  }

  const name = displayName(change.after) || displayName(change.before);
  const fields = change.changedFields
    .filter((field) => !IGNORED_FIELDS.has(field))
    .map((field) => ({
      label: humanizeField(field),
      before: classifyValue(change.before[field]),
      after: classifyValue(change.after[field]),
    }));

  return {
    title: `${capitalizedLabel} actualizad${feminine ? 'a' : 'o'}${name ? `: ${name}` : ''}`,
    fields,
  };
}
