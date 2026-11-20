import {
  MailNotification,
  absoluteUrl,
  renderEmail,
  renderTemplateString,
  type MailContext,
} from '#lib/server/infra/notifications';
import * as messages from '#lib/paraglide/messages.js';
import { getFieldValue, type EventDefinition, type EventMessage } from '#lib/events/catalog';
import type { CodeReportAnalysisCompletedPayload } from '#lib/events/domain-events';
import type { AlertEmail, AlertNotifierPort, SystemEmail } from '../application/alert-engine';
import { describeEventFields } from './event-summary';

// `#lib/i18n` is client-oriented (stores, `$app/env`): emails translate with paraglide directly
export type MailLocale = 'es' | 'en';
/** Language of an email when the recipient's is unknown. */
export const DEFAULT_MAIL_LOCALE: MailLocale = 'en';

type MessageFunction = (
  values?: Record<string, unknown>,
  options?: { locale?: MailLocale },
) => string;

type Translate = (key: string, values?: Record<string, unknown>) => string;

/** Server-side translation of an i18n key; unknown keys fall back to the key itself. */
export function translateKey(
  id: string,
  values: Record<string, unknown> = {},
  locale: MailLocale = DEFAULT_MAIL_LOCALE,
): string {
  const message = (messages as Record<string, unknown>)[id] as MessageFunction | undefined;
  return message ? message(values, { locale }) : id;
}

function localeOf(recipient: { locale?: string }): MailLocale {
  return recipient.locale === 'es' || recipient.locale === 'en'
    ? recipient.locale
    : DEFAULT_MAIL_LOCALE;
}

/** Where emails go: the mail queue in production, a recorder in tests. */
export type MailSender = {
  enqueue(notification: MailNotification, context?: MailContext): Promise<void>;
};

// internally generated HTML: every value goes through `{{ }}` (escaped)
function button(url: string | null, label: string): string {
  if (!url) return '';
  return renderTemplateString(
    '<p style="margin: 24px 0 8px 0; text-align: center"><a href="{{ url }}" style="display: inline-block; padding: 12px 24px; background-color: #111827; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600">{{ label }}</a></p>',
    { url, label },
  );
}

function fieldsTable(rows: { label: string; value: string }[]): string {
  if (rows.length === 0) return '';
  const body = rows
    .map((row) =>
      renderTemplateString(
        '<tr><td style="padding: 6px 12px 6px 0; color: #6b7280; vertical-align: top; width: 40%">{{ label }}</td><td style="padding: 6px 0; color: #111827; word-break: break-word">{{ value }}</td></tr>',
        row,
      ),
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; margin: 0 0 16px 0; font-size: 14px; border-top: 1px solid #f3f4f6" data-fields>${body}</table>`;
}

function note(text: string): string {
  if (!text) return '';
  return renderTemplateString(
    '<p style="margin: 0 0 16px 0; padding: 10px 14px; border-radius: 8px; background-color: #f9fafb; color: #4b5563; font-size: 13px">{{ text }}</p>',
    { text },
  );
}

const SEVERITIES = [
  { key: 'critical', color: '#b91c1c', background: '#fee2e2' },
  { key: 'high', color: '#c2410c', background: '#ffedd5' },
  { key: 'medium', color: '#a16207', background: '#fef9c3' },
  { key: 'low', color: '#1d4ed8', background: '#dbeafe' },
] as const;

/**
 * Alert and system emails. Each email has one recipient and goes through the mail queue, which
 * limits concurrency and retries temporary SMTP failures. Texts come from `alerts.email.*` in the
 * recipient's language (English when unknown); links are absolute (`ORIGIN`) or left out.
 */
export class AlertMailNotifier implements AlertNotifierPort {
  constructor(private readonly sender: MailSender) {}

  async sendAlert(email: AlertEmail): Promise<void> {
    const locale = localeOf(email.recipient);
    const t: Translate = (key, values) => translateKey(key, values, locale);
    const { event, where } = email;
    const definition = email.definition as EventDefinition & {
      link?: (context: unknown) => string | null;
      mailSummary?: (payload: unknown) => EventMessage;
    };

    const eventLabel = t(definition.label);
    const message = definition.mailSummary?.(event.payload);
    const summary = message ? t(message.key, message.values) : eventLabel;
    const subject = t('alerts.email.alertSubject', { alert: email.alert.name, summary });

    const resourcePath =
      definition.link?.({
        payload: event.payload,
        organizationSlug: where.organizationSlug ?? null,
        projectSlug: where.projectSlug ?? null,
      }) ?? null;
    const scopeName =
      email.alert.scope === 'project' && where.project ? where.project : (where.organization ?? '');

    const common = {
      eventLabel,
      title: email.alert.name,
      intro:
        email.alert.description ||
        t('alerts.email.alertIntro', { event: eventLabel, where: where.project ?? scopeName }),
      suppressedNote:
        email.suppressed > 0 ? note(t('alerts.email.suppressed', { count: email.suppressed })) : '',
      actionButton: button(absoluteUrl(resourcePath), t('alerts.email.viewInApp')),
    };

    const template = definition.mailTemplate ?? 'alert';
    const variables =
      template === 'alert-code-report-analysis'
        ? { ...common, ...this.analysisVariables(email, t) }
        : {
            ...common,
            fieldsTable: fieldsTable([
              {
                label: t('alerts.email.occurredAt'),
                value: new Date(event.occurredAt).toUTCString(),
              },
              ...(where.project
                ? [{ label: t('alerts.email.project'), value: where.project }]
                : []),
              ...describeEventFields(event, definition, email.names).map((field) => ({
                label: t(field.label),
                value: field.translate ? t(field.value) : field.value,
              })),
            ]),
          };

    const content = await renderEmail(template, variables, {
      subject,
      lang: locale,
      footer: t('alerts.email.footer', { alert: email.alert.name, where: scopeName }),
      footerLink: this.manageLink(email, t),
    });

    await this.sender.enqueue(
      new MailNotification({ to: email.recipient.email, subject, content }),
      { alertId: email.alert.id, eventId: event.id, kind: 'alert' },
    );
  }

  async sendSystemNotification(email: SystemEmail): Promise<void> {
    const locale = localeOf(email.recipient);
    const t: Translate = (key, values) => translateKey(key, values, locale);
    const { names } = email;

    const target = names.project
      ? t('alerts.email.system.projectTarget', {
          project: names.project,
          organization: names.organization ?? '',
        })
      : (names.organization ?? 'GitOps');
    const payload = email.event.payload as { name?: string; keyPrefix?: string };
    const values = {
      target,
      role: names.role ?? '',
      name: payload.name ?? '',
      prefix: payload.keyPrefix ?? '',
    };
    const base = `alerts.email.system.${email.kind}`;
    const subject = t(`${base}.subject`, values);
    const isApiKey = email.kind === 'api_key_created';

    // a revoked user has nothing left to open
    let path: string | null = null;
    if (isApiKey) path = '/profile';
    else if (email.kind !== 'access_revoked' && names.organizationSlug) {
      path = names.projectSlug
        ? `/org/${names.organizationSlug}/projects/${names.projectSlug}/overview`
        : `/org/${names.organizationSlug}/overview`;
    }

    const content = await renderEmail(
      isApiKey ? 'system-security-notice' : 'system-access-changed',
      {
        title: subject,
        greeting: t('alerts.email.greeting', { name: email.recipient.username }),
        message: t(`${base}.body`, values),
        warning: isApiKey ? t(`${base}.warning`) : '',
        actionButton: button(
          absoluteUrl(path),
          t(isApiKey ? 'alerts.email.system.openProfile' : 'alerts.email.viewInApp'),
        ),
      },
      { subject, lang: locale, footer: t('alerts.email.systemFooter') },
    );

    await this.sender.enqueue(
      new MailNotification({ to: email.recipient.email, subject, content }),
      { eventId: email.event.id, kind: email.kind },
    );
  }

  private manageLink(email: AlertEmail, t: Translate) {
    const { where } = email;
    if (!where.organizationSlug) return null;
    let base: string | null = `/org/${where.organizationSlug}/settings/alerts`;
    if (email.alert.scope === 'project') {
      base = where.projectSlug
        ? `/org/${where.organizationSlug}/projects/${where.projectSlug}/settings/alerts`
        : null;
    }
    const url = absoluteUrl(base ? `${base}/${email.alert.id}` : null);
    return url ? { url, label: t('alerts.email.manageAlert') } : null;
  }

  /** Variables of `alert-code-report-analysis`: service, git info, counts and policies. */
  private analysisVariables(email: AlertEmail, t: Translate) {
    const { event, definition } = email;
    const read = (key: string) => {
      try {
        return getFieldValue(event, key);
      } catch {
        return undefined;
      }
    };
    const field = (key: string) => definition.fields.find((candidate) => candidate.key === key);
    const serviceId = String(read('serviceId') ?? '');
    const toolValue = String(read('tool') ?? '');
    const toolOption = field('tool')?.options?.find((option) => option.value === toolValue);
    const payload = event.payload as Partial<CodeReportAnalysisCompletedPayload> & {
      error?: string;
    };

    const counts = payload.summary;
    const cells = counts
      ? SEVERITIES.map((severity) =>
          renderTemplateString(
            '<td style="padding: 10px 6px; border-radius: 8px; text-align: center; background-color: {{ background }}; color: {{ color }}"><div style="font-size: 20px; font-weight: 700">{{ count }}</div><div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em">{{ label }}</div></td>',
            {
              background: severity.background,
              color: severity.color,
              count: counts[severity.key],
              label: t(`alerts.email.severity.${severity.key}`),
            },
          ),
        ).join('')
      : '';
    const severityTable = cells
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; margin: 0 0 16px 0; border-collapse: separate; border-spacing: 6px 0" data-severities><tr>${cells}</tr></table>`
      : '';

    const policies = payload.policies;
    const policiesBlock =
      policies?.status === 'violated'
        ? note(
            t('alerts.email.policiesViolated', {
              count: policies.totalViolations,
              blocking: policies.blockingFailures,
            }),
          )
        : '';

    return {
      serviceLabel: t(field('serviceId')?.label ?? 'alerts.email.service'),
      service: email.names.get(serviceId) ?? serviceId,
      toolLabel: t(field('tool')?.label ?? 'alerts.email.tool'),
      tool: toolOption ? t(toolOption.label) : toolValue,
      branchLabel: t('alerts.email.branch'),
      branch: payload.gitInfo?.branch ?? '—',
      commitLabel: t('alerts.email.commit'),
      commit: payload.gitInfo?.commit ? payload.gitInfo.commit.slice(0, 12) : '—',
      severityTable,
      errorBlock: payload.error ? note(payload.error) : '',
      policiesBlock,
    };
  }
}
