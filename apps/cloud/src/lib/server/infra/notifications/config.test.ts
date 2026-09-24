import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatSender, isSmtpConfigured, readSmtpConfig, requireSmtpConfig } from './config';

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
  for (const key of KEYS) {
    original.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    const value = original.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function setMinimalConfig() {
  process.env.NOTIFICATION_SMTP_HOST = 'smtp.example.com';
  process.env.NOTIFICATION_SMTP_FROM = 'noreply@example.com';
}

describe('readSmtpConfig', () => {
  it('returns null when the host or the sender are missing', () => {
    expect(readSmtpConfig()).toBeNull();
    expect(isSmtpConfigured()).toBe(false);

    process.env.NOTIFICATION_SMTP_HOST = 'smtp.example.com';
    expect(readSmtpConfig()).toBeNull();
  });

  it('applies defaults for the optional variables', () => {
    setMinimalConfig();

    expect(readSmtpConfig()).toEqual({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: null,
      password: null,
      from: 'noreply@example.com',
      fromName: null,
      rejectUnauthorized: true,
    });
    expect(isSmtpConfigured()).toBe(true);
  });

  it('enables TLS by default on port 465', () => {
    setMinimalConfig();
    process.env.NOTIFICATION_SMTP_PORT = '465';

    expect(readSmtpConfig()?.secure).toBe(true);
  });

  it('lets the secure flag be overridden explicitly', () => {
    setMinimalConfig();
    process.env.NOTIFICATION_SMTP_PORT = '465';
    process.env.NOTIFICATION_SMTP_SECURE = 'false';

    expect(readSmtpConfig()?.secure).toBe(false);
  });

  it('reads credentials when both are provided', () => {
    setMinimalConfig();
    process.env.NOTIFICATION_SMTP_USER = 'mailer';
    process.env.NOTIFICATION_SMTP_PASSWORD = 's3cret';

    const config = requireSmtpConfig();
    expect(config.user).toBe('mailer');
    expect(config.password).toBe('s3cret');
  });

  it('rejects a partial credentials pair', () => {
    setMinimalConfig();
    process.env.NOTIFICATION_SMTP_USER = 'mailer';

    expect(() => readSmtpConfig()).toThrow(/must be set together/);
  });

  it('rejects an invalid port', () => {
    setMinimalConfig();
    process.env.NOTIFICATION_SMTP_PORT = 'not-a-port';

    expect(() => readSmtpConfig()).toThrow(/valid port number/);
  });

  it('keeps certificate validation on unless explicitly disabled', () => {
    setMinimalConfig();
    process.env.NOTIFICATION_SMTP_REJECT_UNAUTHORIZED = 'false';

    expect(readSmtpConfig()?.rejectUnauthorized).toBe(false);
  });
});

describe('requireSmtpConfig', () => {
  it('throws when SMTP is not configured', () => {
    expect(() => requireSmtpConfig()).toThrow(/SMTP is not configured/);
  });
});

describe('formatSender', () => {
  it('includes the display name when present', () => {
    setMinimalConfig();
    expect(formatSender(requireSmtpConfig())).toBe('noreply@example.com');

    process.env.NOTIFICATION_SMTP_FROM_NAME = 'GitOps';
    expect(formatSender(requireSmtpConfig())).toBe('GitOps <noreply@example.com>');
  });
});
