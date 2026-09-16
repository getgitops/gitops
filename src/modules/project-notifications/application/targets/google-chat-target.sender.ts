import type {
  NotificationTargetMessage,
  NotificationTargetSender,
} from './notification-target-sender';

export class GoogleChatTargetSender implements NotificationTargetSender {
  readonly provider = 'google-chat' as const;

  async send(message: NotificationTargetMessage): Promise<void> {
    const response = await fetch(message.credential, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: message.text }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      throw new Error(`Google Chat delivery failed: ${detail || response.statusText}`);
    }
  }
}
