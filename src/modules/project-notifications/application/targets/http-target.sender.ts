import type {
  NotificationTargetMessage,
  NotificationTargetSender,
} from './notification-target-sender';

export class HttpTargetSender implements NotificationTargetSender {
  readonly provider = 'http' as const;

  async send(message: NotificationTargetMessage): Promise<void> {
    if (!message.httpConfig) throw new Error('HTTP notification requires template configuration');
    const config = message.httpConfig;
    const response = await fetch(config.url, {
      method: config.method,
      headers: {
        ...config.headers,
        'content-type':
          message.bodyType === 'json' ? 'application/json' : 'text/plain; charset=utf-8',
      },
      body: message.text,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      throw new Error(
        `HTTP delivery failed (${response.status}): ${detail || response.statusText}`,
      );
    }
  }
}
