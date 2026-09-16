import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectNotificationTargetService } from './project-notification-target.service';
import { ProjectNotificationTargetSender } from './project-notification-target.sender';

const postMessage = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
const webClientConstructor = vi.hoisted(() => vi.fn());

vi.mock('@slack/web-api', () => ({
  WebClient: class {
    constructor(token: string) {
      webClientConstructor(token);
    }
    chat = { postMessage };
  },
}));

function setup() {
  const targetService = {
    credentials: vi.fn(async (_projectId: string, provider: string) =>
      provider === 'slack'
        ? { credential: 'secret-token' }
        : {
            credential:
              'https://chat.googleapis.com/v1/spaces/AAAA/messages?key=key-value&token=token-value',
          },
    ),
  } as unknown as ProjectNotificationTargetService;
  return { targetService, sender: new ProjectNotificationTargetSender(targetService) };
}

afterEach(() => vi.unstubAllGlobals());

describe('ProjectNotificationTargetSender', () => {
  it('posts Slack messages to the channel selected by the rule', async () => {
    const { sender } = setup();

    await sender.send('project-1', 'slack', '#alerts', 'Deploy complete');

    expect(webClientConstructor).toHaveBeenCalledWith('secret-token');
    expect(postMessage).toHaveBeenCalledWith({ channel: '#alerts', text: 'Deploy complete' });
  });

  it('posts Google Chat messages directly to the configured webhook', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { sender } = setup();

    await sender.send('project-1', 'google-chat', '', 'Deploy complete');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://chat.googleapis.com/v1/spaces/AAAA/messages?key=key-value&token=token-value',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'Deploy complete' }),
      }),
    );
  });

  it('fails explicitly when no sender is registered for a target', async () => {
    const { targetService } = setup();
    const sender = new ProjectNotificationTargetSender(targetService, []);

    await expect(sender.send('project-1', 'slack', '#alerts', 'Deploy complete')).rejects.toThrow(
      'No sender registered for notification target: slack',
    );
  });
});
