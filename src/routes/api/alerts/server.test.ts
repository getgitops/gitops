import { beforeEach, describe, expect, it, vi } from 'vitest';

type Grants = Record<string, string[]>;

// grants per caller and context key (`org:<id>` / `project:<id>`)
const grants: { users: Record<string, Grants>; apiKeys: Record<string, string[]> } = {
  users: {},
  apiKeys: {},
};

function contextKey(context: { scope: string; organizationId?: string; projectId?: string }) {
  return context.scope === 'project'
    ? `project:${context.projectId}`
    : `org:${context.organizationId}`;
}

vi.mock('#modules/auth', () => ({
  cancanService: {
    canSessionUser: async (user: { id?: string } | null, permission: string, context: never) =>
      !!user?.id && (grants.users[user.id]?.[contextKey(context)] ?? []).includes(permission),
    canApiKey: (
      apiKey: { id: string; projectId: string | null },
      permission: string,
      context: { scope: string; projectId?: string },
    ) => {
      if (
        apiKey.projectId &&
        (context.scope !== 'project' || context.projectId !== apiKey.projectId)
      ) {
        return false;
      }
      return (grants.apiKeys[apiKey.id] ?? []).includes(permission);
    },
  },
}));

vi.mock('#modules/projects', () => ({
  projectService: {
    getProject: async (id: string) =>
      ['p1', 'p2'].includes(id) ? { id, organization: { id: 'org-1' } } : null,
  },
}));

vi.mock('#modules/organization', () => ({
  organizationService: {
    getOrganization: async (id: string) => (id === 'org-1' ? { id, name: 'Kettu' } : null),
  },
}));

vi.mock('#modules/alerts', async () => {
  const domain = await import('#modules/alerts/domain/alert.domain');
  const { AlertService } = await import('#modules/alerts/application/alert.service');
  const { AlertEngine } = await import('#modules/alerts/application/alert-engine');
  const { RecipientResolver } = await import('#modules/alerts/application/recipient-resolver');
  const { FakeAlertDirectory } = await import('#modules/alerts/application/testing');
  const { InMemoryAlertRepository } =
    await import('#modules/alerts/infrastructure/repositories/in-memory-alert.repository');
  const { buildSampleEvent } = await import('#modules/alerts/domain/sample-event');

  const repository = new InMemoryAlertRepository();
  const directory = new FakeAlertDirectory();
  directory.members = [
    {
      organizationId: 'org-1',
      projectId: 'p1',
      userId: 'admin',
      username: 'admin',
      email: 'admin@x.io',
      disabled: false,
      roleIds: ['r-admin'],
    },
  ];
  directory.roles = [
    { organizationId: 'org-1', projectId: 'p1', id: 'r-admin', name: 'Project Admin' },
  ];
  let id = 0;
  const alertService = new AlertService(repository, directory, {
    generateId: () => `alert-${++id}`,
  });
  const alertEngine = new AlertEngine({
    repository,
    directory,
    recipients: new RecipientResolver(directory, async () => true),
    notifier: { sendAlert: async () => {}, sendSystemNotification: async () => {} },
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  });
  return {
    ...domain,
    alertService,
    alertEngine,
    alertDirectory: directory,
    buildSampleEvent,
    repository,
  };
});

const alerts = await import('#modules/alerts');
const repository = (alerts as unknown as { repository: { rows: unknown[] } }).repository;
const collection = await import('./+server');
const item = await import('./[id]/+server');
const test = await import('./[id]/test/+server');

const ADMIN_GRANTS = [
  'project:alerts:read',
  'project:alerts:create',
  'project:alerts:update',
  'project:alerts:delete',
  'project:codereport:reports:read',
];

const guided = {
  projectId: 'p1',
  name: 'Críticas en api-gateway',
  eventType: 'code_report.analysis.completed',
  conditions: [{ field: 'summary.critical', operator: 'gt', value: 0 }],
  recipients: { roleIds: ['r-admin'] },
  throttleMinutes: 30,
};

function call(
  handler: (event: never) => Promise<Response>,
  input: {
    locals?: Record<string, unknown>;
    body?: unknown;
    url?: string;
    params?: Record<string, string>;
  },
) {
  return handler({
    locals: input.locals ?? {},
    params: input.params ?? {},
    url: new URL(input.url ?? 'http://localhost/api/alerts'),
    request: { json: async () => input.body ?? {} },
  } as never);
}

const admin = { user: { id: 'admin' } };
const viewer = { user: { id: 'viewer' } };

describe('/api/alerts', () => {
  beforeEach(() => {
    repository.rows = [];
    grants.users = {
      admin: { 'project:p1': ADMIN_GRANTS },
      viewer: { 'project:p1': ['project:alerts:read', 'project:codereport:reports:read'] },
      // can manage alerts but not read code reports
      vaultAdmin: { 'project:p1': ['project:alerts:create', 'project:vault:secrets:read'] },
    };
    grants.apiKeys = { 'key-p1': ADMIN_GRANTS, 'key-p2': ADMIN_GRANTS };
  });

  it('rejects callers without identity or permission', async () => {
    const anonymous = await call(collection.POST, { body: guided });
    expect(anonymous.status).toBe(403);

    const asViewer = await call(collection.POST, { locals: viewer, body: guided });
    expect(asViewer.status).toBe(403);
    await expect(asViewer.json()).resolves.toEqual({ error: 'Forbidden' });
    expect(repository.rows).toHaveLength(0);
  });

  it('creates an alert and lists it', async () => {
    const created = await call(collection.POST, { locals: admin, body: guided });
    expect(created.status).toBe(201);
    const alert = (await created.json()) as { id: string };
    expect(alert).toMatchObject({ scope: 'project', projectId: 'p1', createdByUserId: 'admin' });

    const listed = await call(collection.GET, {
      locals: viewer,
      url: 'http://localhost/api/alerts?projectId=p1',
    });
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({
      alerts: [{ id: alert.id }],
      inherited: [],
    });
  });

  it('returns field errors for an invalid alert', async () => {
    const response = await call(collection.POST, {
      locals: admin,
      body: {
        ...guided,
        conditions: [{ field: 'summary.critical', operator: 'contains', value: 1 }],
      },
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid alert',
      errors: { 'conditions.0.operator': 'invalid_operator' },
    });
  });

  it('refuses an alert on events its author cannot read (anti-escalation)', async () => {
    const response = await call(collection.POST, {
      locals: { user: { id: 'vaultAdmin' } },
      body: guided,
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ errors: { eventType: 'forbidden' } });
  });

  it('confines a project API key to its own project', async () => {
    const own = await call(collection.POST, {
      locals: { apiKey: { id: 'key-p1', projectId: 'p1', userId: null } },
      body: guided,
    });
    expect(own.status).toBe(201);
    const { id } = (await own.json()) as { id: string };

    const foreign = { apiKey: { id: 'key-p2', projectId: 'p2', userId: null } };
    expect((await call(collection.POST, { locals: foreign, body: guided })).status).toBe(403);
    expect(
      (
        await call(collection.GET, {
          locals: foreign,
          url: 'http://localhost/api/alerts?projectId=p1',
        })
      ).status,
    ).toBe(403);
    // the alert of another project is not even visible
    expect((await call(item.DELETE, { locals: foreign, params: { id } })).status).toBe(404);
    expect(
      (
        await call(collection.GET, {
          locals: foreign,
          url: 'http://localhost/api/alerts?organizationId=org-1',
        })
      ).status,
    ).toBe(403);
  });

  it('validates the location', async () => {
    expect(
      (await call(collection.GET, { locals: admin, url: 'http://localhost/api/alerts' })).status,
    ).toBe(400);
    expect(
      (
        await call(collection.GET, {
          locals: admin,
          url: 'http://localhost/api/alerts?projectId=missing',
        })
      ).status,
    ).toBe(404);
  });

  describe('/api/alerts/[id]', () => {
    let id = '';
    beforeEach(async () => {
      const created = await call(collection.POST, { locals: admin, body: guided });
      id = ((await created.json()) as { id: string }).id;
    });

    it('updates and deletes with the matching permissions', async () => {
      const denied = await call(item.PATCH, {
        locals: viewer,
        params: { id },
        body: { enabled: false },
      });
      expect(denied.status).toBe(403);

      const patched = await call(item.PATCH, {
        locals: admin,
        params: { id },
        body: { enabled: false },
      });
      expect(patched.status).toBe(200);
      await expect(patched.json()).resolves.toMatchObject({ enabled: false, name: guided.name });

      expect((await call(item.DELETE, { locals: viewer, params: { id } })).status).toBe(403);
      expect((await call(item.DELETE, { locals: admin, params: { id } })).status).toBe(200);
      expect((await call(item.GET, { locals: admin, params: { id } })).status).toBe(404);
    });

    it('dry-runs an alert without sending anything', async () => {
      expect((await call(test.POST, { locals: viewer, params: { id } })).status).toBe(403);

      const response = await call(test.POST, { locals: admin, params: { id } });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        matched: true,
        recipients: [{ userId: 'admin', username: 'admin' }],
        deniedCount: 0,
        event: {
          type: 'code_report.analysis.completed',
          payload: { summary: { critical: 1 } },
          projectId: 'p1',
        },
      });

      const noMatch = await call(test.POST, {
        locals: admin,
        params: { id },
        body: { payload: { summary: { critical: 0 } } },
      });
      await expect(noMatch.json()).resolves.toMatchObject({ matched: false });
    });
  });
});

describe('/api/events/catalog', () => {
  const catalog = () => import('../events/catalog/+server');

  it('lists only the project events the caller can read', async () => {
    grants.users = { viewer: { 'project:p1': ['project:codereport:reports:read'] } };
    const { GET } = await catalog();
    const response = await call(GET, {
      locals: viewer,
      url: 'http://localhost/api/events/catalog?scope=project&projectId=p1',
    });
    expect(response.status).toBe(200);
    const { events } = (await response.json()) as {
      events: Array<{
        type: string;
        scope: string;
        fields: Array<{ key: string; derived?: boolean }>;
      }>;
    };
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.type.startsWith('code_report.'))).toBe(true);
    const completed = events.find((event) => event.type === 'code_report.analysis.completed');
    expect(completed?.fields.find((field) => field.key === 'hasVulnerabilities')).toMatchObject({
      derived: true,
    });
    // server-only parts of the definition never reach the client
    expect(completed).not.toHaveProperty('mailTemplate');
    expect(completed).not.toHaveProperty('link');
    // a project alert has no project field to filter on
    expect(completed?.fields.some((field) => field.key === 'projectId')).toBe(false);
  });

  it('adds the project field to project events in an organization', async () => {
    grants.users = { admin: { 'org:org-1': ['organization:projects:read'] } };
    const { GET } = await catalog();
    const response = await call(GET, {
      locals: admin,
      url: 'http://localhost/api/events/catalog?scope=organization&organizationId=org-1',
    });
    const { events } = (await response.json()) as {
      events: Array<{ type: string; fields: Array<{ key: string }> }>;
    };
    const completed = events.find((event) => event.type === 'code_report.analysis.completed');
    expect(completed?.fields.some((field) => field.key === 'projectId')).toBe(true);
    // organization events need their own permission
    expect(events.some((event) => event.type === 'organization.updated')).toBe(false);
  });

  it('requires a project for the project scope', async () => {
    const { GET } = await catalog();
    const response = await call(GET, {
      locals: admin,
      url: 'http://localhost/api/events/catalog?scope=project',
    });
    expect(response.status).toBe(400);
  });
});
