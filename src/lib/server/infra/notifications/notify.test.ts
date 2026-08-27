import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MailNotification } from './mail-notification';
import { Notification, type NotificationChannel } from './notification';
import { notify, registerTransport, resetTransports } from './notify';
import { SlackNotification } from './slack-notification';

class UnknownNotification extends Notification {
  readonly channel = 'webhook' as NotificationChannel;
  validate(): void {}
}

function mailNotification() {
  return new MailNotification({
    to: 'user@example.com',
    subject: 'Welcome',
    content: '<p>Hi</p>',
  });
}

describe('notify', () => {
  beforeEach(() => {
    resetTransports();
  });

  afterEach(() => {
    resetTransports();
  });

  it('delegates to the transport registered for the channel', async () => {
    const send = vi.fn(async () => {});
    registerTransport('mail', { send } as never);

    const notification = mailNotification();
    await notify(notification);

    expect(send).toHaveBeenCalledWith(notification);
  });

  it('validates the notification before sending it', async () => {
    const send = vi.fn(async () => {});
    registerTransport('mail', { send } as never);

    await expect(
      notify(new MailNotification({ to: '', subject: 'Welcome', content: '<p>Hi</p>' })),
    ).rejects.toThrow(/at least one recipient/);
    expect(send).not.toHaveBeenCalled();
  });

  it('routes each notification type to its own transport', async () => {
    const mailSend = vi.fn(async () => {});
    const slackSend = vi.fn(async () => {});
    registerTransport('mail', { send: mailSend } as never);
    registerTransport('slack', { send: slackSend } as never);

    await notify(new SlackNotification({ channelName: '#alerts', text: 'Deploy done' }));

    expect(slackSend).toHaveBeenCalledTimes(1);
    expect(mailSend).not.toHaveBeenCalled();
  });

  it('throws when no transport handles the channel', async () => {
    await expect(notify(new UnknownNotification())).rejects.toThrow(/No transport registered/);
  });

  it('rejects values that are not notifications', async () => {
    await expect(notify({ channel: 'mail' } as never)).rejects.toThrow(
      /expects a Notification instance/,
    );
  });

  it('propagates transport failures', async () => {
    registerTransport('mail', {
      send: async () => {
        throw new Error('smtp down');
      },
    } as never);

    await expect(notify(mailNotification())).rejects.toThrow('smtp down');
  });

  it('restores the built-in transports on reset', async () => {
    registerTransport('slack', { send: async () => {} } as never);
    resetTransports();

    await expect(
      notify(new SlackNotification({ channelName: '#alerts', text: 'Deploy done' })),
    ).rejects.toThrow(/not implemented yet/);
  });
});
