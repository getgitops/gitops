import { beforeEach, describe, expect, it } from 'vitest';
import type { ChannelMessage } from '#lib/server/infra/notifications';
import { NotificationChannelValidationError } from '../domain/notification-channel.domain';
import { RecordingEventBus } from '#lib/server/events/testing';
import { createChannelCipher } from '../infrastructure/crypto/channel-cipher';
import { createChannelsFixture, FakeChatTransport } from './testing';

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

  /** Creates a channel and returns it (without the issued secret). */
  const create = (...args: Parameters<typeof f.service.create>) =>
    f.service.create(...args).then((issued) => issued.channel);

  describe('create and storage', () => {
    it('stores the destination encrypted and only ever shows it masked', async () => {
      const channel = await create(
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

    it('stores the message language: English by default, Spanish or English on demand', async () => {
      const plain = await create(orgLocation, { type: 'slack', name: 'a', destination: HOOK }, 'x');
      expect(plain.locale).toBe('en');
      const spanish = await create(
        orgLocation,
        { type: 'slack', name: 'b', destination: HOOK, locale: 'es' },
        'x',
      );
      expect(f.repository.rows.find((row) => row.id === spanish.id)?.locale).toBe('es');

      await f.service.update(spanish.id, { locale: 'en' });
      expect((await f.service.get(spanish.id)).locale).toBe('en');
      await f.service.update(spanish.id, { locale: '' });
      expect((await f.service.get(spanish.id)).locale).toBe('en');

      expect(
        await validationErrors(
          f.service.create(
            orgLocation,
            { type: 'slack', name: 'c', destination: HOOK, locale: 'fr' },
            'x',
          ),
        ),
      ).toEqual({ locale: 'invalid_locale' });
      expect(await validationErrors(f.service.update(plain.id, { locale: 'de' }))).toEqual({
        locale: 'invalid_locale',
      });
    });

    it('reads channels saved before the language existed as English', async () => {
      const channel = await create(
        orgLocation,
        { type: 'slack', name: 'a', destination: HOOK },
        'x',
      );
      delete (f.repository.rows[0] as { locale?: string }).locale;
      expect((await f.service.get(channel.id)).locale).toBe('en');
    });

    it('keeps the destination when an update leaves it empty, and re-encrypts a new one', async () => {
      const channel = await create(
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
      const org = await create(orgLocation, { type: 'slack', name: 'org', destination: HOOK }, 'a');
      const own = await create(p1, { type: 'slack', name: 'p1', destination: HOOK }, 'a');
      await create(
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
      channelId = (await create(orgLocation, { type: 'slack', name: 'a', destination: HOOK }, 'x'))
        .id;
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
      ).channel.id;
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

describe('NotificationChannelService: signed channels and failure streaks', () => {
  const webhook = (overrides: Partial<Parameters<typeof createChannelsFixture>[0]> = {}) => {
    const signed = new FakeChatTransport(true);
    const events = new RecordingEventBus();
    const lines: unknown[] = [];
    const record = (...args: unknown[]) => void lines.push(args);
    const fixture = createChannelsFixture({
      transports: { webhook: signed },
      events,
      logger: { warn: record, error: record, debug: record },
      ...overrides,
    });
    return { ...fixture, signed, events, lines };
  };

  it('issues a signing secret once, stores it encrypted and never shows it again', async () => {
    const f = webhook();
    const issued = await f.service.create(
      orgLocation,
      { type: 'webhook', name: 'SIEM', destination: HOOK },
      'admin',
    );
    expect(issued.signingSecret).toBe('whsec_test1');

    const [row] = f.repository.rows;
    expect(row.signingSecret).toBeTruthy();
    expect(row.signingSecret).not.toContain('whsec_test1');
    const view = f.service.toView(await f.service.get(issued.channel.id));
    expect(view.signed).toBe(true);
    expect(JSON.stringify(view)).not.toContain('whsec_');
    expect(view).not.toHaveProperty('signingSecret');
    expect(view).not.toHaveProperty('previousSigningSecret');

    // unsigned types get none
    const slack = await f.service.create(
      orgLocation,
      { type: 'slack', name: '#a', destination: HOOK },
      'admin',
    );
    expect(slack.signingSecret).toBeNull();
    await expect(f.service.rotateSecret(slack.channel.id)).rejects.toBeInstanceOf(
      NotificationChannelValidationError,
    );
  });

  it('signs each delivery with a delivery id and the active secret', async () => {
    const f = webhook();
    const { channel } = await f.service.create(
      orgLocation,
      { type: 'webhook', name: 'SIEM', destination: HOOK },
      'admin',
    );
    await f.service.deliver(channel.id, message);
    await f.service.deliver(channel.id, message);
    expect(f.signed.sent.map((sent) => sent.signingSecrets)).toEqual([
      ['whsec_test1'],
      ['whsec_test1'],
    ]);
    expect(f.signed.sent.map((sent) => sent.deliveryId)).toEqual(['delivery-1', 'delivery-2']);
  });

  it('keeps the previous secret signing for 24 h after a rotation', async () => {
    const f = webhook();
    const { channel } = await f.service.create(
      orgLocation,
      { type: 'webhook', name: 'SIEM', destination: HOOK },
      'admin',
    );
    const rotated = await f.service.rotateSecret(channel.id);
    expect(rotated.signingSecret).toBe('whsec_test2');
    expect(f.service.toView(rotated.channel).rotationEndsAt).toBe('2026-11-25T10:00:00.000Z');

    await f.service.deliver(channel.id, message);
    expect(f.signed.sent.at(-1)!.signingSecrets).toEqual(['whsec_test2', 'whsec_test1']);

    f.advance(24 * 60 * 60 * 1000);
    await f.service.deliver(channel.id, message);
    expect(f.signed.sent.at(-1)!.signingSecrets).toEqual(['whsec_test2']);
    expect(f.service.toView(await f.service.get(channel.id)).rotationEndsAt).toBeNull();

    // a second rotation drops the oldest secret
    await f.service.rotateSecret(channel.id);
    await f.service.rotateSecret(channel.id);
    await f.service.deliver(channel.id, message);
    expect(f.signed.sent.at(-1)!.signingSecrets).toEqual(['whsec_test4', 'whsec_test3']);
  });

  it('refuses to deliver a signed channel without a secret', async () => {
    const f = webhook();
    const { channel } = await f.service.create(
      orgLocation,
      { type: 'webhook', name: 'SIEM', destination: HOOK },
      'admin',
    );
    await f.repository.update(channel.id, { signingSecret: null });
    expect(await f.service.deliver(channel.id, message)).toBe(false);
    expect(f.signed.attempts).toHaveLength(0);
    expect((await f.service.get(channel.id)).lastError).toBe('missing_secret');
  });

  it('disables a channel after N definitive failures in a row and announces it once', async () => {
    const f = webhook({ maxConsecutiveFailures: 3 });
    const { channel } = await f.service.create(
      p1,
      { type: 'webhook', name: 'SIEM', destination: HOOK },
      'creator',
    );
    f.signed.failWith = [410, 410];
    await f.service.deliver(channel.id, message);
    await f.service.deliver(channel.id, message);
    expect(await f.service.get(channel.id)).toMatchObject({
      enabled: true,
      consecutiveFailures: 2,
    });

    // a success ends the streak
    await f.service.deliver(channel.id, message);
    expect((await f.service.get(channel.id)).consecutiveFailures).toBe(0);

    f.signed.failWith = [404, 404, 404];
    for (let i = 0; i < 3; i += 1) await f.service.deliver(channel.id, message);
    const disabled = await f.service.get(channel.id);
    expect(disabled).toMatchObject({
      enabled: false,
      disabledReason: 'failures',
      consecutiveFailures: 3,
      lastError: 'HTTP 404',
    });

    const announced = f.events.ofType('notifications.channel.disabled');
    expect(announced).toHaveLength(1);
    expect(announced[0]).toMatchObject({
      actor: { kind: 'system' },
      scope: { organizationId: ORG, projectId: 'p1' },
      payload: {
        channelId: channel.id,
        name: 'SIEM',
        type: 'webhook',
        reason: 'failures',
        failures: 3,
        lastError: 'HTTP 404',
        createdByUserId: 'creator',
      },
    });
    expect(JSON.stringify(announced)).not.toContain('hooks.example.com');

    // a disabled channel gets nothing else, and doesn't announce again
    expect(await f.service.deliver(channel.id, message)).toBe(false);
    expect(f.events.ofType('notifications.channel.disabled')).toHaveLength(1);

    // enabling it again starts a new streak
    await f.service.update(channel.id, { enabled: true });
    expect(await f.service.get(channel.id)).toMatchObject({
      enabled: true,
      disabledReason: null,
      consecutiveFailures: 0,
    });
  });

  it('counts a destination that became invalid, but never test messages', async () => {
    const f = webhook({ maxConsecutiveFailures: 2 });
    const { channel } = await f.service.create(
      orgLocation,
      { type: 'webhook', name: 'SIEM', destination: HOOK },
      'creator',
    );
    f.signed.failWith = [500, 500, 500, 500, 500, 500, 500, 500];
    await f.service.test(channel.id, { ...message, test: true });
    await f.service.test(channel.id, { ...message, test: true });
    expect(await f.service.get(channel.id)).toMatchObject({
      enabled: true,
      consecutiveFailures: 0,
    });

    await f.repository.update(channel.id, {
      webhookUrl: createChannelCipher(() => 'test-encryption-key').encrypt(
        channel.id,
        'https://169.254.169.254/hook/x',
      ),
    });
    await f.service.deliver(channel.id, message);
    await f.service.deliver(channel.id, message);
    expect(await f.service.get(channel.id)).toMatchObject({
      enabled: false,
      lastError: 'invalid_destination',
    });
  });

  it('never counts alert test sends toward disabling the channel', async () => {
    const f = webhook({ maxConsecutiveFailures: 1 });
    const { channel } = await f.service.create(
      orgLocation,
      { type: 'webhook', name: 'SIEM', destination: HOOK },
      'creator',
    );
    f.signed.failWith = [410, 410];
    // what AlertEngine.sendTest delivers: a real-looking message flagged as a test
    expect(
      await f.service.deliver(channel.id, { ...message, test: true }, { kind: 'alert_test' }),
    ).toBe(false);
    expect(await f.service.get(channel.id)).toMatchObject({
      enabled: true,
      consecutiveFailures: 0,
      lastError: 'HTTP 410',
    });
    expect(f.events.ofType('notifications.channel.disabled')).toHaveLength(0);
  });

  it('never logs the secret nor the destination', async () => {
    const f = webhook({ maxConsecutiveFailures: 1 });
    const { channel } = await f.service.create(
      orgLocation,
      { type: 'webhook', name: 'SIEM', destination: HOOK },
      'creator',
    );
    await f.service.rotateSecret(channel.id);
    f.signed.failWith = [503, 503, 503, 503];
    await f.service.deliver(channel.id, message);
    expect(f.lines.length).toBeGreaterThan(0);
    const logged = JSON.stringify(f.lines);
    expect(logged).toContain(channel.id);
    expect(logged).not.toContain('whsec_');
    expect(logged).not.toContain('hooks.example.com');
  });
});
