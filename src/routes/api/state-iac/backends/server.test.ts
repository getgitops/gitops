import { beforeEach, describe, expect, it, vi } from 'vitest';

// grants per caller and context key (`org:<id>`)
const grants: { users: Record<string, Record<string, string[]>> } = { users: {} };

vi.mock('#modules/auth', () => ({
  cancanService: {
    canSessionUser: async (
      user: { id?: string } | null,
      permission: string,
      context: { organizationId?: string },
    ) => {
      const owned = grants.users[user?.id ?? '']?.[`org:${context.organizationId}`] ?? [];
      const [scope, ...rest] = permission.split(':');
      const resource = rest.slice(0, -1).join(':');
      return owned.includes(permission) || owned.includes(`${scope}:${resource}:all`);
    },
    canApiKey: () => false,
  },
}));

vi.mock('#modules/organization', () => ({
  organizationService: {
    getOrganization: async (id: string) =>
      ['org-1', 'org-2'].includes(id) ? { id, name: id, slug: id } : null,
  },
}));

vi.mock('#modules/projects', () => ({ projectService: { getProject: async () => null } }));

vi.mock('#modules/state-iac', async () => {
  const { createStateIacFixture } = await import('#modules/state-iac/application/testing');
  const domain = await import('#modules/state-iac/domain/state-backend.domain');
  const fixture = createStateIacFixture();
  return {
    ...domain,
    stateBackendService: fixture.backendService,
    stateBindingService: fixture.bindingService,
    fixture,
  };
});

const stateIac = (await import('#modules/state-iac')) as unknown as {
  fixture: ReturnType<
    typeof import('#modules/state-iac/application/testing').createStateIacFixture
  >;
};
const { fixtureStore } = await import('#modules/state-iac/application/testing');
const collection = await import('./+server');
const item = await import('./[id]/+server');
const testRoute = await import('./[id]/test/+server');
const projectsRoute = await import('./[id]/projects/+server');
const bindingRoute = await import('./[id]/projects/[pulumiProject]/+server');

const ADMIN = ['organization:stateiac:backends:all'];
const SECRET = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

function call(
  handler: (event: never) => Promise<Response>,
  input: {
    user?: string;
    body?: unknown;
    url?: string;
    params?: Record<string, string>;
  },
) {
  return handler({
    locals: input.user ? { user: { id: input.user } } : {},
    params: input.params ?? {},
    url: new URL(input.url ?? 'http://localhost/api/state-iac/backends'),
    request: { json: async () => input.body ?? {} },
  } as never);
}

async function createBackend(user = 'admin') {
  const response = await call(collection.POST, {
    user,
    body: {
      organizationId: 'org-1',
      name: 's3-prod',
      provider: 's3',
      bucket: 'acme-state',
      auth: 'credentials',
      credentials: { accessKeyId: 'AKIAEXAMPLE', secretAccessKey: SECRET },
    },
  });
  return { response, body: (await response.json()) as { id: string; [key: string]: unknown } };
}

describe('/api/state-iac/backends', () => {
  beforeEach(() => {
    stateIac.fixture.backends.rows = [];
    stateIac.fixture.bindings.rows = [];
    stateIac.fixture.buckets.clear();
    grants.users = {
      admin: { 'org-1': [], 'org:org-1': ADMIN },
      reader: { 'org:org-1': ['organization:stateiac:backends:read'] },
      tester: {
        'org:org-1': ['organization:stateiac:backends:read', 'organization:stateiac:backends:test'],
      },
      otherOrgAdmin: { 'org:org-2': ADMIN },
      notificationsAdmin: { 'org:org-1': ['organization:notifications:all'] },
    };
  });

  it('never returns the credentials, only hasCredentials', async () => {
    const created = await createBackend();
    expect(created.response.status).toBe(201);
    const listed = await call(collection.GET, {
      user: 'reader',
      url: 'http://localhost/api/state-iac/backends?organizationId=org-1',
    });
    const fetched = await call(item.GET, { user: 'reader', params: { id: created.body.id } });
    for (const response of [listed, fetched]) {
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain('AKIAEXAMPLE');
      expect(text).toContain('"hasCredentials":true');
    }
    expect(created.body).not.toHaveProperty('credentials');
  });

  it('only organization:stateiac:backends:* can configure backends', async () => {
    expect((await createBackend('reader')).response.status).toBe(403);
    expect((await createBackend('notificationsAdmin')).response.status).toBe(403);
    expect(
      (
        await call(collection.GET, {
          user: 'notificationsAdmin',
          url: 'http://localhost/api/state-iac/backends?organizationId=org-1',
        })
      ).status,
    ).toBe(403);

    const { body } = await createBackend();
    const id = body.id;
    expect(
      (await call(item.PATCH, { user: 'reader', params: { id }, body: { name: 'x' } })).status,
    ).toBe(403);
    expect((await call(item.DELETE, { user: 'reader', params: { id } })).status).toBe(403);
    expect((await call(testRoute.POST, { user: 'reader', params: { id } })).status).toBe(403);
    expect((await call(testRoute.POST, { user: 'tester', params: { id } })).status).toBe(200);
    expect(
      (
        await call(bindingRoute.PUT, {
          user: 'tester',
          params: { id, pulumiProject: 'network' },
          body: { projectId: 'p1' },
        })
      ).status,
    ).toBe(403);
  });

  it("another organization's backend answers 404, like a missing one", async () => {
    const { body } = await createBackend();
    for (const handler of [item.GET, item.DELETE, projectsRoute.GET]) {
      expect((await call(handler, { user: 'otherOrgAdmin', params: { id: body.id } })).status).toBe(
        404,
      );
    }
    expect((await call(item.GET, { user: 'admin', params: { id: 'missing' } })).status).toBe(404);
  });

  it('returns validation errors per field', async () => {
    const response = await call(collection.POST, {
      user: 'admin',
      body: {
        organizationId: 'org-1',
        provider: 's3',
        bucket: '!!',
        endpoint: 'http://169.254.169.254',
      },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid backend',
      errors: { name: 'required', bucket: 'invalid_bucket', endpoint: 'endpoint_not_allowed' },
    });
  });

  it('requires an existing organizationId', async () => {
    expect((await call(collection.GET, { user: 'admin' })).status).toBe(400);
    expect(
      (await call(collection.GET, { user: 'admin', url: 'http://localhost/x?organizationId=nope' }))
        .status,
    ).toBe(404);
  });

  it('PATCH without credentials keeps them; DELETE removes the bindings', async () => {
    const { body } = await createBackend();
    const stored = stateIac.fixture.backends.rows[0].credentials;
    const patched = await call(item.PATCH, {
      user: 'admin',
      params: { id: body.id },
      body: { name: 's3-renamed' },
    });
    expect(patched.status).toBe(200);
    expect(stateIac.fixture.backends.rows[0]).toMatchObject({
      name: 's3-renamed',
      credentials: stored,
    });

    stateIac.fixture.projects.set('p1', { id: 'p1', organizationId: 'org-1' });
    await call(bindingRoute.PUT, {
      user: 'admin',
      params: { id: body.id, pulumiProject: 'network' },
      body: { projectId: 'p1' },
    });
    expect(stateIac.fixture.bindings.rows).toHaveLength(1);
    expect((await call(item.DELETE, { user: 'admin', params: { id: body.id } })).status).toBe(200);
    expect(stateIac.fixture.bindings.rows).toHaveLength(0);
  });

  it('lists discovered Pulumi projects with their assignment, and assigns them', async () => {
    const { body } = await createBackend();
    stateIac.fixture.buckets.set('acme-state', fixtureStore('project-layout'));

    const put = await call(bindingRoute.PUT, {
      user: 'admin',
      params: { id: body.id, pulumiProject: 'acme-infra' },
      body: { projectId: 'p1', stacks: ['prod'] },
    });
    expect(put.status).toBe(200);
    // a binding left over from a project that is no longer in the bucket
    await call(bindingRoute.PUT, {
      user: 'admin',
      params: { id: body.id, pulumiProject: 'gone' },
      body: { projectId: 'p2' },
    });

    const listed = await call(projectsRoute.GET, { user: 'reader', params: { id: body.id } });
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual({
      ok: true,
      layout: 'project',
      metaVersion: 1,
      truncated: false,
      projects: [
        {
          name: 'acme-infra',
          stacks: ['prod', 'staging'],
          binding: { projectId: 'p1', stacks: ['prod'] },
        },
        { name: 'acme-platform', stacks: ['dev'], binding: null },
      ],
      missing: [{ pulumiProject: 'gone', projectId: 'p2', stacks: [] }],
    });

    const removed = await call(bindingRoute.DELETE, {
      user: 'admin',
      params: { id: body.id, pulumiProject: 'acme-infra' },
    });
    expect(await removed.json()).toEqual({ pulumiProject: 'acme-infra', removed: true });
  });

  it('a project of another organization cannot be assigned', async () => {
    const { body } = await createBackend();
    const response = await call(bindingRoute.PUT, {
      user: 'admin',
      params: { id: body.id, pulumiProject: 'network' },
      body: { projectId: 'other-org-project' },
    });
    expect(response.status).toBe(400);
    expect((await response.json()).errors).toEqual({ projectId: 'project_not_found' });
  });

  it('reports a bucket that cannot be read without leaking the provider message', async () => {
    const { body } = await createBackend();
    const store = fixtureStore('project-layout');
    store.failWith = Object.assign(
      new Error('User arn:aws:iam::123456789012:user/x is not authorized'),
      {
        name: 'AccessDenied',
        $metadata: { httpStatusCode: 403 },
      },
    );
    stateIac.fixture.buckets.set('acme-state', store);
    const response = await call(testRoute.POST, { user: 'admin', params: { id: body.id } });
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ok: false, error: 'access_denied' });
    expect(text).not.toContain('123456789012');
  });
});
