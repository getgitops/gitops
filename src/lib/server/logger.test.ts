import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import pino from 'pino';

vi.mock('pino', () => ({
  default: Object.assign(
    vi.fn(() => ({ child: vi.fn() })),
    {
      stdTimeFunctions: { isoTime: vi.fn() },
    },
  ),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('LOG_MODE', undefined);
  vi.stubEnv('LOG_FORMAT', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('logger transport', () => {
  it.each(['standard', 'gcp'])('resolves the pretty transport in %s mode', async (mode) => {
    vi.stubEnv('LOG_MODE', mode);
    vi.stubEnv('LOG_FORMAT', 'pretty');

    await import('./logger');

    expect(pino).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: expect.objectContaining({
          target: createRequire(import.meta.url).resolve('pino-pretty'),
        }),
      }),
    );
  });

  it('defaults to pretty output in development', async () => {
    await import('./logger');

    expect(pino).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: expect.objectContaining({ target: expect.any(String) }),
      }),
    );
  });

  it.each(['standard', 'gcp'])('does not create a transport for %s JSON output', async (mode) => {
    vi.stubEnv('LOG_MODE', mode);
    vi.stubEnv('LOG_FORMAT', 'json');

    await import('./logger');

    expect(pino).toHaveBeenCalledWith(expect.objectContaining({ transport: undefined }));
  });

  it('defaults to GCP JSON output in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    await import('./logger');

    expect(pino).toHaveBeenCalledWith(
      expect.objectContaining({ messageKey: 'message', transport: undefined }),
    );
  });
});
