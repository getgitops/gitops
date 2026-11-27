import { beforeEach, describe, expect, it, vi } from 'vitest';

// grants per caller and context key (`org:<id>` / `project:<id>`)
const grants: {
  users: Record<string, Record<string, string[]>>;
  apiKeys: Record<string, string[]>;
} = { users: {}, apiKeys: {} };

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
      ['p1', 'p2'].includes(id)
        ? { id, name: `Project ${id}`, slug: id, organization: { id: 'org-1', slug: 'kettu' } }
        : null,
  },
}));

vi.mock('#modules/organization', () => ({
  organizationService: {
    getOrganization: async (id: string) =>
      id === 'org-1' ? { id, name: 'Kettu', slug: 'kettu' } : null,
  },
}));

vi.mock('#modules/notifications', async () => {
  const { createChannelsFixture, FakeChatTransport } =
    await import('#modules/notifications/application/testing');
  const domain = await import('#modules/notifications/domain/notification-channel.domain');
  const { buildChannelTestMessage } =
    await import('#modules/notifications/infrastructure/channel-test-message');
  const fixture = createChannelsFixture({ transports: { webhook: new FakeChatTransport(true) } });
  return {
    ...domain,
    buildChannelTestMessage,
    notificationChannelService: fixture.service,
    fixture,
  };
});

const notifications = (await import('#modules/notifications')) as unknown as {
  fixture: ReturnType<
    typeof import('#modules/notifications/application/testing').createChannelsFixture
  >;
};
const collection = await import('./+server');
const item = await import('./[id]/+server');
const test = await import('./[id]/test/+server');
const rotate = await import('./[id]/rotate-secret/+server');

const HOOK = 'https://hooks.example.com/hook/T0/B0/topsecret1a2b';
const ORG_ADMIN = ['read', 'create', 'update', 'delete'].map(
  (a) => `organization:notifications:${a}`,
);
const PROJECT_ADMIN = ['read', 'create', 'update', 'delete'].map(
  (a) => `project:notifications:${a}`,
);

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
    url: new URL(input.url ?? 'http://localhost/api/notification-channels'),
    request: { json: async () => input.body ?? {} },
  } as never);
}

const as = (id: string) => ({ user: { id } });

async function createOrgChannel() {
  const response = await call(collection.POST, {
    locals: as('orgAdmin'),
    body: { organizationId: 'org-1', type: 'slack', name: '#alerts', destination: HOOK },
  });
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string };
}

describe('/api/notification-channels', () => {
  beforeEach(() => {
    notifications.fixture.repository.rows = [];
    notifications.fixture.transport.sent = [];
    grants.users = {
      orgAdmin: { 'org:org-1': ORG_ADMIN },
      orgReader: { 'org:org-1': ['organization:notifications:read'] },
      alertsOnly: { 'org:org-1': ['organization:alerts:all', 'organization:alerts:read'] },
      projectAdmin: { 'project:p1': PROJECT_ADMIN },
    };
    grants.apiKeys = { 'key-p1': PROJECT_ADMIN };
  });

  it('never returns the destination in clear', async () => {
    const created = await createOrgChannel();
    const listed = await call(collection.GET, {
      locals: as('orgReader'),
      url: 'http://localhost/api/notification-channels?organizationId=org-1',
    });
    const fetched = await call(item.GET, { locals: as('orgReader'), params: { id: created.id } });
    for (const response of [listed, fetched]) {
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).not.toContain('topsecret');
      expect(text).not.toContain('webhookUrl');
      expect(text).toContain('••••1a2b');
    }
  });

  it('needs *:notifications:* to see or manage channels', async () => {
    const created = await createOrgChannel();

    for (const locals of [{}, as('alertsOnly')]) {
      const listed = await call(collection.GET, {
        locals,
        url: 'http://localhost/api/notification-channels?organizationId=org-1',
      });
      expect(listed.status).toBe(403);
      // a channel the caller can't read looks missing
      expect((await call(item.GET, { locals, params: { id: created.id } })).status).toBe(404);
    }

    const reader = as('orgReader');
    expect(
      (
        await call(collection.POST, {
          locals: reader,
          body: { organizationId: 'org-1', type: 'slack', name: 'x', destination: HOOK },
        })
      ).status,
    ).toBe(403);
    expect(
      (await call(item.PATCH, { locals: reader, params: { id: created.id }, body: { name: 'y' } }))
        .status,
    ).toBe(403);
    expect((await call(item.DELETE, { locals: reader, params: { id: created.id } })).status).toBe(
      403,
    );
    expect((await call(test.POST, { locals: reader, params: { id: created.id } })).status).toBe(
      403,
    );
    expect(notifications.fixture.transport.sent).toHaveLength(0);
  });

  it('creates no project channels: projects list the organization ones they can use', async () => {
    const org = await createOrgChannel();
    const refused = await call(collection.POST, {
      locals: as('projectAdmin'),
      body: { projectId: 'p1', type: 'slack', name: '#p1', destination: HOOK },
    });
    expect(refused.status).toBe(400);
    await expect(refused.json()).resolves.toMatchObject({
      errors: { scope: 'project_channels_unsupported' },
    });

    const listed = await call(collection.GET, {
      locals: as('projectAdmin'),
      url: 'http://localhost/api/notification-channels?projectId=p1',
    });
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({
      channels: [{ id: org.id, scope: 'organization' }],
      availableTypes: [],
    });
  });

  it('keeps project admins and project keys inside their project', async () => {
    // no organization channels for a project admin
    const orgChannel = await call(collection.POST, {
      locals: as('projectAdmin'),
      body: { organizationId: 'org-1', type: 'slack', name: '#org', destination: HOOK },
    });
    expect(orgChannel.status).toBe(403);

    const key = { apiKey: { id: 'key-p1', projectId: 'p1', userId: null, role: null } };
    expect(
      (
        await call(collection.GET, {
          locals: key,
          url: 'http://localhost/api/notification-channels?projectId=p1',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call(collection.GET, {
          locals: key,
          url: 'http://localhost/api/notification-channels?projectId=p2',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(collection.GET, {
          locals: key,
          url: 'http://localhost/api/notification-channels?organizationId=org-1',
        })
      ).status,
    ).toBe(403);
  });

  it('validates the destination on the server', async () => {
    const response = await call(collection.POST, {
      locals: as('orgAdmin'),
      body: {
        organizationId: 'org-1',
        type: 'slack',
        name: 'x',
        destination: 'https://127.0.0.1/hook/x',
      },
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid channel',
      errors: { destination: 'ip_address' },
    });
  });

  it('sends a test message with the fake transport', async () => {
    const created = await createOrgChannel();
    const response = await call(test.POST, { locals: as('orgAdmin'), params: { id: created.id } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ sent: true, error: null });
    expect(notifications.fixture.transport.sent[0].message).toMatchObject({
      title: 'GitOps test message for #alerts',
      test: true,
    });
  });

  it('updates and deletes with the right permissions', async () => {
    const created = await createOrgChannel();
    const updated = await call(item.PATCH, {
      locals: as('orgAdmin'),
      params: { id: created.id },
      body: { name: '#renamed', enabled: false, type: 'google-chat' },
    });
    await expect(updated.json()).resolves.toMatchObject({
      name: '#renamed',
      enabled: false,
      type: 'slack',
    });
    expect(
      (await call(item.DELETE, { locals: as('orgAdmin'), params: { id: created.id } })).status,
    ).toBe(200);
    expect(notifications.fixture.repository.rows).toHaveLength(0);
  });

  it('returns a webhook signing secret only when creating or rotating it', async () => {
    const created = await call(collection.POST, {
      locals: as('orgAdmin'),
      body: { organizationId: 'org-1', type: 'webhook', name: 'SIEM', destination: HOOK },
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as { id: string; signingSecret: string; signed: boolean };
    expect(body.signingSecret).toMatch(/^whsec_/);
    expect(body.signed).toBe(true);
    const first = body.signingSecret;

    const listed = await call(collection.GET, {
      locals: as('orgAdmin'),
      url: 'http://localhost/api/notification-channels?organizationId=org-1',
    });
    const fetched = await call(item.GET, { locals: as('orgAdmin'), params: { id: body.id } });
    const patched = await call(item.PATCH, {
      locals: as('orgAdmin'),
      params: { id: body.id },
      body: { name: 'SIEM 2' },
    });
    for (const response of [listed, fetched, patched]) {
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).not.toContain('whsec_');
      expect(text).not.toContain('signingSecret');
      expect(text).not.toContain('topsecret');
    }

    // rotating needs update
    expect(
      (await call(rotate.POST, { locals: as('orgReader'), params: { id: body.id } })).status,
    ).toBe(403);
    const rotated = await call(rotate.POST, { locals: as('orgAdmin'), params: { id: body.id } });
    expect(rotated.status).toBe(200);
    const next = (await rotated.json()) as { signingSecret: string; rotationEndsAt: string };
    expect(next.signingSecret).toMatch(/^whsec_/);
    expect(next.signingSecret).not.toBe(first);
    expect(next.rotationEndsAt).toBeTruthy();
  });

  it('cannot rotate a channel type that does not sign', async () => {
    const created = await createOrgChannel();
    const response = await call(rotate.POST, {
      locals: as('orgAdmin'),
      params: { id: created.id },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ errors: { type: 'not_signed' } });
    expect(
      (await call(rotate.POST, { locals: as('orgAdmin'), params: { id: 'missing' } })).status,
    ).toBe(404);
  });
});
