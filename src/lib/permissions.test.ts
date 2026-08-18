import { describe, expect, it } from 'vitest';
import {
  can,
  hasPermission,
  isValidPermissionGrant,
  togglePermissionAction,
  toggleSectionAll,
  isSectionFullyGranted,
} from './permissions';

// Fixture roles/users mirroring the RBAC spec: an admin with full access, a developer
// with read/create/update (no delete), and a role scoped to a single section only.
const adminUser = {
  role: { permissions: ['vault:all', 'openreport:all', 'stateiac:all'] },
};

const developerUser = {
  role: {
    permissions: [
      'vault:read',
      'vault:create',
      'vault:update',
      'openreport:read',
      'openreport:create',
      'openreport:update',
      'stateiac:read',
      'stateiac:create',
      'stateiac:update',
    ],
  },
};

const vaultOnlyUser = {
  role: { permissions: ['vault:all'] },
};

const noRoleUser = { role: null };

describe('hasPermission', () => {
  it('denies by default when there are no grants', () => {
    expect(hasPermission([], 'vault:read')).toBe(false);
    expect(hasPermission(null, 'vault:read')).toBe(false);
    expect(hasPermission(undefined, 'vault:read')).toBe(false);
  });

  it('matches an exact grant', () => {
    expect(hasPermission(['vault:read'], 'vault:read')).toBe(true);
    expect(hasPermission(['vault:read'], 'vault:delete')).toBe(false);
  });

  it('honors the section:all shortcut', () => {
    expect(hasPermission(['vault:all'], 'vault:read')).toBe(true);
    expect(hasPermission(['vault:all'], 'vault:delete')).toBe(true);
    expect(hasPermission(['vault:all'], 'openreport:read')).toBe(false);
  });
});

describe('can', () => {
  it('grants admin every action in every section', () => {
    for (const permission of [
      'vault:read',
      'vault:create',
      'vault:update',
      'vault:delete',
      'openreport:delete',
      'stateiac:delete',
    ] as const) {
      expect(can(adminUser, permission)).toBe(true);
    }
  });

  it('grants developer read/create/update but never delete, across all sections', () => {
    for (const section of ['vault', 'openreport', 'stateiac'] as const) {
      expect(can(developerUser, `${section}:read`)).toBe(true);
      expect(can(developerUser, `${section}:create`)).toBe(true);
      expect(can(developerUser, `${section}:update`)).toBe(true);
      expect(can(developerUser, `${section}:delete`)).toBe(false);
    }
  });

  it('scopes a single-section role to only that section', () => {
    expect(can(vaultOnlyUser, 'vault:read')).toBe(true);
    expect(can(vaultOnlyUser, 'vault:delete')).toBe(true);
    expect(can(vaultOnlyUser, 'openreport:read')).toBe(false);
    expect(can(vaultOnlyUser, 'stateiac:read')).toBe(false);
  });

  it('denies a user with no role', () => {
    expect(can(noRoleUser, 'vault:read')).toBe(false);
  });

  it('denies a null/undefined user', () => {
    expect(can(null, 'vault:read')).toBe(false);
    expect(can(undefined, 'vault:read')).toBe(false);
  });
});

describe('isValidPermissionGrant', () => {
  it('accepts every concrete section:action and section:all combination', () => {
    expect(isValidPermissionGrant('vault:read')).toBe(true);
    expect(isValidPermissionGrant('stateiac:delete')).toBe(true);
    expect(isValidPermissionGrant('openreport:all')).toBe(true);
  });

  it('rejects unknown sections, actions, or malformed strings', () => {
    expect(isValidPermissionGrant('vault:frobnicate')).toBe(false);
    expect(isValidPermissionGrant('unknown-section:read')).toBe(false);
    expect(isValidPermissionGrant('vault')).toBe(false);
    expect(isValidPermissionGrant('*')).toBe(false);
  });
});

describe('togglePermissionAction', () => {
  it('adds and removes an individual grant', () => {
    let permissions: string[] = [];
    permissions = togglePermissionAction(permissions, 'vault', 'read');
    expect(permissions).toEqual(['vault:read']);

    permissions = togglePermissionAction(permissions, 'vault', 'read');
    expect(permissions).toEqual([]);
  });

  it('expands section:all into explicit grants when unchecking one action', () => {
    const permissions = togglePermissionAction(['vault:all'], 'vault', 'delete');
    expect(permissions.sort()).toEqual(['vault:create', 'vault:read', 'vault:update'].sort());
  });
});

describe('toggleSectionAll', () => {
  it('collapses explicit grants into the all shortcut and clears other sections untouched', () => {
    const permissions = toggleSectionAll(['vault:read', 'openreport:read'], 'vault');
    expect(permissions.sort()).toEqual(['openreport:read', 'vault:all'].sort());
  });

  it('clears the section entirely when toggled off', () => {
    const permissions = toggleSectionAll(['vault:all', 'openreport:read'], 'vault');
    expect(permissions).toEqual(['openreport:read']);
  });
});

describe('isSectionFullyGranted', () => {
  it('reports true only when the all shortcut is present', () => {
    expect(isSectionFullyGranted(['vault:all'], 'vault')).toBe(true);
    expect(isSectionFullyGranted(['vault:read', 'vault:create', 'vault:update', 'vault:delete'], 'vault')).toBe(
      false,
    );
  });
});
