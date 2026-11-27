import { beforeEach, describe, expect, it, vi } from 'vitest';

class ValidationError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

const mocks = vi.hoisted(() => ({
  canUpdate: vi.fn(),
  enabled: vi.fn(),
  requestSync: vi.fn(),
  update: vi.fn(),
  get: vi.fn(),
}));

vi.mock('#modules/cve-feed', () => ({
  CveWatchlistValidationError: ValidationError,
  cveFeedQueryService: {},
  cveFeedRuntime: { requestSync: mocks.requestSync },
  cveWatchlistService: { get: mocks.get, update: mocks.update, suggestions: vi.fn() },
  getCveFeedConfig: () => ({ minSeverity: 'high' }),
  isCveFeedEnabled: mocks.enabled,
}));
vi.mock('#modules/organization', () => ({
  organizationService: { tryFindBySlug: async () => ({ id: 'org-1', slug: 'acme' }) },
}));
vi.mock('#lib/server/cve-feed-access', () => ({
  canReadCveFeed: vi.fn(),
  canReadOrganizationProjects: vi.fn(),
  canUpdateCveFeed: mocks.canUpdate,
}));
vi.mock('#lib/server/code-report/cves', () => ({
  buildCveList: vi.fn(),
  loadCveOccurrences: vi.fn(),
  organizationCveProjects: vi.fn(),
}));

const { actions } = await import('./+page.server');

const user = { id: 'user-1' };
function event(fields: Record<string, string> = {}, signedIn = true) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  return {
    params: { org: 'acme' },
    locals: { user: signedIn ? user : null },
    request: { formData: async () => body },
  } as never;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.canUpdate.mockResolvedValue(true);
  mocks.enabled.mockReturnValue(true);
  mocks.get.mockResolvedValue({ technologies: [] });
});

describe('watchlist action', () => {
  it('rejects users without organization:cves:feed:update', async () => {
    mocks.canUpdate.mockResolvedValue(false);
    const result = await actions.watchlist(event({ technology: 'redis' }));
    expect(result).toMatchObject({ status: 403, data: { error: 'forbidden' } });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects anonymous requests', async () => {
    const result = await actions.watchlist(event({}, false));
    expect(result).toMatchObject({ status: 403 });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('saves the parsed watchlist with the user and lifts the severity to the floor', async () => {
    const result = await actions.watchlist(
      event({ technology: 'redis', minSeverity: 'low', includeKev: 'on' }),
    );
    expect(result).toEqual({ action: 'watchlist', success: true });
    expect(mocks.update).toHaveBeenCalledWith(
      'org-1',
      { technologies: [{ technologyId: 'redis' }], minSeverity: 'high', includeKev: true },
      'user-1',
    );
  });

  it('turns validation errors into a 400 with the error code', async () => {
    mocks.update.mockRejectedValue(new ValidationError('Unknown technology', 'unknown_technology'));
    const result = await actions.watchlist(event({ technology: 'nope' }));
    expect(result).toMatchObject({ status: 400, data: { error: 'unknown_technology' } });
  });

  it('lets unexpected errors through', async () => {
    mocks.update.mockRejectedValue(new Error('disk full'));
    await expect(actions.watchlist(event({ technology: 'redis' }))).rejects.toThrow('disk full');
  });
});

describe('sync action', () => {
  it('rejects users without organization:cves:feed:update', async () => {
    mocks.canUpdate.mockResolvedValue(false);
    expect(await actions.sync(event())).toMatchObject({ status: 403 });
    expect(mocks.requestSync).not.toHaveBeenCalled();
  });

  it('is rejected on the server when the feed is disabled', async () => {
    mocks.enabled.mockReturnValue(false);
    expect(await actions.sync(event())).toMatchObject({ status: 409, data: { error: 'disabled' } });
    expect(mocks.requestSync).not.toHaveBeenCalled();
  });

  it('queues a sync when allowed and enabled', async () => {
    mocks.requestSync.mockResolvedValue(true);
    expect(await actions.sync(event())).toEqual({ action: 'sync', success: true });
    expect(mocks.requestSync).toHaveBeenCalledOnce();
  });
});
