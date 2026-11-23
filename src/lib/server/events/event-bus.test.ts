import { describe, expect, it, vi } from 'vitest';
import { runWithActor } from '#lib/server/request-context';
import { InProcessEventBus, actorFromRequest } from './event-bus';
import { RecordingEventBus } from './testing';

type TestEvents = {
  'test.item.created': { itemId: string };
  'test.item.deleted': { itemId: string; reason: string };
};

function createBus() {
  const logger = { error: vi.fn() };
  const bus = new InProcessEventBus<TestEvents>({ logger });
  return { bus, logger };
}

describe('InProcessEventBus', () => {
  it('builds the envelope and returns it from publish', () => {
    const bus = new InProcessEventBus<TestEvents>({
      logger: { error: vi.fn() },
      now: () => new Date('2026-11-20T10:00:00.000Z'),
      generateId: () => 'event-1',
    });

    const event = bus.publish(
      'test.item.created',
      { itemId: 'a' },
      { scope: { organizationId: 'org-1', projectId: 'project-1' } },
    );

    expect(event).toEqual({
      id: 'event-1',
      type: 'test.item.created',
      occurredAt: '2026-11-20T10:00:00.000Z',
      actor: { kind: 'system' },
      scope: { organizationId: 'org-1', projectId: 'project-1' },
      payload: { itemId: 'a' },
    });
  });

  it('delivers each event only to the subscribers of its type', async () => {
    const { bus } = createBus();
    const created = vi.fn();
    const deleted = vi.fn();
    bus.subscribe('test.item.created', created);
    bus.subscribe('test.item.deleted', deleted);

    bus.publish('test.item.created', { itemId: 'a' });
    await bus.drain();

    expect(created).toHaveBeenCalledTimes(1);
    expect(created.mock.calls[0][0].payload).toEqual({ itemId: 'a' });
    expect(deleted).not.toHaveBeenCalled();
  });

  it("delivers every event to '*' subscribers", async () => {
    const { bus } = createBus();
    const all = vi.fn();
    bus.subscribe('*', all);

    bus.publish('test.item.created', { itemId: 'a' });
    bus.publish('test.item.deleted', { itemId: 'a', reason: 'gone' });
    await bus.drain();

    expect(all.mock.calls.map(([event]) => event.type)).toEqual([
      'test.item.created',
      'test.item.deleted',
    ]);
  });

  it('stops delivering after unsubscribe', async () => {
    const { bus } = createBus();
    const handler = vi.fn();
    const unsubscribe = bus.subscribe('test.item.created', handler);

    bus.publish('test.item.created', { itemId: 'a' });
    await bus.drain();
    unsubscribe();
    bus.publish('test.item.created', { itemId: 'b' });
    await bus.drain();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not deliver events already queued when the subscriber unsubscribes', async () => {
    const { bus } = createBus();
    const handler = vi.fn();
    const unsubscribe = bus.subscribe('test.item.created', handler);

    bus.publish('test.item.created', { itemId: 'a' });
    unsubscribe();
    await bus.drain();

    expect(handler).not.toHaveBeenCalled();
  });

  it('isolates a failing handler and logs it with the event type and id', async () => {
    const { bus, logger } = createBus();
    const healthy = vi.fn();
    bus.subscribe('test.item.created', () => {
      throw new Error('sync boom');
    });
    bus.subscribe('test.item.created', async () => {
      throw new Error('async boom');
    });
    bus.subscribe('test.item.created', healthy);

    const event = bus.publish('test.item.created', { itemId: 'a' });
    await bus.drain();

    expect(healthy).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'test.item.created', eventId: event.id }),
      expect.any(String),
    );
  });

  it('keeps delivering later events to a subscriber whose handler failed', async () => {
    const { bus } = createBus();
    const seen: string[] = [];
    bus.subscribe('test.item.created', (event) => {
      if (event.payload.itemId === 'a') throw new Error('boom');
      seen.push(event.payload.itemId);
    });

    bus.publish('test.item.created', { itemId: 'a' });
    bus.publish('test.item.created', { itemId: 'b' });
    await bus.drain();

    expect(seen).toEqual(['b']);
  });

  it('does not wait for handlers in publish', async () => {
    const { bus } = createBus();
    let release!: () => void;
    const handler = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    bus.subscribe('test.item.created', handler);

    bus.publish('test.item.created', { itemId: 'a' });

    // handlers are scheduled, not called inline
    expect(handler).not.toHaveBeenCalled();

    await Promise.resolve();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);
    release();
    await bus.drain();
  });

  it('preserves publish order per subscriber even with async handlers', async () => {
    const { bus } = createBus();
    const seen: string[] = [];
    bus.subscribe('test.item.created', async (event) => {
      // the first event takes longer: it must still be handled first
      await new Promise((resolve) => setTimeout(resolve, event.payload.itemId === 'a' ? 20 : 0));
      seen.push(event.payload.itemId);
    });

    bus.publish('test.item.created', { itemId: 'a' });
    bus.publish('test.item.created', { itemId: 'b' });
    bus.publish('test.item.created', { itemId: 'c' });
    await bus.drain();

    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('does not let a slow subscriber delay the others', async () => {
    const { bus } = createBus();
    let release!: () => void;
    bus.subscribe('test.item.created', () => new Promise<void>((resolve) => (release = resolve)));
    const fast = vi.fn();
    bus.subscribe('test.item.created', fast);

    bus.publish('test.item.created', { itemId: 'a' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fast).toHaveBeenCalledTimes(1);
    release();
    await bus.drain();
  });

  it('drain waits for pending handlers, including events they publish', async () => {
    const { bus } = createBus();
    const finished: string[] = [];
    bus.subscribe('test.item.created', async (event) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      finished.push('created');
      bus.publish('test.item.deleted', { itemId: event.payload.itemId, reason: 'cascade' });
    });
    bus.subscribe('test.item.deleted', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      finished.push('deleted');
    });

    bus.publish('test.item.created', { itemId: 'a' });
    await bus.drain();

    expect(finished).toEqual(['created', 'deleted']);
  });

  it('drain resolves immediately with nothing pending', async () => {
    const { bus } = createBus();
    await expect(bus.drain()).resolves.toBeUndefined();
  });

  describe('actor', () => {
    it('resolves a user actor from the request context', () => {
      const { bus } = createBus();

      const event = runWithActor({ name: 'ana', email: 'ana@example.com', userId: 'user-1' }, () =>
        bus.publish('test.item.created', { itemId: 'a' }),
      );

      expect(event.actor).toEqual({ kind: 'user', userId: 'user-1' });
    });

    it('resolves an API key actor from the request context', () => {
      const { bus } = createBus();

      const event = runWithActor(
        {
          name: 'apikey:ci',
          email: 'apikey+key-1@gitops.local',
          apiKeyId: 'key-1',
          apiKeyProjectId: 'project-1',
        },
        () => bus.publish('test.item.created', { itemId: 'a' }),
      );

      expect(event.actor).toEqual({ kind: 'api_key', apiKeyId: 'key-1', projectId: 'project-1' });
    });

    it('falls back to the system actor outside a request', () => {
      const { bus } = createBus();

      expect(bus.publish('test.item.created', { itemId: 'a' }).actor).toEqual({ kind: 'system' });
    });

    it('lets the publisher override the actor', () => {
      const { bus } = createBus();

      const event = runWithActor({ name: 'ana', email: 'ana@example.com', userId: 'user-1' }, () =>
        bus.publish('test.item.created', { itemId: 'a' }, { actor: { kind: 'system' } }),
      );

      expect(event.actor).toEqual({ kind: 'system' });
    });

    it('maps request actors without ids to the system actor', () => {
      expect(actorFromRequest({ name: 'legacy', email: 'legacy@example.com' })).toEqual({
        kind: 'system',
      });
      expect(actorFromRequest(null)).toEqual({ kind: 'system' });
    });
  });
});

describe('RecordingEventBus', () => {
  it('records published events in order and still notifies subscribers', async () => {
    const bus = new RecordingEventBus<TestEvents>();
    const handler = vi.fn();
    bus.subscribe('test.item.deleted', handler);

    bus.publish('test.item.created', { itemId: 'a' });
    bus.publish('test.item.deleted', { itemId: 'a', reason: 'gone' });
    await bus.drain();

    expect(bus.types()).toEqual(['test.item.created', 'test.item.deleted']);
    expect(bus.ofType('test.item.deleted').map((event) => event.payload)).toEqual([
      { itemId: 'a', reason: 'gone' },
    ]);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('clears recorded events', () => {
    const bus = new RecordingEventBus<TestEvents>();
    bus.publish('test.item.created', { itemId: 'a' });

    bus.clear();

    expect(bus.events).toEqual([]);
  });
});
