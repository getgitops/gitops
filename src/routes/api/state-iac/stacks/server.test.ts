import { beforeEach, describe, expect, it, vi } from 'vitest';

// grants per caller (`user:<id>` / `key:<id>`) and context key (`org:<id>` / `project:<id>`)
const grants: Record<string, Record<string, string[]>> = {};
const keyProjects: Record<string, string | null> = {};

const contextKey = (context: { scope: string; organizationId?: string; projectId?: string }) =>
  context.scope === 'project' ? `project:${context.projectId}` : `org:${context.organizationId}`;

vi.mock('#modules/auth', () => ({
  cancanService: {
    canSessionUser: async (user: { id?: string } | null, permission: string, context: never) =>
      (grants[`user:${user?.id}`]?.[contextKey(context)] ?? []).includes(permission),
    canApiKey: (
      key: { id: string },
      permission: string,
      context: { scope: string; projectId?: string },
    ) => {
      const own = keyProjects[key.id];
      if (own && (context.scope !== 'project' || context.projectId !== own)) return false;
      return (grants[`key:${key.id}`]?.[contextKey(context as never)] ?? []).includes(permission);
    },
  },
}));

vi.mock('#modules/organization', () => ({
  organizationService: {
    getOrganization: async (id: string) => (id === 'org-1' ? { id, name: id, slug: id } : null),
  },
}));

vi.mock('#modules/projects', () => ({
  projectService: {
    getProject: async (id: string) =>
      ['p1', 'p2'].includes(id) ? { id, organization: { id: 'org-1' } } : null,
  },
}));

vi.mock('#modules/state-iac', async () => {
  const { createStateIacFixture } = await import('#modules/state-iac/application/testing');
  const fixture = createStateIacFixture();
  return { stateIacService: fixture.stateIacService, fixture };
});

const { fixture } = (await import('#modules/state-iac')) as unknown as {
  fixture: ReturnType<
    typeof import('#modules/state-iac/application/testing').createStateIacFixture
  >;
};
const { fixtureStore } = await import('#modules/state-iac/application/testing');
const list = await import('./+server');
const item = await import('./[backend]/[pulumiProject]/[stack]/+server');
const historyRoute = await import('./[backend]/[pulumiProject]/[stack]/history/+server');
const diffRoute = await import('./[backend]/[pulumiProject]/[stack]/diff/+server');

let backendId = '';

function get(
  handler: (event: never) => Promise<Response>,
  query: string,
  locals: Record<string, unknown>,
  params: Record<string, string> = {},
) {
  return handler({
    locals,
    params,
    url: new URL(`http://localhost/api/state-iac/stacks?${query}`),
  } as never);
}

const user = (id: string) => ({ user: { id } });
const stackParams = (project: string, stack: string) => ({
  backend: backendId,
  pulumiProject: project,
  stack,
});

describe('/api/state-iac/stacks', () => {
  beforeEach(async () => {
    fixture.backends.rows = [];
    fixture.bindings.rows = [];
    const backend = await fixture.backendService.create('org-1', {
      name: 'shared',
      provider: 'gcs',
      bucket: 'shared-state',
    });
    backendId = backend.id;
    fixture.buckets.set('shared-state', fixtureStore('project-layout'));
    await fixture.bindingService.set(backend, 'acme-infra', { projectId: 'p1' });
    await fixture.bindingService.set(backend, 'acme-platform', { projectId: 'p2' });
    for (const key of Object.keys(grants)) delete grants[key];
    grants['user:a'] = {
      'project:p1': ['project:stateiac:stacks:read', 'project:stateiac:states:read'],
    };
    grants['user:listOnly'] = { 'project:p1': ['project:stateiac:stacks:read'] };
    grants['user:historian'] = { 'project:p1': ['project:stateiac:history:read'] };
    grants['user:org'] = { 'org:org-1': ['organization:stateiac:stacks:read'] };
    grants['key:k1'] = { 'project:p1': ['project:stateiac:stacks:read'] };
    keyProjects.k1 = 'p1';
  });

  it('a project lists only its stacks', async () => {
    const response = await get(list.GET, 'projectId=p1', user('a'));
    expect(response.status).toBe(200);
    const { backends } = await response.json();
    expect(backends[0].stacks.map((s: { ref: { stack: string } }) => s.ref.stack)).toEqual([
      'prod',
      'staging',
    ]);
  });

  it("another project's stack answers 404, also with a resource-level grant", async () => {
    for (const [project, stack] of [
      ['acme-platform', 'dev'],
      ['acme-infra', 'missing'],
    ]) {
      const response = await get(item.GET, 'projectId=p1', user('a'), stackParams(project, stack));
      expect(response.status).toBe(404);
    }
    // without stacks:read in the project it does not even exist
    const hidden = await get(
      item.GET,
      'projectId=p2',
      user('a'),
      stackParams('acme-platform', 'dev'),
    );
    expect(hidden.status).toBe(404);
  });

  it('resources and outputs need states:read; secrets come back masked', async () => {
    const forbidden = await get(
      item.GET,
      'projectId=p1&include=resources',
      user('listOnly'),
      stackParams('acme-infra', 'prod'),
    );
    expect(forbidden.status).toBe(403);
    const summary = await get(
      item.GET,
      'projectId=p1',
      user('listOnly'),
      stackParams('acme-infra', 'prod'),
    );
    expect(summary.status).toBe(200);
    expect(await summary.json()).not.toHaveProperty('resources');

    const full = await get(
      item.GET,
      'projectId=p1&include=resources,outputs',
      user('a'),
      stackParams('acme-infra', 'prod'),
    );
    const text = await full.text();
    expect(JSON.parse(text).resources).toHaveLength(49);
    expect(text).toContain('{"$iac":"secret"}');
    expect(text).not.toMatch(/ciphertext|secrets_providers/);
  });

  it('the organization view needs organization:stateiac:stacks:read', async () => {
    expect((await get(list.GET, 'organizationId=org-1', user('a'))).status).toBe(403);
    const response = await get(list.GET, 'organizationId=org-1', user('org'));
    const { backends } = await response.json();
    expect(backends[0].stacks).toHaveLength(3);
    const detail = await get(
      item.GET,
      'organizationId=org-1&include=outputs',
      user('org'),
      stackParams('acme-infra', 'staging'),
    );
    expect(detail.status).toBe(200);
  });

  it('a project API key stays in its project', async () => {
    const apiKey = { apiKey: { id: 'k1', projectId: 'p1', userId: null, role: null } };
    expect((await get(list.GET, 'projectId=p1', apiKey)).status).toBe(200);
    expect((await get(list.GET, 'projectId=p2', apiKey)).status).toBe(403);
    expect((await get(list.GET, 'organizationId=org-1', apiKey)).status).toBe(403);
  });

  it('requires a scope', async () => {
    expect((await get(list.GET, '', user('a'))).status).toBe(400);
    expect((await get(list.GET, 'projectId=nope', user('a'))).status).toBe(404);
  });

  it('history needs history:read and pages newest first', async () => {
    const params = stackParams('acme-infra', 'prod');
    expect((await get(historyRoute.GET, 'projectId=p1', user('a'), params)).status).toBe(403);
    const page = await get(historyRoute.GET, 'projectId=p1&limit=2', user('historian'), params);
    expect(page.status).toBe(200);
    const body = await page.json();
    expect(body.updates.map((u: { id: string }) => u.id)).toEqual([
      '1795604216162649000',
      '1795602803296701000',
    ]);
    const next = await get(
      historyRoute.GET,
      `projectId=p1&limit=2&cursor=${body.nextCursor}`,
      user('historian'),
      params,
    );
    expect((await next.json()).updates).toHaveLength(2);
    // another project's stack: not found, whatever the grant
    const other = await get(
      historyRoute.GET,
      'projectId=p1',
      user('historian'),
      stackParams('acme-platform', 'dev'),
    );
    expect(other.status).toBe(404);
  });

  it('diff needs states:read and compares the last update with the previous one', async () => {
    const params = stackParams('acme-infra', 'prod');
    expect((await get(diffRoute.GET, 'projectId=p1', user('historian'), params)).status).toBe(403);
    const response = await get(diffRoute.GET, 'projectId=p1', user('a'), params);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.to).toBe('history:1795604216162649000');
    expect(body.diff.summary.update).toBe(2);
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/ciphertext|v1:/);

    const explicit = await get(
      diffRoute.GET,
      'projectId=p1&from=history:1795602066945844000&to=history:1795602803296701000',
      user('a'),
      params,
    );
    expect((await explicit.json()).diff.summary.replace).toBe(1);
  });
});
