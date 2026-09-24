import { beforeEach, describe, expect, it, vi } from 'vitest';

const getProject = vi.fn();
const canApiKey = vi.fn();
const canSessionUser = vi.fn();
const getFolderByPath = vi.fn();
const findSecretByKey = vi.fn();
const setSecretValue = vi.fn();
const deleteSecretByKey = vi.fn();

vi.mock('$modules/projects', () => ({
  projectService: {
    getProject: (id: string) => getProject(id),
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
    findSecretByKey: (...args: unknown[]) => findSecretByKey(...args),
    setSecretValue: (...args: unknown[]) => setSecretValue(...args),
    deleteSecretByKey: (...args: unknown[]) => deleteSecretByKey(...args),
  },
}));

const { GET, PATCH, DELETE } = await import('./+server');

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

function locals(overrides: Record<string, unknown> = { apiKey }) {
  return { logger: { warn: vi.fn() }, ...overrides };
}

function get(query: string, overrides?: Record<string, unknown>) {
  return GET({
    params: { key: 'API_KEY' },
    url: new URL(`http://localhost/api/vault/secret/API_KEY${query}`),
    locals: locals(overrides),
  } as never);
}

function patch(query: string, body: Record<string, unknown>, overrides?: Record<string, unknown>) {
  return PATCH({
    params: { key: 'API_KEY' },
    url: new URL(`http://localhost/api/vault/secret/API_KEY${query}`),
    request: { json: () => Promise.resolve(body) },
    locals: locals(overrides),
  } as never);
}

function del(query: string, overrides?: Record<string, unknown>) {
  return DELETE({
    params: { key: 'API_KEY' },
    url: new URL(`http://localhost/api/vault/secret/API_KEY${query}`),
    locals: locals(overrides),
  } as never);
}

describe('/api/vault/secret/[key]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProject.mockResolvedValue(project);
    canApiKey.mockReturnValue(true);
    canSessionUser.mockResolvedValue(true);
    getFolderByPath.mockResolvedValue(null);
    findSecretByKey.mockResolvedValue({ id: 's1', key: 'API_KEY', values: { prod: 'x' } });
    setSecretValue.mockResolvedValue({ id: 's1', key: 'API_KEY', values: { dev: 'x', prod: 'y' } });
    deleteSecretByKey.mockResolvedValue(undefined);
  });

  describe('GET', () => {
    it('requires the project slug', async () => {
      const response = await get('');
      expect(response.status).toBe(400);
    });

    it('rejects a token without the read permission', async () => {
      canApiKey.mockReturnValue(false);
      const response = await get('?projectId=project-1');
      expect(response.status).toBe(403);
    });

    it('returns the secret at the root path by default', async () => {
      const response = await get('?projectId=project-1');
      expect(getFolderByPath).toHaveBeenCalledWith('project-1', '/');
      expect(findSecretByKey).toHaveBeenCalledWith('project-1', null, 'API_KEY');
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        secret: { id: 's1', key: 'API_KEY', values: { prod: 'x' } },
      });
    });

    it('returns 404 when the secret does not exist', async () => {
      findSecretByKey.mockResolvedValue(null);
      const response = await get('?projectId=project-1');
      expect(response.status).toBe(404);
    });

    it('maps an unknown path to 404', async () => {
      getFolderByPath.mockRejectedValue(new Error('Folder not found'));
      const response = await get('?projectId=project-1&path=nope');
      expect(response.status).toBe(404);
    });
  });

  describe('PATCH', () => {
    it('requires the environment', async () => {
      const response = await patch('?projectId=project-1', { value: 'y' });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'environment is required' });
    });

    it('requires the value', async () => {
      const response = await patch('?projectId=project-1', { environment: 'prod' });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'value is required' });
    });

    it('rejects a token without the update permission', async () => {
      canApiKey.mockReturnValue(false);
      const response = await patch('?projectId=project-1', { environment: 'prod', value: 'y' });
      expect(response.status).toBe(403);
    });

    it('sets the value for the given environment', async () => {
      const response = await patch('?projectId=project-1', { environment: 'prod', value: 'y' });

      expect(setSecretValue).toHaveBeenCalledWith(
        'project-1',
        null,
        'API_KEY',
        'prod',
        'y',
        undefined,
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        secret: { id: 's1', key: 'API_KEY', value: 'y' },
      });
    });

    it('passes an optional description through', async () => {
      await patch('?projectId=project-1', { environment: 'prod', value: 'y', description: 'new' });
      expect(setSecretValue).toHaveBeenCalledWith(
        'project-1',
        null,
        'API_KEY',
        'prod',
        'y',
        'new',
      );
    });

    it('returns 404 when the secret does not exist', async () => {
      setSecretValue.mockRejectedValue(new Error('Secret not found'));
      const response = await patch('?projectId=project-1', { environment: 'prod', value: 'y' });
      expect(response.status).toBe(404);
    });
  });

  describe('DELETE', () => {
    it('rejects a token without the delete permission', async () => {
      canApiKey.mockReturnValue(false);
      const response = await del('?projectId=project-1');
      expect(response.status).toBe(403);
    });

    it('deletes the secret at the root path by default', async () => {
      const response = await del('?projectId=project-1');
      expect(deleteSecretByKey).toHaveBeenCalledWith('project-1', null, 'API_KEY');
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ success: true });
    });

    it('returns 404 when the secret does not exist', async () => {
      deleteSecretByKey.mockRejectedValue(new Error('Secret not found'));
      const response = await del('?projectId=project-1');
      expect(response.status).toBe(404);
    });
  });
});
