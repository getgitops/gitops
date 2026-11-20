import { afterEach, describe, expect, it, vi } from 'vitest';
import { InProcessEventBus } from './event-bus';
import { InMemoryEventLog } from './event-log';
import { parseDuration, readEventsExpirationMs } from './config';
import type { AnyDomainEvent } from './types';

const HOUR = 3_600_000;
const START = Date.parse('2026-11-20T10:00:00.000Z');

function event(id: string, overrides: Partial<AnyDomainEvent> = {}): AnyDomainEvent {
  return {
    id,
    type: 'project.created',
    occurredAt: new Date(START).toISOString(),
    actor: { kind: 'user', userId: 'ana' },
    scope: { organizationId: 'org-1', projectId: 'project-1' },
    payload: { projectId: 'project-1', name: 'Shop', slug: 'shop' },
    ...overrides,
  } as AnyDomainEvent;
}

function createLog(options: { ttlMs?: number; maxEvents?: number } = {}) {
  let now = START;
  const log = new InMemoryEventLog({
    ttlMs: options.ttlMs ?? 24 * HOUR,
    maxEvents: options.maxEvents,
    now: () => now,
  });
  return { log, advance: (ms: number) => (now += ms), at: () => now };
}

describe('InMemoryEventLog', () => {
  it('lists an organization events newest first', () => {
    const { log } = createLog();
    log.record(event('a'));
    log.record(event('b'));
    log.record(event('other', { scope: { organizationId: 'org-2', projectId: null } }));

    expect(log.list({ organizationId: 'org-1' }).map((entry) => entry.event.id)).toEqual([
      'b',
      'a',
    ]);
  });

  it('filters by type, ack status and limit', () => {
    const { log } = createLog();
    log.record(event('a'));
    log.record(event('b', { type: 'project.deleted' } as Partial<AnyDomainEvent>));
    log.record(event('c'));
    log.ack('c', { userId: 'ana', username: 'ana' });

    expect(
      log.list({ organizationId: 'org-1', types: ['project.created'] }).map((e) => e.event.id),
    ).toEqual(['c', 'a']);
    expect(log.list({ organizationId: 'org-1', acked: true }).map((e) => e.event.id)).toEqual([
      'c',
    ]);
    expect(log.list({ organizationId: 'org-1', acked: false }).map((e) => e.event.id)).toEqual([
      'b',
      'a',
    ]);
    expect(log.list({ organizationId: 'org-1', limit: 1 })).toHaveLength(1);
  });

  it('records who acknowledged an event and when, keeping the first ack', () => {
    const { log, advance, at } = createLog();
    log.record(event('a'));
    advance(1000);
    const ackedAt = new Date(at()).toISOString();

    log.ack('a', { userId: 'ana', username: 'ana' });
    advance(1000);
    log.ack('a', { userId: 'bob', username: 'bob' });

    expect(log.get('a')?.ack).toEqual({ userId: 'ana', username: 'ana', at: ackedAt });
    expect(log.ack('missing', { userId: 'ana', username: 'ana' })).toBeNull();
  });

  it('drops events once they expire', () => {
    const { log, advance } = createLog({ ttlMs: 2 * HOUR });
    log.record(event('old'));
    advance(HOUR);
    log.record(event('new', { occurredAt: new Date(START + HOUR).toISOString() }));
    advance(HOUR + 1);

    expect(log.list({ organizationId: 'org-1' }).map((entry) => entry.event.id)).toEqual(['new']);
    expect(log.get('old')).toBeNull();
  });

  it('keeps at most maxEvents, dropping the oldest', () => {
    const { log } = createLog({ maxEvents: 2 });
    log.record(event('a'));
    log.record(event('b'));
    log.record(event('c'));

    expect(log.size).toBe(2);
    expect(log.get('a')).toBeNull();
  });

  it('records every event published on the bus it is attached to', async () => {
    const bus = new InProcessEventBus({ logger: { error: vi.fn() } });
    const log = new InMemoryEventLog({ ttlMs: HOUR });
    log.attach(bus);

    bus.publish(
      'project.created',
      { projectId: 'p', name: 'P', slug: 'p' },
      { scope: { organizationId: 'org-1', projectId: 'p' } },
    );
    await bus.drain();

    expect(log.list({ organizationId: 'org-1' }).map((entry) => entry.event.type)).toEqual([
      'project.created',
    ]);
  });
});

describe('events expiration config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ['30d', 30 * 24 * HOUR],
    ['12h', 12 * HOUR],
    ['45m', 45 * 60_000],
    ['90s', 90_000],
    ['3600', 3_600_000],
    [' 2D ', 2 * 24 * HOUR],
  ])('parses %s', (value, expected) => {
    expect(parseDuration(value)).toBe(expected);
  });

  it.each(['', '0d', '-1h', '1w', 'ten days', '1.5h'])('rejects %j', (value) => {
    expect(parseDuration(value)).toBeNull();
  });

  it('reads GITOPS_EVENTS_EXPIRATION, defaulting to 7 days', () => {
    expect(readEventsExpirationMs()).toBe(7 * 24 * HOUR);

    vi.stubEnv('GITOPS_EVENTS_EXPIRATION', '30d');
    expect(readEventsExpirationMs()).toBe(30 * 24 * HOUR);
  });

  it('falls back to the default and reports an invalid value', () => {
    vi.stubEnv('GITOPS_EVENTS_EXPIRATION', 'forever');
    const onInvalid = vi.fn();

    expect(readEventsExpirationMs(onInvalid)).toBe(7 * 24 * HOUR);
    expect(onInvalid).toHaveBeenCalledWith('forever');
  });
});
