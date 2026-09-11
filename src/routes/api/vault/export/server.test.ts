import { beforeEach, describe, expect, it, vi } from 'vitest';

const tryFindBySlug = vi.fn();
const canApiKey = vi.fn();
const canSessionUser = vi.fn();
const exportEnvFile = vi.fn();
const exportJsonFile = vi.fn();

vi.mock('$modules/projects', () => ({
  projectService: {
    tryFindBySlug: (slug: string) => tryFindBySlug(slug),
  },
}));

vi.mock('$modules/auth', () => ({
  cancanService: {
    canApiKey: (...args: unknown[]) => canApiKey(...args),
    canSessionUser: (...args: unknown[]) => canSessionUser(...args),
  },
}));

vi.mock('$modules/vault', () => ({
  vaultService: {
    exportEnvFile: (...args: unknown[]) => exportEnvFile(...args),
    exportJsonFile: (...args: unknown[]) => exportJsonFile(...args),
  },
}));

const { GET } = await import('./+server');

const project = {
  id: 'project-1',
  slug: 'kettu',
  organization: { id: 'org-1', slug: 'kettu-org' },
};

const apiKey = {
  id: 'key-1',
  name: 'ci',
  keyPrefix: 'gvs_',
  projectId: 'project-1',
  organizationId: 'org-1',
  userId: null,
  role: null,
};

function request(query: string, locals: Record<string, unknown> = { apiKey }) {
  return GET({
    url: new URL(`http://localhost/api/vault/export${query}`),
    locals: { logger: { warn: vi.fn() }, ...locals },
  } as never);
}

describe('GET /api/vault/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tryFindBySlug.mockResolvedValue(project);
    canApiKey.mockReturnValue(true);
    canSessionUser.mockResolvedValue(true);
    exportEnvFile.mockResolvedValue('API_KEY=abc\nDB_HOST=localhost');
    exportJsonFile.mockResolvedValue('{\n  "API_KEY": "abc"\n}');
  });

  it('requires the project slug', async () => {
    const response = await request('?env=prod');
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'project is required' });
  });

  it('requires the environment', async () => {
    const response = await request('?project=kettu');
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'env is required' });
  });

  it('rejects unsupported formats', async () => {
    const response = await request('?project=kettu&env=prod&format=yaml');
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "format must be 'env' or 'json'" });
  });

  it('returns 404 when the project does not exist', async () => {
    tryFindBySlug.mockResolvedValue(null);
    const response = await request('?project=missing&env=prod');
    expect(response.status).toBe(404);
  });

  it('rejects a token whose organization does not own the project', async () => {
    const response = await request('?project=kettu&env=prod', {
      apiKey: { ...apiKey, organizationId: 'org-2' },
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Project does not belong to the token organization',
    });
    expect(exportEnvFile).not.toHaveBeenCalled();
  });

  it('rejects a token without organization', async () => {
    const response = await request('?project=kettu&env=prod', {
      apiKey: { ...apiKey, organizationId: null },
    });
    expect(response.status).toBe(403);
    expect(exportEnvFile).not.toHaveBeenCalled();
  });

  it('rejects a token without the read permission', async () => {
    canApiKey.mockReturnValue(false);
    const response = await request('?project=kettu&env=prod');
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('exports the env format by default', async () => {
    const response = await request('?project=kettu&env=prod');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="kettu-prod.env"',
    );
    await expect(response.text()).resolves.toBe('API_KEY=abc\nDB_HOST=localhost');
    expect(exportEnvFile).toHaveBeenCalledWith('project-1', 'prod', '/');
  });

  it('exports the json format', async () => {
    const response = await request('?project=kettu&env=prod&format=json&path=/database/creds');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="kettu-prod.json"',
    );
    await expect(response.json()).resolves.toEqual({ API_KEY: 'abc' });
    expect(exportJsonFile).toHaveBeenCalledWith('project-1', 'prod', '/database/creds');
  });

  it('normalizes the requested path', async () => {
    await request('?project=kettu&env=prod&path=database//creds/');
    expect(exportEnvFile).toHaveBeenCalledWith('project-1', 'prod', '/database/creds');
  });

  it('authorizes a session user when no api key is present', async () => {
    const response = await request('?project=kettu&env=prod', { user: { id: 'user-1' } });

    expect(response.status).toBe(200);
    expect(canSessionUser).toHaveBeenCalledWith({ id: 'user-1' }, 'project:vault:secrets:read', {
      scope: 'project',
      projectId: 'project-1',
      organizationId: 'org-1',
    });
  });

  it('rejects a session user without permission', async () => {
    canSessionUser.mockResolvedValue(false);
    const response = await request('?project=kettu&env=prod', { user: { id: 'user-1' } });
    expect(response.status).toBe(403);
  });

  it('maps service errors to 400', async () => {
    exportEnvFile.mockRejectedValue(new Error('Environment not found'));
    const response = await request('?project=kettu&env=nope');
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Environment not found' });
  });
});
