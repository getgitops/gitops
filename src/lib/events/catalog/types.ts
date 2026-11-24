import type { PermissionGrant } from '#lib/permissions';
import type { DomainEventMap, EventType } from '../domain-events';

export type FieldType = 'string' | 'number' | 'boolean' | 'enum' | 'date' | 'reference';

export type Operator =
  // string, enum, reference
  | 'eq'
  | 'neq'
  | 'in'
  | 'not_in'
  // string
  | 'contains'
  | 'starts_with'
  // number, date
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  // boolean
  | 'is_true'
  | 'is_false'
  | 'exists';

export type FieldReference =
  | 'code_report_service'
  | 'code_report_policy'
  | 'project'
  | 'user'
  | 'role'
  | 'vault_environment'
  | 'api_key'
  | 'monitor';

export type EventModule =
  | 'code_report'
  | 'vault'
  | 'projects'
  | 'organization'
  | 'access'
  | 'monitoring';

export type EventDefinitionScope = 'organization' | 'project';

type Leaf = string | number | boolean | bigint | symbol | null | undefined | Date;

/**
 * Dotted paths to the fields of `T` (`'serviceId' | 'gitInfo' | 'gitInfo.branch' | ...`). Arrays
 * are leaves (filtered with `in` / `not_in`). Limited depth keeps the type cheap.
 */
export type PayloadPath<T, Depth extends unknown[] = []> = Depth['length'] extends 4
  ? never
  : T extends Leaf | readonly unknown[]
    ? never
    : {
        [K in Extract<keyof T, string>]: NonNullable<T[K]> extends Leaf | readonly unknown[]
          ? K
          : K | `${K}.${PayloadPath<NonNullable<T[K]>, [...Depth, 1]>}`;
      }[Extract<keyof T, string>];

type FieldCommon = {
  /** i18n key, `events.<type>.fields.<key>` */
  label: string;
  type: FieldType;
  /** Operators offered by the alert builder for this field. */
  operators: readonly Operator[];
  /** For `enum` fields; `label` is an i18n key. */
  options?: readonly { value: string; label: string }[];
  /** For `reference` fields: the UI lists these entities in the alert's scope; the id is stored. */
  reference?: FieldReference;
};

/**
 * A filterable field. Without `derive`, `key` must be a path of the payload (checked at compile
 * time). With `derive`, `key` is a computed name and the value comes from `derive(payload)`.
 */
export type EventFieldDefinition<P = unknown> = FieldCommon &
  ({ key: PayloadPath<P>; derive?: undefined } | { key: string; derive: (payload: P) => unknown });

/** What `link` receives: the payload plus the slugs of where the event happened. */
export type EventLinkContext<P = unknown> = {
  payload: P;
  organizationSlug: string | null;
  projectSlug: string | null;
};

/** An i18n key with its values, e.g. `alerts.email.summary.vulnerabilities` + counts. */
export type EventMessage = { key: string; values?: Record<string, unknown> };

export type EventDefinition<K extends EventType = EventType> = {
  type: K;
  module: EventModule;
  scope: EventDefinitionScope;
  /** i18n key, `events.<type>.label` */
  label: string;
  /** i18n key, `events.<type>.description` */
  description: string;
  /** Needed to create alerts on this event and to receive them. */
  readPermission: PermissionGrant;
  fields: readonly EventFieldDefinition<DomainEventMap[K]>[];
  /** `false`: internal use or system notifications only, not offered in the alert builder. */
  alertable: boolean;
  /** Email template for alerts on this event (`src/notifications/email/<name>.html`); the generic
   * `alert` template otherwise. */
  mailTemplate?: string;
  /** App path of the resource the event is about (`/org/<org>/…`), made absolute with `ORIGIN`. */
  link?: (context: EventLinkContext<DomainEventMap[K]>) => string | null;
  /** Short summary for the email subject (`3 critical, 5 high`); the event label otherwise. */
  mailSummary?: (payload: DomainEventMap[K]) => EventMessage;
};

/** Definitions for a subset of events (one module's file). */
export type EventDefinitions<K extends EventType> = { [P in K]: EventDefinition<P> };

/** Every event of `DomainEventMap` must have a definition. */
export type EventCatalog = EventDefinitions<EventType>;
