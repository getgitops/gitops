import { MailNotification, notify, renderTemplate } from '$lib/server/infra/notifications';

export type InvitationNotificationInput = {
  email: string;
  username: string;
  organizationName: string;
  roleName: string;
  inviteUrl: string;
  expiresAt: string;
  invitedBy?: string | null;
};

const PRODUCT_NAME = 'GitOps';

export class InvitationNotifier {
  async sendInvitation(input: InvitationNotificationInput): Promise<void> {
    const content = await renderTemplate('invite', {
      subject: `You have been invited to ${input.organizationName}`,
      productName: PRODUCT_NAME,
      inviterName: input.invitedBy || PRODUCT_NAME,
      organizationName: input.organizationName,
      recipientName: input.username,
      roleName: input.roleName,
      inviteUrl: input.inviteUrl,
      expiresAt: new Date(input.expiresAt).toUTCString(),
    });

    await notify(
      new MailNotification({
        to: input.email,
        subject: `You have been invited to ${input.organizationName}`,
        content,
      }),
    );
  }
}
