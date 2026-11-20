import type { DomainEventMap, EventType } from '../domain-events';
import { codeReportEvents } from './code-report.events';
import { vaultEvents } from './vault.events';
import type {
  EventCatalog,
  EventDefinition,
  EventDefinitionScope,
  EventFieldDefinition,
  EventModule,
} from './types';

export type * from './types';
export { OPERATORS } from './fields';
export { CODE_REPORT_TOOLS } from './code-report.events';
export { VAULT_SECRET_CHANGED_FIELDS } from './vault.events';

/**
 * Builds the catalog. The parameter type makes it exhaustive (every `DomainEventMap` entry needs a
 * definition) and checks each field `key` without `derive` against its payload.
 */
export function defineEventCatalog<const C extends EventCatalog>(catalog: C): C {
  for (const [type, definition] of Object.entries(catalog) as [string, EventDefinition][]) {
    if (definition.type !== type) {
      throw new Error(`Event catalog entry "${type}" declares type "${definition.type}"`);
    }
    const keys = definition.fields.map((field) => field.key);
    const duplicate = keys.find((key, index) => keys.indexOf(key) !== index);
    if (duplicate) {
      throw new Error(`Event "${type}" declares field "${duplicate}" twice`);
    }
  }
  return catalog;
}

export const EVENT_CATALOG: EventCatalog = defineEventCatalog({
  ...codeReportEvents,
  ...vaultEvents,
});

export function isEventType(value: string): value is EventType {
  return Object.hasOwn(EVENT_CATALOG, value);
}

export function getEventDefinition<K extends EventType>(type: K): EventDefinition<K> {
  return EVENT_CATALOG[type] as EventDefinition<K>;
}

/** Events offered in the alert builder, optionally narrowed by scope and module. */
export function listAlertableEvents(
  filter: { scope?: EventDefinitionScope; module?: EventModule } = {},
): EventDefinition[] {
  return (Object.values(EVENT_CATALOG) as EventDefinition[]).filter(
    (definition) =>
      definition.alertable &&
      (!filter.scope || definition.scope === filter.scope) &&
      (!filter.module || definition.module === filter.module),
  );
}

export function getFieldDefinition<K extends EventType>(
  type: K,
  fieldKey: string,
): EventFieldDefinition<DomainEventMap[K]> | undefined {
  return getEventDefinition(type).fields.find((field) => field.key === fieldKey);
}

/**
 * Value of a catalog field for an event: `derive(payload)` for computed fields, the dotted path
 * otherwise. `undefined` when the field is not in the catalog or the path is missing.
 */
export function getFieldValue(
  event: { type: EventType; payload: unknown },
  fieldKey: string,
): unknown {
  const field = getFieldDefinition(event.type, fieldKey) as EventFieldDefinition | undefined;
  if (!field) return undefined;
  if (field.derive) return field.derive(event.payload);
  return readPath(event.payload, field.key as string);
}

function readPath(source: unknown, path: string): unknown {
  let current = source;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
