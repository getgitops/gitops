import nodemailer, { type Transporter } from 'nodemailer';
import { formatSender, requireSmtpConfig, type SmtpConfig } from './config';
import type { MailNotification } from './mail-notification';
import type { NotificationTransport } from './transport';

let transporter: Transporter | null = null;
let signature: string | null = null;

function configSignature(config: SmtpConfig): string {
  return [config.host, config.port, config.secure, config.user, config.rejectUnauthorized].join(
    '|',
  );
}

function getTransporter(config: SmtpConfig): Transporter {
  const current = configSignature(config);
  if (!transporter || signature !== current) {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth:
        config.user && config.password ? { user: config.user, pass: config.password } : undefined,
      tls: { rejectUnauthorized: config.rejectUnauthorized },
    });
    signature = current;
  }
  return transporter;
}

export function resetMailTransport(): void {
  transporter = null;
  signature = null;
}

export const mailTransport: NotificationTransport<MailNotification> = {
  async send(notification) {
    const config = requireSmtpConfig();
    await getTransporter(config).sendMail({
      from: formatSender(config),
      to: notification.to,
      subject: notification.subject,
      html: notification.content,
    });
  },
};
