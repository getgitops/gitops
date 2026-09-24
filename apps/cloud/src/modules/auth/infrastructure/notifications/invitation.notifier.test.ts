import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerTransport, resetTransports } from '$lib/server/infra/notifications';
import { InvitationNotifier } from './invitation.notifier';

const send = vi.fn(async (notification: { to: string[]; subject: string; content: string }) => {
  return notification;
});

describe('InvitationNotifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTransports();
    registerTransport('mail', { send } as never);
  });

  afterEach(() => {
    resetTransports();
  });

  it('sends the rendered invite template to the invited email', async () => {
    await new InvitationNotifier().sendInvitation({
      email: 'jose@example.com',
      username: 'jose',
      organizationName: 'GitOps',
      roleName: 'Developer',
      inviteUrl: 'https://app.local/auth/login',
      expiresAt: '2024-01-08T00:00:00.000Z',
      invitedBy: 'admin',
    });

    expect(send).toHaveBeenCalledTimes(1);
    const notification = send.mock.calls[0]?.[0];
    expect(notification).toBeDefined();

    expect(notification.to).toEqual(['jose@example.com']);
    expect(notification.subject).toBe('You have been invited to GitOps');
    expect(notification.content).toContain('admin has invited you to join GitOps');
    expect(notification.content).toContain('Developer');
    expect(notification.content).toContain('https://app.local/auth/login');
    expect(notification.content).not.toContain('{{');
  });

  it('falls back to the product name when there is no inviter', async () => {
    await new InvitationNotifier().sendInvitation({
      email: 'jose@example.com',
      username: 'jose',
      organizationName: 'GitOps',
      roleName: 'Developer',
      inviteUrl: 'https://app.local/auth/login',
      expiresAt: '2024-01-08T00:00:00.000Z',
      invitedBy: null,
    });

    const notification = send.mock.calls[0]?.[0];
    expect(notification).toBeDefined();
    expect(notification.content).toContain('GitOps has invited you to join GitOps');
  });
});
