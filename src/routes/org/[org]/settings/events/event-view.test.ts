import { describe, expect, it, vi } from 'vitest';
import type { AnyDomainEvent, LoggedEvent } from '#lib/server/events';
import {
  createEventVisibility,
  parseModuleFilter,
  parseStatusFilter,
  toEventView,
} from './event-view';

function logged(event: Partial<AnyDomainEvent>, ack: LoggedEvent['ack'] = null): LoggedEvent {
  return {
    event: {
      id: 'event-1',
      occurredAt: '2026-11-20T10:00:00.000Z',
      actor: { kind: 'user', userId: 'user-1' },
      scope: { organizationId: 'org-1', projectId: 'project-1' },
      ...event,
    } as AnyDomainEvent,
    ack,
  };
}

const secretCreated = logged({
  type: 'vault.secret.created',
  payload: {
    secretId: 's1',
    key: 'DB_PASSWORD',
    folderId: null,
    folderPath: '/',
    environmentIds: ['env-prod'],
  },
});

const projectUpdated = logged({
  type: 'project.updated',
  payload: { projectId: 'project-1', name: 'Shop', slug: 'shop', changedFields: ['name'] },
});

describe('createEventVisibility', () => {
  it("checks the event's read permission in the project for project grants", async () => {
    const can = vi.fn(async () => true);
    const isVisible = createEventVisibility('org-1', can);

    await expect(isVisible(secretCreated)).resolves.toBe(true);
    expect(can).toHaveBeenCalledWith('project:vault:secrets:read', {
      scope: 'project',
      organizationId: 'org-1',
      projectId: 'project-1',
    });
  });

  it('checks organization grants in the organization', async () => {
    const can = vi.fn(async () => false);
    const isVisible = createEventVisibility('org-1', can);

    await expect(isVisible(projectUpdated)).resolves.toBe(false);
    expect(can).toHaveBeenCalledWith('organization:projects:read', {
      scope: 'organization',
      organizationId: 'org-1',
    });
  });

  it('caches checks per permission and project', async () => {
    const can = vi.fn(async () => true);
    const isVisible = createEventVisibility('org-1', can);

    await isVisible(secretCreated);
    await isVisible({ ...secretCreated, event: { ...secretCreated.event, id: 'event-2' } });

    expect(can).toHaveBeenCalledTimes(1);
  });

  it('hides events of other organizations, unknown types and failed checks', async () => {
    const isVisible = createEventVisibility('org-2', async () => true);
    const failing = createEventVisibility('org-1', async () => {
      throw new Error('boom');
    });

    await expect(isVisible(secretCreated)).resolves.toBe(false);
    await expect(
      createEventVisibility('org-1', async () => true)(logged({ type: 'unknown.event' as never })),
    ).resolves.toBe(false);
    await expect(failing(secretCreated)).resolves.toBe(false);
  });
});

describe('toEventView', () => {
  const lookups = {
    usernames: new Map([['user-1', 'ana']]),
    projectNames: new Map([['project-1', 'Shop']]),
    apiKeyNames: new Map([['key-1', 'CI']]),
  };

  it('resolves the actor, project and catalog fields, never secret values', () => {
    const view = toEventView(secretCreated, lookups);

    expect(view).toMatchObject({
      id: 'event-1',
      module: 'vault',
      label: 'events.vault.secret.created.label',
      actor: { kind: 'user', name: 'ana' },
      project: { id: 'project-1', name: 'Shop' },
      ack: null,
    });
    expect(view?.fields).toEqual([
      { label: 'events.vault.secret.created.fields.key', value: 'DB_PASSWORD' },
      { label: 'events.vault.secret.created.fields.environmentIds', value: 'env-prod' },
      { label: 'events.vault.secret.created.fields.folderPath', value: '/' },
    ]);
  });

  it('shows API key and system actors and the acknowledgement', () => {
    const byKey = toEventView(
      logged(
        { ...projectUpdated.event, actor: { kind: 'api_key', apiKeyId: 'key-1', projectId: null } },
        { userId: 'user-2', username: 'bob', at: '2026-11-20T11:00:00.000Z' },
      ),
      lookups,
    );
    const bySystem = toEventView(
      logged({ ...projectUpdated.event, actor: { kind: 'system' } }),
      lookups,
    );

    expect(byKey?.actor).toEqual({ kind: 'api_key', name: 'CI' });
    expect(byKey?.ack).toEqual({ username: 'bob', at: '2026-11-20T11:00:00.000Z' });
    expect(bySystem?.actor).toEqual({ kind: 'system', name: null });
  });

  it('resolves reference fields to names', () => {
    const view = toEventView(projectUpdated, lookups);

    expect(view?.fields[0]).toEqual({
      label: 'events.project.updated.fields.projectId',
      value: 'Shop',
    });
  });
});

describe('filters', () => {
  it('parses status and module filters, ignoring unknown values', () => {
    expect(parseStatusFilter('pending')).toBe('pending');
    expect(parseStatusFilter('nope')).toBe('all');
    expect(parseModuleFilter('vault')).toBe('vault');
    expect(parseModuleFilter('nope')).toBeNull();
  });
});
