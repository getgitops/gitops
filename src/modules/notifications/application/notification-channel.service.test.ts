import { beforeEach, describe, expect, it } from 'vitest';
import type { ChannelMessage } from '#lib/server/infra/notifications';
import { NotificationChannelValidationError } from '../domain/notification-channel.domain';
import { createChannelsFixture } from './testing';

const ORG = 'org-1';
const orgLocation = { scope: 'organization' as const, organizationId: ORG, projectId: null };
const p1 = { scope: 'project' as const, organizationId: ORG, projectId: 'p1' };
const HOOK = 'https://hooks.example.com/hook/T000/B000/secret1a2b';

const message: ChannelMessage = {
  title: 'Críticas',
  summary: '1 critical',
  eventLabel: 'Analysis completed',
  fields: [],
  link: null,
  suppressed: 0,
  text: '[GitOps] Críticas: 1 critical',
  test: false,
};

async function validationErrors(promise: Promise<unknown>) {
  const error = await promise.catch((caught) => caught);
  expect(error).toBeInstanceOf(NotificationChannelValidationError);
  return (error as NotificationChannelValidationError).errors;
}

describe('NotificationChannelService', () => {
  let f: ReturnType<typeof createChannelsFixture>;

  beforeEach(() => {
    f = createChannelsFixture();
  });

  describe('create and storage', () => {
    it('stores the destination encrypted and only ever shows it masked', async () => {
      const channel = await f.service.create(
        orgLocation,
        { type: 'slack', name: ' #alertas ', destination: HOOK },
        'admin',
      );

      const [row] = f.repository.rows;
      expect(row).toMatchObject({ id: 'channel-1', name: '#alertas', scope: 'organization' });
      expect(row.webhookUrl).not.toContain('hooks.example.com');
      expect(row.webhookUrl).not.toContain('secret');

      const view = f.service.toView(channel);
      expect(view.destinationMasked).toBe('https://hooks.example.com/…/••••1a2b');
      expect(view).not.toHaveProperty('webhookUrl');
      expect(JSON.stringify(view)).not.toContain('secret');
      expect(view.available).toBe(true);
    });

    it('validates type, name and destination (anti-SSRF) before saving', async () => {
      const errors = await validationErrors(
        f.service.create(
          orgLocation,
          { type: 'slack', name: '', destination: 'http://hooks.example.com/hook/x' },
          'a',
        ),
      );
      expect(errors).toEqual({ name: 'required', destination: 'not_https' });

      for (const [destination, code] of [
        ['https://evil.com/hook/x', 'host_not_allowed'],
        ['https://10.0.0.1/hook/x', 'ip_address'],
        ['https://u:p@hooks.example.com/hook/x', 'credentials'],
        ['https://hooks.example.com/other', 'path_not_allowed'],
      ]) {
        expect(
          await validationErrors(
            f.service.create(orgLocation, { type: 'slack', name: 'x', destination }, 'a'),
          ),
        ).toEqual({ destination: code });
      }
      expect(f.repository.rows).toHaveLength(0);
    });

    it('only accepts types with a registered transport', async () => {
      expect(
        await validationErrors(
          f.service.create(orgLocation, { type: 'google-chat', name: 'x', destination: HOOK }, 'a'),
        ),
      ).toEqual({ type: 'type_unavailable' });
      expect(
        await validationErrors(
          f.service.create(orgLocation, { type: 'sms', name: 'x', destination: HOOK }, 'a'),
        ),
      ).toEqual({ type: 'invalid_type' });
      expect(f.service.availableTypes()).toEqual(['slack']);
    });

    it('keeps the destination when an update leaves it empty, and re-encrypts a new one', async () => {
      const channel = await f.service.create(
        orgLocation,
        { type: 'slack', name: 'a', destination: HOOK },
        'x',
      );
      const before = f.repository.rows[0].webhookUrl;

      await f.service.update(channel.id, { name: 'b', destination: '' });
      expect(f.repository.rows[0]).toMatchObject({ name: 'b', webhookUrl: before });

      await f.service.update(channel.id, { destination: 'https://hooks.example.com/hook/new9z9z' });
      expect(f.repository.rows[0].webhookUrl).not.toBe(before);
      expect(f.service.toView(await f.service.get(channel.id)).destinationMasked).toMatch(/9z9z$/);
    });
  });

  describe('scopes', () => {
    it('lets a project channel serve only its project, and an organization channel all of them', async () => {
      const org = await f.service.create(
        orgLocation,
        { type: 'slack', name: 'org', destination: HOOK },
        'a',
      );
      const own = await f.service.create(p1, { type: 'slack', name: 'p1', destination: HOOK }, 'a');
      await f.service.create(
        { ...p1, projectId: 'p2' },
        { type: 'slack', name: 'p2', destination: HOOK },
        'a',
      );

      const usable = await f.service.listUsable({ organizationId: ORG, projectId: 'p1' });
      expect(usable.map((channel) => channel.id).sort()).toEqual([org.id, own.id].sort());
      expect(
        (await f.service.listUsable({ organizationId: ORG, projectId: null })).map((c) => c.id),
      ).toEqual([org.id]);
      expect(await f.service.listUsable({ organizationId: 'other', projectId: null })).toEqual([]);
      expect((await f.service.list(p1)).map((channel) => channel.name)).toEqual(['p1']);
    });
  });

  describe('delivery', () => {
    let channelId: string;

    beforeEach(async () => {
      channelId = (
        await f.service.create(orgLocation, { type: 'slack', name: 'a', destination: HOOK }, 'x')
      ).id;
    });

    it('sends to the decrypted destination', async () => {
      expect(await f.service.deliver(channelId, message)).toBe(true);
      expect(f.transport.sent).toHaveLength(1);
      expect(f.transport.sent[0]).toMatchObject({ channel: 'slack', destination: HOOK, message });
    });

    it('skips disabled and deleted channels', async () => {
      await f.service.update(channelId, { enabled: false });
      expect(await f.service.deliver(channelId, message)).toBe(false);
      expect(await f.service.deliver('missing', message)).toBe(false);
      expect(f.transport.sent).toHaveLength(0);
    });

    it('records a permanent 4xx in lastError without retrying, and clears it on success', async () => {
      f.transport.failWith = [404];
      expect(await f.service.deliver(channelId, message)).toBe(false);
      expect(f.repository.rows[0].lastError).toBe('HTTP 404');
      expect(f.transport.sent).toHaveLength(0);
      expect(f.transport.failWith).toEqual([]);

      expect(await f.service.deliver(channelId, message)).toBe(true);
      expect(f.repository.rows[0]).toMatchObject({ lastError: null });
      expect(f.repository.rows[0].lastDeliveryAt).toBe(f.clock.now.toISOString());
    });

    it('retries 429, 5xx and network errors before giving up', async () => {
      f.transport.failWith = [429, 503, 'network'];
      expect(await f.service.deliver(channelId, message)).toBe(true);
      expect(f.transport.sent).toHaveLength(1);

      f.transport.failWith = [500, 500, 500, 500];
      expect(await f.service.deliver(channelId, message)).toBe(false);
      expect(f.repository.rows[0].lastError).toBe('HTTP 500');
    });

    it('checks the stored destination again before sending', async () => {
      // someone edits GitDB by hand and points the channel elsewhere
      const { createChannelCipher } = await import('../infrastructure/crypto/channel-cipher');
      f.repository.rows[0].webhookUrl = createChannelCipher(() => 'test-encryption-key').encrypt(
        channelId,
        'https://169.254.169.254/hook/latest',
      );
      expect(await f.service.deliver(channelId, message)).toBe(false);
      expect(f.transport.sent).toHaveLength(0);
      expect(f.repository.rows[0].lastError).toBe('invalid_destination');
    });

    it('does not commit a delivery stamp on every success', async () => {
      await f.service.deliver(channelId, message);
      const writes = () =>
        f.repository.writes.filter((write) => typeof write.changes.lastDeliveryAt === 'string');
      expect(writes()).toHaveLength(1);
      await f.service.deliver(channelId, message);
      await f.service.deliver(channelId, message);
      expect(writes()).toHaveLength(1);
      f.advance(60 * 60 * 1000);
      await f.service.deliver(channelId, message);
      expect(writes()).toHaveLength(2);
    });

    it('never logs the destination nor the message', async () => {
      const lines: unknown[] = [];
      const record = (...args: unknown[]) => void lines.push(args);
      const g = createChannelsFixture({ logger: { warn: record, error: record, debug: record } });
      const id = (
        await g.service.create(orgLocation, { type: 'slack', name: 'a', destination: HOOK }, 'x')
      ).id;
      g.transport.failWith = [503, 503, 503, 503];
      await g.service.deliver(id, message, { alertId: 'alert-1' });

      expect(lines.length).toBeGreaterThan(0);
      const logged = JSON.stringify(lines);
      expect(logged).toContain(id);
      expect(logged).not.toContain('hooks.example.com');
      expect(logged).not.toContain('secret');
      expect(logged).not.toContain('Críticas');
    });

    it('sends test messages even to a disabled channel and reports failures', async () => {
      await f.service.update(channelId, { enabled: false });
      expect(await f.service.test(channelId, { ...message, test: true })).toEqual({
        sent: true,
        error: null,
      });
      f.transport.failWith = [403];
      expect(await f.service.test(channelId, message)).toEqual({ sent: false, error: 'HTTP 403' });
    });

    it('marks channels whose type lost its transport as unavailable', async () => {
      const g = createChannelsFixture({ types: [] });
      g.repository.rows = structuredClone(f.repository.rows);
      expect(await g.service.deliver(channelId, message)).toBe(false);
      expect(g.repository.rows[0].lastError).toBe('unavailable');
      expect(g.service.toView(await g.service.get(channelId)).available).toBe(false);
    });
  });
});
