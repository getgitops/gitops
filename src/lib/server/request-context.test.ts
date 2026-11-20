import { describe, expect, it, vi } from 'vitest';

describe('request context', () => {
  it('shares one store across re-evaluations of the module (Vite HMR)', async () => {
    const first = await import('./request-context');
    vi.resetModules();
    const second = await import('./request-context');

    expect(second).not.toBe(first);
    const seen = first.runWithActor({ name: 'ana', email: 'ana@example.com', userId: 'u1' }, () =>
      second.getCurrentActor(),
    );
    expect(seen?.userId).toBe('u1');
  });

  it('has no actor outside a request', async () => {
    const { getCurrentActor } = await import('./request-context');
    expect(getCurrentActor()).toBeNull();
  });
});
