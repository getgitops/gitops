import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendMail = vi.fn(async () => ({ messageId: 'id' }));
const createTransport = vi.fn(() => ({ sendMail }));

vi.mock('nodemailer', () => ({
  default: { createTransport: (...args: unknown[]) => createTransport(...(args as [])) },
  createTransport: (...args: unknown[]) => createTransport(...(args as [])),
}));

const { mailTransport, resetMailTransport } = await import('./mail.transport');
const { MailNotification } = await import('./mail-notification');

const KEYS = [
  'NOTIFICATION_SMTP_HOST',
  'NOTIFICATION_SMTP_PORT',
  'NOTIFICATION_SMTP_SECURE',
  'NOTIFICATION_SMTP_USER',
  'NOTIFICATION_SMTP_PASSWORD',
  'NOTIFICATION_SMTP_FROM',
  'NOTIFICATION_SMTP_FROM_NAME',
  'NOTIFICATION_SMTP_REJECT_UNAUTHORIZED',
];

const original = new Map<string, string | undefined>();

beforeEach(() => {
  vi.clearAllMocks();
  resetMailTransport();
  for (const key of KEYS) {
    original.set(key, process.env[key]);
    delete process.env[key];
  }
  process.env.NOTIFICATION_SMTP_HOST = 'smtp.example.com';
  process.env.NOTIFICATION_SMTP_FROM = 'noreply@example.com';
});

afterEach(() => {
  for (const key of KEYS) {
    const value = original.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function notification() {
  return new MailNotification({
    to: ['user@example.com'],
    subject: 'Welcome',
    content: '<p>Hi</p>',
  });
}

describe('mailTransport', () => {
  it('builds the transporter from the NOTIFICATION_SMTP_* variables', async () => {
    process.env.NOTIFICATION_SMTP_PORT = '465';
    process.env.NOTIFICATION_SMTP_USER = 'mailer';
    process.env.NOTIFICATION_SMTP_PASSWORD = 's3cret';

    await mailTransport.send(notification());

    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      auth: { user: 'mailer', pass: 's3cret' },
      tls: { rejectUnauthorized: true },
    });
  });

  it('omits auth when no credentials are configured', async () => {
    await mailTransport.send(notification());

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ auth: undefined, port: 587, secure: false }),
    );
  });

  it('sends the notification as an HTML message', async () => {
    process.env.NOTIFICATION_SMTP_FROM_NAME = 'GitOps';

    await mailTransport.send(notification());

    expect(sendMail).toHaveBeenCalledWith({
      from: 'GitOps <noreply@example.com>',
      to: ['user@example.com'],
      subject: 'Welcome',
      html: '<p>Hi</p>',
    });
  });

  it('reuses the transporter while the configuration does not change', async () => {
    await mailTransport.send(notification());
    await mailTransport.send(notification());

    expect(createTransport).toHaveBeenCalledTimes(1);
  });

  it('rebuilds the transporter when the configuration changes', async () => {
    await mailTransport.send(notification());
    process.env.NOTIFICATION_SMTP_HOST = 'smtp2.example.com';
    await mailTransport.send(notification());

    expect(createTransport).toHaveBeenCalledTimes(2);
  });

  it('fails when SMTP is not configured', async () => {
    delete process.env.NOTIFICATION_SMTP_HOST;

    await expect(mailTransport.send(notification())).rejects.toThrow(/SMTP is not configured/);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
