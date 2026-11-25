import type { Operator } from '#lib/events/catalog';
import type { AlertOption, CatalogEntry, CatalogField, DraftCondition } from './types';

export type Translate = (key: string, options?: { values?: Record<string, unknown> }) => string;

/** Operators that take no value, and those that take a list. */
export const VALUELESS_OPERATORS: readonly Operator[] = ['is_true', 'is_false', 'exists'];
export const LIST_OPERATORS: readonly Operator[] = ['in', 'not_in'];

export function operatorLabel(operator: Operator | '', t: Translate): string {
  return operator ? t(`alerts.operators.${operator}`) : '';
}

/** Human value of a condition: option labels for enums, entity names for references. */
export function conditionValueLabel(
  field: CatalogField,
  value: DraftCondition['value'] | undefined,
  referenceOptions: Record<string, AlertOption[]>,
  t: Translate,
): string {
  const items = Array.isArray(value) ? value : value === undefined || value === '' ? [] : [value];
  return items
    .map((item) => {
      const text = String(item);
      if (field.type === 'enum') {
        const option = field.options?.find((candidate) => candidate.value === text);
        return option ? t(option.label) : text;
      }
      if (field.type === 'reference' && field.reference) {
        return (
          referenceOptions[field.reference]?.find((option) => option.id === text)?.label ?? text
        );
      }
      if (field.type === 'date') return new Date(text).toLocaleDateString();
      return text;
    })
    .join(', ');
}

/**
 * "Servicio es api-gateway y Vulnerabilidades críticas mayor que 0". Conditions on fields the
 * catalog no longer has keep their raw key.
 */
export function summarizeConditions(
  definition: CatalogEntry | undefined,
  conditions: readonly DraftCondition[],
  match: 'all' | 'any',
  referenceOptions: Record<string, AlertOption[]>,
  t: Translate,
): string {
  if (conditions.length === 0) return t('alerts.summary.always');
  const parts = conditions.map((condition) => {
    const field = definition?.fields.find((candidate) => candidate.key === condition.field);
    const label = field ? t(field.label) : condition.field;
    const operator = operatorLabel(condition.operator, t);
    if (!field || VALUELESS_OPERATORS.includes(condition.operator as Operator)) {
      return `${label} ${operator}`.trim();
    }
    return `${label} ${operator} ${conditionValueLabel(field, condition.value, referenceOptions, t)}`;
  });
  return parts.join(` ${t(match === 'any' ? 'alerts.summary.or' : 'alerts.summary.and')} `);
}

/** "Project Admin, ana, ops@example.com" — mail targets: roles, users and external addresses. */
export function summarizeRecipients(
  recipients: { userIds: string[]; roleIds: string[]; emails?: string[] },
  users: AlertOption[],
  roles: AlertOption[],
  t: Translate,
): string {
  const names = [
    ...recipients.roleIds.map((id) => roles.find((role) => role.id === id)?.label ?? id),
    ...recipients.userIds.map((id) => users.find((user) => user.id === id)?.label ?? id),
    ...(recipients.emails ?? []),
  ];
  return names.length > 0 ? names.join(', ') : t('alerts.summary.noRecipients');
}

/** Targets of one channel, ready to print: names for mail, `#canal` for Slack, spaces, URLs. */
export function channelTargets(
  channel: string,
  recipients: {
    userIds: string[];
    roleIds: string[];
    emails?: string[];
    slackChannels?: string[];
    googleChatSpaces?: string[];
    webhookUrls?: string[];
  },
  users: AlertOption[],
  roles: AlertOption[],
): string[] {
  if (channel === 'mail') {
    return [
      ...recipients.roleIds.map((id) => roles.find((role) => role.id === id)?.label ?? id),
      ...recipients.userIds.map((id) => users.find((user) => user.id === id)?.label ?? id),
      ...(recipients.emails ?? []),
    ];
  }
  if (channel === 'slack') return recipients.slackChannels ?? [];
  if (channel === 'google_chat') return recipients.googleChatSpaces ?? [];
  if (channel === 'webhook') return recipients.webhookUrls ?? [];
  return [];
}
