import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBusService, type EventSubscriber } from './event-bus.service';
import { InMemoryEventStore } from '../infrastructure/store/in-memory-event-store';
import { DomainEvent } from '../domain/domain-event';

class TestEvent extends DomainEvent<{ value: string }> {
  static readonly eventName = 'test.event';
  get name() {
    return TestEvent.eventName;
  }
}

class OtherEvent extends DomainEvent<{ value: string }> {
  static readonly eventName = 'test.other';
  get name() {
    return OtherEvent.eventName;
  }
}

describe('EventBusService', () => {
  let store: InMemoryEventStore;
  let bus: EventBusService;

  beforeEach(() => {
    store = new InMemoryEventStore(5 * 60 * 1000, 60 * 1000);
    bus = new EventBusService(store);
  });

  it('delivers emitted events to handlers registered with on()', async () => {
    const handler = vi.fn();
    bus.on(TestEvent, handler);

    const event = new TestEvent({ value: 'hello' });
    const record = await bus.emit(event);

    expect(handler).toHaveBeenCalledWith(event);
    expect(record.status).toBe('processed');
    expect(bus.getMetrics().totalProcessed).toBe(1);
  });

  it('stops delivering after the unsubscribe function runs', async () => {
    const handler = vi.fn();
    const unsubscribe = bus.on(TestEvent, handler);
    unsubscribe();

    const record = await bus.emit(new TestEvent({ value: 'hello' }));

    expect(handler).not.toHaveBeenCalled();
    expect(record.status).toBe('unsubscribed');
    expect(bus.getMetrics().totalWithoutSubscribers).toBe(1);
  });

  it('attaches and detaches subscribers', async () => {
    const handle = vi.fn();
    const subscriber: EventSubscriber = {
      name: 'test-subscriber',
      subscribedTo: () => [TestEvent, OtherEvent],
      handle,
    };

    bus.attach(subscriber);
    await bus.emit(new TestEvent({ value: 'a' }));
    await bus.emit(new OtherEvent({ value: 'b' }));
    expect(handle).toHaveBeenCalledTimes(2);

    bus.detach(subscriber);
    await bus.emit(new TestEvent({ value: 'c' }));
    expect(handle).toHaveBeenCalledTimes(2);
    expect(bus.getSubscriptions()).toEqual([]);
  });

  it('replaces subscriber instances with the same name', async () => {
    const handlers = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];

    for (const handle of handlers) {
      bus.attach({
        name: 'project-notifications',
        subscribedTo: () => [TestEvent],
        handle,
      });
    }

    await bus.emit(new TestEvent({ value: 'once' }));

    expect(handlers.slice(0, -1).every((handler) => handler.mock.calls.length === 0)).toBe(true);
    expect(handlers.at(-1)).toHaveBeenCalledOnce();
    expect(bus.getSubscriptions()).toEqual([
      { event: TestEvent.eventName, handlers: ['project-notifications'] },
    ]);
  });

  it('marks the event as failed when a handler throws', async () => {
    bus.on(TestEvent, () => {
      throw new Error('boom');
    });

    const record = await bus.emit(new TestEvent({ value: 'x' }));

    expect(record.status).toBe('failed');
    expect(record.error).toBe('boom');
    expect(bus.getMetrics().totalFailed).toBe(1);
  });

  it('counts events per event name', async () => {
    bus.on(TestEvent, vi.fn());
    await bus.emit(new TestEvent({ value: '1' }));
    await bus.emit(new OtherEvent({ value: '2' }));

    const metrics = bus.getMetrics();
    expect(metrics.totalEmitted).toBe(2);
    expect(metrics.byEvent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: TestEvent.eventName, emitted: 1, processed: 1 }),
        expect.objectContaining({ name: OtherEvent.eventName, emitted: 1, withoutSubscribers: 1 }),
      ]),
    );
  });
});

describe('InMemoryEventStore lifetime', () => {
  it('drops unread events once the 5 minute lifetime expires', async () => {
    const store = new InMemoryEventStore(5 * 60 * 1000, 60 * 1000);
    const bus = new EventBusService(store);

    await bus.emit(new TestEvent({ value: 'orphan' }));
    expect(store.list()).toHaveLength(1);

    store.sweep(Date.now() + 5 * 60 * 1000 + 1);

    expect(store.list()).toHaveLength(0);
    expect(store.getMetrics().totalExpired).toBe(1);
  });

  it('keeps events that have not reached their lifetime', async () => {
    const store = new InMemoryEventStore(5 * 60 * 1000, 60 * 1000);
    const bus = new EventBusService(store);

    await bus.emit(new TestEvent({ value: 'fresh' }));
    store.sweep(Date.now() + 60 * 1000);

    expect(store.list()).toHaveLength(1);
    expect(store.getMetrics().totalExpired).toBe(0);
  });
});
