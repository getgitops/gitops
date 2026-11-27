/**
 * Draft helpers usable on the client: the wizard edits an `AlertDraft` and posts it to the same
 * form actions the page editor uses (`#lib/server/alerts/page`).
 */
import { emptyRecipients } from '#modules/alerts/domain/alert.domain';
import type { AlertDraft, AlertRow } from './types';

export function emptyDraft(): AlertDraft {
  return {
    name: '',
    description: '',
    enabled: true,
    eventType: '',
    match: 'all',
    conditions: [],
    recipients: emptyRecipients(),
    channelIds: [],
    throttleMinutes: 0,
  };
}

export function draftFromAlert(alert: AlertRow): AlertDraft {
  return {
    name: alert.name,
    description: alert.description ?? '',
    enabled: alert.enabled,
    eventType: alert.eventType,
    match: alert.match,
    conditions: alert.conditions.map((condition) => ({
      field: condition.field,
      operator: condition.operator,
      value:
        condition.value === undefined
          ? ''
          : Array.isArray(condition.value)
            ? [...condition.value]
            : condition.value,
    })),
    // copia de cada lista: `alert` puede ser un proxy reactivo (no admite structuredClone)
    recipients: Object.fromEntries(
      Object.entries({ ...emptyRecipients(), ...alert.recipients }).map(([key, list]) => [
        key,
        [...list],
      ]),
    ) as AlertDraft['recipients'],
    channelIds: [...(alert.channelIds ?? [])],
    throttleMinutes: alert.throttleMinutes,
  };
}

/** Same field names as the page editor, so `parseAlertForm` reads both. */
export function draftToFormData(
  draft: AlertDraft,
  extra: Record<string, string | null | undefined> = {},
): FormData {
  const form = new FormData();
  form.set('name', draft.name);
  form.set('description', draft.description);
  if (draft.enabled) form.set('enabled', 'on');
  form.set('eventType', draft.eventType);
  form.set('match', draft.match);
  form.set('throttleMinutes', String(draft.throttleMinutes));
  const lists = {
    userIds: draft.recipients.userIds,
    roleIds: draft.recipients.roleIds,
    emails: draft.recipients.emails,
    channelIds: draft.channelIds,
  };
  for (const [name, values] of Object.entries(lists)) {
    for (const value of values) form.append(name, value);
  }
  draft.conditions.forEach((condition, index) => {
    const multiple = Array.isArray(condition.value);
    form.set(`conditions.${index}.field`, condition.field);
    form.set(`conditions.${index}.operator`, condition.operator);
    form.set(`conditions.${index}.multiple`, multiple ? 'true' : 'false');
    for (const value of multiple ? (condition.value as string[]) : [condition.value]) {
      form.append(`conditions.${index}.value`, String(value ?? ''));
    }
  });
  for (const [key, value] of Object.entries(extra)) if (value) form.set(key, value);
  return form;
}
