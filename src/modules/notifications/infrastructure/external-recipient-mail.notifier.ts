import { MailNotification, emailButton, renderEmail } from '#lib/server/infra/notifications';
import { DEFAULT_MAIL_LOCALE, translator } from '#lib/server/infra/notifications/i18n';
import type {
  ExternalRecipientNotifierPort,
  VerificationEmail,
} from '../application/external-recipient.service';

export type ExternalRecipientMailOptions = {
  /** Sends one email now (`notify`): the link carries a token, so no queue and no bus. */
  send: (notification: MailNotification) => Promise<void>;
  organizationName: (organizationId: string) => Promise<string | null>;
};

/**
 * Confirmation email for an external address (`external-recipient-verify`). The owner has no
 * GitOps account, so the language is the default one (English).
 */
export class ExternalRecipientMailNotifier implements ExternalRecipientNotifierPort {
  constructor(private readonly options: ExternalRecipientMailOptions) {}

  async sendVerification(email: VerificationEmail): Promise<void> {
    const t = translator(DEFAULT_MAIL_LOCALE);
    const organization =
      (await this.options.organizationName(email.organizationId).catch(() => null)) ?? 'GitOps';
    const subject = t('notifications.email.verify.subject', { organization });
    const content = await renderEmail(
      'external-recipient-verify',
      {
        title: t('notifications.email.verify.title'),
        intro: t('notifications.email.verify.intro', { organization, email: email.email }),
        explanation: t('notifications.email.verify.explanation'),
        actionButton: emailButton(email.verifyUrl, t('notifications.email.verify.action')),
        expiry: t('notifications.email.verify.expiry', {
          date: new Date(email.expiresAt).toUTCString(),
        }),
        ignore: t('notifications.email.verify.ignore'),
        verifyUrl: email.verifyUrl,
      },
      { subject, lang: DEFAULT_MAIL_LOCALE, footer: t('notifications.email.verify.footer') },
    );
    await this.options.send(new MailNotification({ to: email.email, subject, content }));
  }
}
