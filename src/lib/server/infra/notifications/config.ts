import { env } from '$env/dynamic/private';

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  password: string | null;
  from: string;
  fromName: string | null;
  rejectUnauthorized: boolean;
};

const DEFAULT_PORT = 587;

function value(name: string): string | null {
  return env[name]?.trim() || null;
}

function flag(name: string, fallback: boolean): boolean {
  const raw = value(name);
  if (raw === null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

/** Reads NOTIFICATION_SMTP_* on every call so tests and config reloads see fresh values. */
export function readSmtpConfig(): SmtpConfig | null {
  const host = value('NOTIFICATION_SMTP_HOST');
  const from = value('NOTIFICATION_SMTP_FROM');
  if (!host || !from) {
    return null;
  }

  const rawPort = value('NOTIFICATION_SMTP_PORT');
  const port = rawPort ? Number(rawPort) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('NOTIFICATION_SMTP_PORT must be a valid port number');
  }

  const user = value('NOTIFICATION_SMTP_USER');
  const password = value('NOTIFICATION_SMTP_PASSWORD');
  if (Boolean(user) !== Boolean(password)) {
    throw new Error('NOTIFICATION_SMTP_USER and NOTIFICATION_SMTP_PASSWORD must be set together');
  }

  return {
    host,
    port,
    secure: flag('NOTIFICATION_SMTP_SECURE', port === 465),
    user,
    password,
    from,
    fromName: value('NOTIFICATION_SMTP_FROM_NAME'),
    // opt-in only: disabling certificate validation exposes the SMTP session to MITM
    rejectUnauthorized: flag('NOTIFICATION_SMTP_REJECT_UNAUTHORIZED', true),
  };
}

export function requireSmtpConfig(): SmtpConfig {
  const config = readSmtpConfig();
  if (!config) {
    throw new Error(
      'SMTP is not configured. Set NOTIFICATION_SMTP_HOST and NOTIFICATION_SMTP_FROM.',
    );
  }
  return config;
}

export function isSmtpConfigured(): boolean {
  return readSmtpConfig() !== null;
}

export function formatSender(config: SmtpConfig): string {
  return config.fromName ? `${config.fromName} <${config.from}>` : config.from;
}
