import { beforeEach, describe, expect, it, vi } from 'vitest';

const tryFindBySlug = vi.fn();
const canApiKey = vi.fn();
const canSessionUser = vi.fn();
const getFolderByPath = vi.fn();
const createSecret = vi.fn();

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
    getFolderByPath: (...args: unknown[]) => getFolderByPath(...args),
    createSecret: (...args: unknown[]) => createSecret(...args),
  },
}));

const { POST } = await import('./+server');

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

function request(body: Record<string, unknown>, locals: Record<string, unknown> = { apiKey }) {
  return POST({
    request: { json: () => Promise.resolve(body) },
    locals: { logger: { warn: vi.fn() }, ...locals },
  } as never);
}

describe('POST /api/vault/secret', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tryFindBySlug.mockResolvedValue(project);
    canApiKey.mockReturnValue(true);
    canSessionUser.mockResolvedValue(true);
    getFolderByPath.mockResolvedValue(null);
    createSecret.mockResolvedValue({ id: 's1', key: 'API_KEY', values: {} });
  });

  it('requires the project slug', async () => {
    const response = await request({ key: 'API_KEY' });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'project is required' });
  });

  it('requires the key', async () => {
    const response = await request({ project: 'kettu' });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'key is required' });
  });

  it('returns 404 when the project does not exist', async () => {
    tryFindBySlug.mockResolvedValue(null);
    const response = await request({ project: 'missing', key: 'API_KEY' });
    expect(response.status).toBe(404);
  });

  it('rejects an API key from another project', async () => {
    const response = await request(
      { project: 'kettu', key: 'API_KEY' },
      { apiKey: { ...apiKey, projectId: 'project-2' } },
    );
    expect(response.status).toBe(403);
    expect(createSecret).not.toHaveBeenCalled();
  });

  it('rejects a token without the create permission', async () => {
    canApiKey.mockReturnValue(false);
    const response = await request({ project: 'kettu', key: 'API_KEY' });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('rejects a session user without permission', async () => {
    canSessionUser.mockResolvedValue(false);
    const response = await request({ project: 'kettu', key: 'API_KEY' }, { user: { id: 'u1' } });
    expect(response.status).toBe(403);
  });

  it('creates the secret at the root path by default', async () => {
    const response = await request({ project: 'kettu', key: 'API_KEY', values: { prod: 'x' } });

    expect(response.status).toBe(201);
    expect(getFolderByPath).toHaveBeenCalledWith('project-1', '/');
    expect(createSecret).toHaveBeenCalledWith('project-1', {
      folderId: null,
      key: 'API_KEY',
      description: undefined,
      values: { prod: 'x' },
    });
    await expect(response.json()).resolves.toEqual({
      secret: { id: 's1', key: 'API_KEY', values: {} },
    });
  });

  it('resolves the folder from the given path', async () => {
    getFolderByPath.mockResolvedValue({ id: 'folder-1', path: '/database' });
    await request({ project: 'kettu', key: 'DB_HOST', path: 'database' });

    expect(getFolderByPath).toHaveBeenCalledWith('project-1', '/database');
    expect(createSecret).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ folderId: 'folder-1' }),
    );
  });

  it('maps an unknown path to 404', async () => {
    getFolderByPath.mockRejectedValue(new Error('Folder not found'));
    const response = await request({ project: 'kettu', key: 'API_KEY', path: 'nope' });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Folder not found' });
  });

  it('maps other service errors to 400', async () => {
    createSecret.mockRejectedValue(new Error('La key del secreto es obligatoria'));
    const response = await request({ project: 'kettu', key: 'API_KEY' });
    expect(response.status).toBe(400);
  });
});
