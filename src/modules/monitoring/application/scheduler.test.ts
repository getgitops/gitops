import { describe, expect, it } from 'vitest';
import { MonitorScheduler } from './scheduler';

const NOW = Date.parse('2026-11-20T10:00:00.000Z');

function scheduler() {
  let n = 0;
  return new MonitorScheduler(() => `lease-${++n}`);
}

describe('MonitorScheduler', () => {
  it('spreads monitors over their interval instead of firing them together', () => {
    const s = scheduler();
    for (let i = 0; i < 200; i++)
      s.upsert({ id: `monitor-${i}`, intervalSeconds: 60, timeoutMs: 5_000 }, NOW);
    const perSecond = new Map<number, number>();
    for (let t = 0; t <= 60; t++) {
      const leases = s.lease(1_000, NOW + t * 1_000);
      for (const lease of leases) s.complete(lease.monitorId, lease.leaseId);
      perSecond.set(t, leases.length);
    }
    const total = [...perSecond.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(200);
    expect(Math.max(...perSecond.values())).toBeLessThan(30);
  });

  it('hands a due check to one worker only, and runs it again the next interval', () => {
    const s = scheduler();
    s.upsert({ id: 'm', intervalSeconds: 60, timeoutMs: 5_000 }, NOW, { immediate: true });
    const first = s.lease(10, NOW);
    expect(first).toHaveLength(1);
    expect(s.lease(10, NOW + 1_000)).toHaveLength(0);
    expect(s.complete('m', first[0].leaseId)).toBe(true);
    expect(s.complete('m', first[0].leaseId)).toBe(false);
    expect(s.lease(10, NOW + 59_000)).toHaveLength(0);
    expect(s.lease(10, NOW + 60_000)).toHaveLength(1);
  });

  it('re-leases an expired lease to another worker and rejects the late result', () => {
    const s = scheduler();
    s.upsert({ id: 'm', intervalSeconds: 60, timeoutMs: 5_000 }, NOW, { immediate: true });
    const [lost] = s.lease(1, NOW);
    // timeout 5 s + grace 15 s
    expect(s.lease(1, NOW + 19_000)).toHaveLength(0);
    const [retry] = s.lease(1, NOW + 21_000);
    expect(retry.monitorId).toBe('m');
    expect(retry.scheduledAt).toBe(lost.scheduledAt);
    expect(s.complete('m', lost.leaseId)).toBe(false);
    expect(s.complete('m', retry.leaseId)).toBe(true);
  });

  it('gives up on a slot after the maximum attempts', () => {
    const s = scheduler();
    s.upsert({ id: 'm', intervalSeconds: 600, timeoutMs: 5_000 }, NOW, { immediate: true });
    s.lease(1, NOW);
    s.lease(1, NOW + 21_000);
    expect(s.lease(1, NOW + 42_000)).toHaveLength(0);
    expect(s.stats(NOW + 42_000)).toMatchObject({ monitors: 1, leased: 0 });
  });

  it('respects capacity and drops removed monitors on sync', () => {
    const s = scheduler();
    for (const id of ['a', 'b', 'c'])
      s.upsert({ id, intervalSeconds: 60, timeoutMs: 1_000 }, NOW, { immediate: true });
    expect(s.lease(2, NOW)).toHaveLength(2);
    s.sync([{ id: 'a', intervalSeconds: 60, timeoutMs: 1_000 }], NOW);
    expect(s.stats(NOW).monitors).toBe(1);
  });

  it('skips missed slots after a long pause instead of bursting', () => {
    const s = scheduler();
    s.upsert({ id: 'm', intervalSeconds: 60, timeoutMs: 1_000 }, NOW, { immediate: true });
    const [lease] = s.lease(1, NOW + 10 * 60_000);
    s.complete('m', lease.leaseId);
    expect(s.lease(1, NOW + 10 * 60_000 + 1_000)).toHaveLength(0);
  });
});
