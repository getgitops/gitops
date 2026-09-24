import { describe, expect, it } from 'vitest';
import { SlackNotification } from './slack-notification';

describe('SlackNotification', () => {
  it('exposes the slack channel', () => {
    const notification = new SlackNotification({ channelName: '#alerts', text: 'Deploy done' });
    expect(notification.channel).toBe('slack');
  });

  it('requires a channel and a text', () => {
    expect(() => new SlackNotification({ channelName: '  ', text: 'x' }).validate()).toThrow(
      /requires a channel/,
    );
    expect(() => new SlackNotification({ channelName: '#alerts', text: ' ' }).validate()).toThrow(
      /requires a text/,
    );
  });
});
