import { absoluteUrl, type ChannelMessage } from '#lib/server/infra/notifications';
import { DEFAULT_MAIL_LOCALE, translator } from '#lib/server/infra/notifications/i18n';
import type { AlertEmail } from '../application/alert-engine';
import type { EventFieldDefinition } from '#lib/events/catalog';
import { readAlertField } from '../domain/condition-evaluator';
import { describeEventFields, eventResourcePath, eventSummaryText } from './event-summary';

/** What a channel message is built from: an alert email without its recipient. */
export type AlertMessageInput = Omit<AlertEmail, 'recipient'>;

/**
 * Provider-neutral message of an alert for a notification channel. In the default language (a
 * channel is shared by people with different ones) and without sensitive fields (people reading
 * the channel may not be allowed to see the event); transports format it.
 */
export function buildAlertChannelMessage(input: AlertMessageInput): ChannelMessage {
  const t = translator(DEFAULT_MAIL_LOCALE);
  const { event, definition, where, alert } = input;
  const eventLabel = t(definition.label);
  const summary = eventSummaryText(event, definition, t);
  const url = absoluteUrl(eventResourcePath(event, definition, where));

  const fields = [
    { label: t('alerts.email.occurredAt'), value: new Date(event.occurredAt).toUTCString() },
    ...(where.project ? [{ label: t('alerts.email.project'), value: where.project }] : []),
    ...describeEventFields(event, definition, input.names, { omitSensitive: true }).map(
      (field) => ({
        label: t(field.label),
        value: field.translate ? t(field.value) : field.value,
      }),
    ),
  ];

  const headline = t('alerts.email.alertSubject', { alert: alert.name, summary });
  const text = input.test ? t('alerts.email.testSubject', { subject: headline }) : headline;

  return {
    title: alert.name,
    summary,
    eventLabel,
    fields,
    link: url ? { url, label: t('alerts.email.viewInApp') } : null,
    suppressed: input.suppressed,
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
