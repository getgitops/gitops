import { describe, expect, it } from 'vitest';
import { RoleDomain } from './role.domain';
import {
  ORGANIZATION_ADMIN_PERMISSIONS,
  ORGANIZATION_DEVELOPER_PERMISSIONS,
} from './role-permissions.data';

function role(permissions: string[], scope: 'organization' | 'project' = 'organization') {
  return new RoleDomain({
    id: 'role-1',
    name: 'Role',
    slug: 'role',
    scope,
    organizationId: 'org-1',
    permissions,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
}

describe('RoleDomain.isAutoProvisionable', () => {
  it('accepts Org Developer and read-only roles', () => {
    expect(role(ORGANIZATION_DEVELOPER_PERMISSIONS).isAutoProvisionable).toBe(true);
    expect(role(['organization:audit:read', 'organization:users:read']).isAutoProvisionable).toBe(
      true,
    );
  });

  it('rejects Org Admin', () => {
    expect(role(ORGANIZATION_ADMIN_PERMISSIONS).isAutoProvisionable).toBe(false);
  });

  it.each([
    'organization:users:invite',
    'organization:users:update',
    'organization:roles:create',
    'organization:settings:update',
    'organization:backups:all',
    'organization:server-keys:create',
    'organization:projects:delete',
    'organization:projects:all',
  ])('rejects a role that also grants %s', (grant) => {
    expect(role([...ORGANIZATION_DEVELOPER_PERMISSIONS, grant]).isAutoProvisionable).toBe(false);
  });

  it('rejects non-organization roles', () => {
    expect(role(['project:project:read'], 'project').isAutoProvisionable).toBe(false);
  });
});
