import {
  DEFAULT_CHANNEL_LOCALE,
  PRODUCT_NAME,
  absoluteUrl,
  type ChannelLocale,
  type ChannelMessage,
} from '#lib/server/infra/notifications';
import { translator } from '#lib/server/infra/notifications/i18n';
import type { FieldChange } from '#lib/events/domain-events';
import type { EventFieldDefinition } from '#lib/events/catalog';
import type { AlertEmail } from '../application/alert-engine';
import { readAlertField } from '../domain/condition-evaluator';
import {
  describeEventFields,
  eventResourcePath,
  eventSummaryText,
  fieldText,
} from './event-summary';

/** What a channel message is built from: an alert email without its recipient. */
export type AlertMessageInput = Omit<AlertEmail, 'recipient'>;

const CHANGED_FIELDS_KEY = 'changedFields';

/**
 * Provider-neutral message of an alert for a notification channel. In the default language (a
 * channel is shared by people with different ones) and without sensitive fields (people reading
 * the channel may not be allowed to see the event); transports format it.
 */
export function buildAlertChannelMessage(
  input: AlertMessageInput,
  locale: ChannelLocale = DEFAULT_CHANNEL_LOCALE,
): ChannelMessage {
  const t = translator(locale);
  const { event, definition, where, alert } = input;
  const eventLabel = t(definition.label);
  const summary = eventSummaryText(event, definition, t);
  const url = absoluteUrl(eventResourcePath(event, definition, where));
  const location = where.project
    ? { label: t('alerts.email.project'), name: where.project }
    : where.organization
      ? { label: t('alerts.email.organization'), name: where.organization }
      : undefined;
  const changes = describeChanges(input, t);

  const fields = describeEventFields(event, definition, input.names, { omitSensitive: true })
    .filter((field) => !(changes && field.key === CHANGED_FIELDS_KEY))
    .map((field) => ({
      label: t(field.label),
      value: fieldText(field, t),
    }))
    .filter((field) => !location || field.value !== location.name);

  const headline =
    summary !== eventLabel
      ? t('alerts.email.alertSubject', { alert: alert.name, summary })
      : `[${PRODUCT_NAME}] ${alert.name}`;
  const text = input.test ? t('alerts.email.testSubject', { subject: headline }) : headline;

  return {
    title: alert.name,
    summary,
    eventLabel,
    fields,
    occurredAt: event.occurredAt,
    ...(location ? { location } : {}),
    labels: {
      date: t('alerts.email.occurredAt'),
      changes: t('alerts.channel.changes'),
      before: t('alerts.channel.before'),
      after: t('alerts.channel.after'),
      empty: t('alerts.channel.empty'),
    },
    ...(changes ? { changes } : {}),
    link: url ? { url, label: t('alerts.email.viewInApp') } : null,
    suppressed: input.suppressed,
    ...(input.test
      ? { note: t('alerts.email.testNote') }
      : input.suppressed > 0
        ? { note: t('alerts.email.suppressed', { count: input.suppressed }) }
        : {}),
    text,
    test: input.test === true,
    event: {
      id: event.id,
      type: event.type,
      occurredAt: event.occurredAt,
      scope: { ...event.scope },
      fields: rawEventFields(input),
    },
    alert: { id: alert.id, name: alert.name },
  };
}

function describeChanges(
  { event, definition }: AlertMessageInput,
  t: (key: string, values?: Record<string, unknown>) => string,
): ChannelMessage['changes'] {
  const raw = (event.payload as { changes?: unknown }).changes;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const changedFields = definition.fields.find((field) => field.key === CHANGED_FIELDS_KEY);
  if (changedFields?.sensitive) return undefined;
  const label = (name: string) => {
    const option = changedFields?.options?.find((candidate) => candidate.value === name);
    return option ? t(option.label) : name;
  };
  const text = (value: unknown) => (typeof value === 'string' && value ? value : null);
  return (raw as FieldChange[])
    .filter((change) => change && typeof change.field === 'string')
    .map((change) => ({
      label: label(change.field),
      before: text(change.before),
      after: text(change.after),
    }));
}

/**
 * Catalog field values by key, as the event carries them (ids, enums, numbers), for formats that
 * want data rather than text (generic webhooks). Sensitive fields are left out, as in the text.
 */
function rawEventFields({ event, definition }: AlertMessageInput): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const field of definition.fields) {
    if (field.sensitive) continue;
    const value = readAlertField(event, field as EventFieldDefinition);
    if (value !== undefined) fields[field.key as string] = value;
  }
  return fields;
}
