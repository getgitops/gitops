import {
  MailNotification,
  PRODUCT_NAME,
  notify,
  renderEmail,
} from '#lib/server/infra/notifications';

export type InvitationNotificationInput = {
  email: string;
  username: string;
  organizationName: string;
  roleName: string;
  inviteUrl: string;
  expiresAt: string;
  invitedBy?: string | null;
};

export class InvitationNotifier {
  async sendInvitation(input: InvitationNotificationInput): Promise<void> {
    const subject = `You have been invited to ${input.organizationName}`;
    // sent directly, not through the bus or the queue: the link carries the invitation token
    const content = await renderEmail(
      'invite',
      {
        inviterName: input.invitedBy || PRODUCT_NAME,
        organizationName: input.organizationName,
        recipientName: input.username,
        roleName: input.roleName,
        inviteUrl: input.inviteUrl,
        expiresAt: new Date(input.expiresAt).toUTCString(),
      },
      {
        subject,
        footer: 'If you were not expecting this invitation you can safely ignore this email.',
      },
    );

    await notify(new MailNotification({ to: input.email, subject, content }));
  }
}
