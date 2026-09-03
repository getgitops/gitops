import { MailNotification, notify, renderTemplate } from '$lib/server/infra/notifications';

export type PasswordResetNotificationInput = {
  email: string;
  username: string;
  resetUrl: string;
  expiresAt: string;
};

const PRODUCT_NAME = 'GitOps';

export class PasswordResetNotifier {
  async sendPasswordReset(input: PasswordResetNotificationInput): Promise<void> {
    const subject = `Reset your ${PRODUCT_NAME} password`;
    const content = await renderTemplate('password-reset', {
      subject,
      productName: PRODUCT_NAME,
      recipientName: input.username,
      resetUrl: input.resetUrl,
      expiresAt: new Date(input.expiresAt).toUTCString(),
    });

    await notify(
      new MailNotification({
        to: input.email,
        subject,
        content,
      }),
    );
  }
}
