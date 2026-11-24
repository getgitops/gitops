import { getFieldValue, type EventDefinition, type EventMessage } from '#lib/events/catalog';
import type { AnyDomainEvent } from '#lib/server/events';

export type EventFieldLine = {
  /** i18n key of the field label. */
  label: string;
  value: string;
  /** `value` is an i18n key (enum options, yes/no). */
  translate?: boolean;
};

function safeValue(event: AnyDomainEvent, key: string): unknown {
  try {
    return getFieldValue(event, key);
  } catch {
    return undefined;
  }
}

/**
 * The catalog fields of an event as label/value lines for an email. Reference ids are replaced by
 * the names in `names` when known; enum values and booleans become i18n keys. `omitSensitive`
 * leaves out fields marked `sensitive` (emails to external recipients).
 */
export function describeEventFields(
  event: AnyDomainEvent,
  definition: EventDefinition,
  names: ReadonlyMap<string, string> = new Map(),
  options: { omitSensitive?: boolean } = {},
): EventFieldLine[] {
  const lines: EventFieldLine[] = [];
  for (const field of definition.fields) {
    if (options.omitSensitive && field.sensitive) continue;
    const value = safeValue(event, field.key as string);
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;

    if (typeof value === 'boolean') {
      lines.push({
        label: field.label,
        value: value ? 'common.yes' : 'common.no',
        translate: true,
      });
      continue;
    }
    if (field.type === 'enum' && typeof value === 'string') {
      const option = field.options?.find((candidate) => candidate.value === value);
      lines.push(
        option
          ? { label: field.label, value: option.label, translate: true }
          : { label: field.label, value },
      );
      continue;
    }
    if (field.type === 'date' && typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
      lines.push({ label: field.label, value: new Date(value).toUTCString() });
      continue;
    }
    const items = Array.isArray(value) ? value : [value];
    lines.push({
      label: field.label,
      value: items.map((item) => names.get(String(item)) ?? String(item)).join(', '),
    });
  }
  return lines;
}

type Translate = (key: string, values?: Record<string, unknown>) => string;

type DefinitionCallbacks = EventDefinition & {
  link?: (context: unknown) => string | null;
  mailSummary?: (payload: unknown) => EventMessage;
};

function safely<T>(run: () => T): T | undefined {
  try {
    return run();
  } catch {
    return undefined;
  }
}

/**
 * One-line summary of an event (`3 critical, 5 high`), or its label. A definition callback that
 * chokes on the payload (an incomplete example event) falls back to the label.
 */
export function eventSummaryText(
  event: Pick<AnyDomainEvent, 'payload'>,
  definition: EventDefinition,
  t: Translate,
): string {
  const message = safely(() => (definition as DefinitionCallbacks).mailSummary?.(event.payload));
  return message ? t(message.key, message.values) : t(definition.label);
}

/** App path of the resource the event is about (`/org/…`), or `null`. */
export function eventResourcePath(
  event: Pick<AnyDomainEvent, 'payload'>,
  definition: EventDefinition,
  where: { organizationSlug?: string; projectSlug?: string },
): string | null {
  return (
    safely(() =>
      (definition as DefinitionCallbacks).link?.({
        payload: event.payload,
        organizationSlug: where.organizationSlug ?? null,
        projectSlug: where.projectSlug ?? null,
      }),
    ) ?? null
  );
}
