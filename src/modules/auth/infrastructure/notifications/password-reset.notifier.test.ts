import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerTransport, resetTransports } from '$lib/server/infra/notifications';
import { PasswordResetNotifier } from './password-reset.notifier';

const send = vi.fn(async (notification: { to: string[]; subject: string; content: string }) => {
  return notification;
});

describe('PasswordResetNotifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTransports();
    registerTransport('mail', { send } as never);
  });

  afterEach(() => {
    resetTransports();
  });

  it('sends the rendered password reset template to the user email', async () => {
    await new PasswordResetNotifier().sendPasswordReset({
      email: 'jose@example.com',
      username: 'jose',
      resetUrl: 'https://app.local/auth/reset-password?token=abc',
      expiresAt: '2024-01-08T00:00:00.000Z',
    });

    expect(send).toHaveBeenCalledTimes(1);
    const notification = send.mock.calls[0]?.[0];
    expect(notification).toBeDefined();

    expect(notification.to).toEqual(['jose@example.com']);
    expect(notification.subject).toBe('Reset your GitOps password');
    expect(notification.content).toContain('Hi jose,');
    expect(notification.content).toContain('https://app.local/auth/reset-password?token=abc');
    expect(notification.content).not.toContain('{{');
  });
});
