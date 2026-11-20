import { MailNotification, notify, renderTemplateString } from '#lib/server/infra/notifications';
import * as messages from '#lib/paraglide/messages.js';

// the base locale of `project.inlang`; `#lib/i18n` is client-oriented (stores, `$app/env`)
type SupportedLocale = 'es' | 'en';
const DEFAULT_LOCALE: SupportedLocale = 'es';
import type { AlertEmail, AlertNotifierPort, SystemEmail } from '../application/alert-engine';
import { describeEventFields } from './event-summary';

type MessageFunction = (
  values?: Record<string, unknown>,
  options?: { locale?: SupportedLocale },
) => string;

/** Server-side translation of an i18n key; unknown keys fall back to the key itself. */
export function translateKey(
  id: string,
  values: Record<string, unknown> = {},
  locale: SupportedLocale = DEFAULT_LOCALE,
): string {
  const message = (messages as Record<string, unknown>)[id] as MessageFunction | undefined;
  return message ? message(values, { locale }) : id;
}

// minimal layout until the alert templates land (#81)
const LAYOUT = `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#111827;line-height:1.5">
<h2 style="margin:0 0 12px">{{ title }}</h2>
<p>{{ intro }}</p>
{{{ details }}}
<p style="color:#6b7280;font-size:12px;margin-top:24px">{{ footer }}</p>
</body></html>`;

function detailsTable(rows: { label: string; value: string }[]): string {
  if (rows.length === 0) return '';
  const body = rows
    .map((row) =>
      renderTemplateString(
        '<tr><td style="padding:4px 12px 4px 0;color:#6b7280">{{ label }}</td><td style="padding:4px 0">{{ value }}</td></tr>',
        row,
      ),
    )
    .join('');
  return `<table style="border-collapse:collapse;margin:12px 0">${body}</table>`;
}

/** Emails for alerts and system notifications, one recipient per message. */
export class AlertMailNotifier implements AlertNotifierPort {
  constructor(private readonly locale: SupportedLocale = DEFAULT_LOCALE) {}

  private t(id: string, values?: Record<string, unknown>) {
    return translateKey(id, values, this.locale);
  }

  async sendAlert(email: AlertEmail): Promise<void> {
    const eventLabel = this.t(email.definition.label);
    const subject = this.t('alerts.email.alertSubject', {
      alert: email.alert.name,
      event: eventLabel,
    });
    const rows = [
      { label: this.t('alerts.email.event'), value: eventLabel },
      {
        label: this.t('alerts.email.occurredAt'),
        value: new Date(email.event.occurredAt).toUTCString(),
      },
      ...describeEventFields(email.event, email.definition, email.names).map((field) => ({
        label: this.t(field.label),
        value: field.translate ? this.t(field.value) : field.value,
      })),
    ];
    const suppressed =
      email.suppressed > 0
        ? `<p>${renderTemplateString('{{ text }}', {
            text: this.t('alerts.email.suppressed', { count: email.suppressed }),
          })}</p>`
        : '';

    const content = renderTemplateString(LAYOUT, {
      title: email.alert.name,
      intro:
        email.alert.description || this.t('alerts.email.alertIntro', { alert: email.alert.name }),
      details: detailsTable(rows) + suppressed,
      footer: this.t('alerts.email.footer'),
    });

    await notify(new MailNotification({ to: email.recipient.email, subject, content }));
  }

  async sendSystemNotification(email: SystemEmail): Promise<void> {
    const target = email.names.project
      ? this.t('alerts.email.system.projectTarget', {
          project: email.names.project,
          organization: email.names.organization ?? '',
        })
      : (email.names.organization ?? 'GitOps');
    const payload = email.event.payload as { name?: string; keyPrefix?: string };
    const values = {
      target,
      role: email.names.role ?? '',
      name: payload.name ?? '',
      prefix: payload.keyPrefix ?? '',
    };
    const base = `alerts.email.system.${email.kind}`;
    const subject = this.t(`${base}.subject`, values);

    const content = renderTemplateString(LAYOUT, {
      title: subject,
      intro: this.t(`${base}.body`, values),
      details: '',
      footer: this.t('alerts.email.systemFooter'),
    });

    await notify(new MailNotification({ to: email.recipient.email, subject, content }));
  }
}
