import {
  MailNotification,
  PRODUCT_NAME,
  notify,
  renderEmail,
} from '#lib/server/infra/notifications';

export type PasswordResetNotificationInput = {
  email: string;
  username: string;
  resetUrl: string;
  expiresAt: string;
};

export class PasswordResetNotifier {
  async sendPasswordReset(input: PasswordResetNotificationInput): Promise<void> {
    const subject = `Reset your ${PRODUCT_NAME} password`;
    // sent directly, not through the bus or the queue: the link carries the reset token
    const content = await renderEmail(
      'password-reset',
      {
        recipientName: input.username,
        resetUrl: input.resetUrl,
        expiresAt: new Date(input.expiresAt).toUTCString(),
      },
      {
        subject,
        footer:
          'If you were not expecting this email you can safely ignore it — your password will not change.',
      },
    );

    await notify(
      new MailNotification({
        to: input.email,
        subject,
        content,
      }),
    );
  }
}
